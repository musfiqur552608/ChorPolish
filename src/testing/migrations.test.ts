import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '@/config/game';

const MIGRATIONS_DIR = resolve(process.cwd(), 'supabase', 'migrations');
const read = (file: string) => readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8');

/** Strip SQL comments so assertions check statements, not prose. */
function withoutComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
}

const INIT = '20261023000100_init.sql';
const RPCS = '20261023000200_game_rpcs.sql';
const MANUAL = '20261024000400_manual_flow.sql';
const CLEANUP = '20261024000500_scheduled_cleanup.sql';
const END = '20261024000600_end_of_room_cleanup.sql';

describe('migration set', () => {
  it('ships every required migration in order and no unsafe 003 draft', () => {
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    for (const file of [INIT, RPCS, MANUAL, CLEANUP, END]) {
      expect(files).toContain(file);
    }
    expect(files.indexOf(INIT)).toBeLessThan(files.indexOf(RPCS));
    expect(files.indexOf(RPCS)).toBeLessThan(files.indexOf(MANUAL));
    expect(files.indexOf(MANUAL)).toBeLessThan(files.indexOf(CLEANUP));
    expect(files.indexOf(CLEANUP)).toBeLessThan(files.indexOf(END));
    expect(existsSync(resolve(MIGRATIONS_DIR, '20261023000300_cleanup_migration.sql'))).toBe(false);
  });
});

describe('secret tables (001)', () => {
  const init = read(INIT);

  it('locks round_roles and rounds behind RLS with no client grants', () => {
    expect(init).toMatch(/alter table public\.round_roles enable row level security;/);
    expect(init).toMatch(/alter table public\.rounds enable row level security;/);
    expect(init).not.toMatch(/on public\.round_roles\s+for\s+select/i);
    expect(init).not.toMatch(/on public\.rounds\s+for\s+select/i);
    expect(init).toMatch(/revoke all on table public\.round_roles from anon, authenticated;/i);
    expect(init).toMatch(/revoke all on table public\.rounds from anon, authenticated;/i);
    expect(init).not.toMatch(/grant select on table public\.round_roles/i);
    expect(init).not.toMatch(/grant select on table public\.rounds/i);
  });

  it('keeps secret tables out of the realtime publication', () => {
    expect(init).not.toMatch(/alter publication supabase_realtime add table public\.round_roles/i);
    expect(init).not.toMatch(/alter publication supabase_realtime add table public\.rounds;/i);
  });

  it('uses REPLICA IDENTITY FULL on the public realtime tables only', () => {
    for (const table of ['rooms', 'players', 'round_results', 'reactions']) {
      expect(init).toContain(`alter table public.${table} replica identity full;`);
    }
    expect(init).not.toContain('alter table public.round_roles replica identity full;');
  });

  it('cascades room deletion to every child table', () => {
    expect(init).toContain('room_id uuid not null references public.rooms (id) on delete cascade');
    // players, rounds, round_roles, round_results, reactions
    const cascades = init.match(/references public\.rooms \(id\) on delete cascade/g) ?? [];
    expect(cascades.length).toBeGreaterThanOrEqual(5);
  });

  it('uses zero-based slots, matching GAME_CONFIG.slots', () => {
    expect(init).toContain('check (slot between 0 and 3)');
    expect(Math.min(...GAME_CONFIG.slots)).toBe(0);
    expect(Math.max(...GAME_CONFIG.slots)).toBe(3);
  });
});

describe('authoritative RPCs (002)', () => {
  const rpcs = read(RPCS);

  it('hard-deletes the room on explicit leave', () => {
    const start = rpcs.indexOf('create or replace function public.leave_room');
    const end = rpcs.indexOf('-- ── Safety net', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const body = rpcs.slice(start, end);
    expect(body).toContain('delete from public.rooms where id = p_room_id;');
    expect(body).not.toContain("finished_reason = 'left'");
  });

  it('cleans idle and abandoned rooms', () => {
    expect(rpcs).toContain("interval '30 minutes'");
    expect(rpcs).toMatch(/cleanup_at\s*<=\s*now\(\)/);
  });

  it('keeps finalize_room and cleanup_rooms server-only', () => {
    expect(rpcs).toMatch(
      /revoke all on function public\.finalize_room\(uuid, text\) from public, anon, authenticated;/i,
    );
    expect(rpcs).toMatch(
      /revoke all on function public\.cleanup_rooms\(\) from public, anon, authenticated;/i,
    );
  });

  it('exposes own roles only through round_roles.player_id', () => {
    expect(rpcs).toContain('where rr.round_id = v_round.id and rr.player_id = v_me.id');
  });

  it('mirrors the client point table and target parity', () => {
    for (const [role, points] of Object.entries(GAME_CONFIG.points)) {
      expect(rpcs).toContain(`when '${role}' then ${points}`);
    }
    expect(rpcs).toContain("p_round % 2 = 1 then 'CHOR'");
  });
});

describe('manual flow (004)', () => {
  const manual = read(MANUAL);

  it('gates public Babu and Police on their rise timestamps', () => {
    expect(manual).toContain('v_round.babu_risen_at is not null');
    expect(manual).toContain('v_round.police_risen_at is not null');
    expect(manual).toContain("rr.role = 'BABU'");
    expect(manual).toContain("rr.role = 'POLICE'");
  });

  it('stops auto-advancing the manual reveal phases', () => {
    expect(manual).toMatch(/elsif v_round\.phase = 'BABU_REVEAL' then/);
    expect(manual).toMatch(/set phase_deadline = null/);
    expect(manual).toContain("perform public.finalize_room(p_room_id, 'abandoned');");
  });

  it('routes police_rise into POLICE_GUESS', () => {
    expect(manual).toMatch(/create or replace function public\.police_rise/);
    expect(manual).toMatch(/phase = 'POLICE_GUESS'/);
  });
});

describe('scheduled cleanup (005)', () => {
  const cleanup = read(CLEANUP);
  const cleanupCode = withoutComments(cleanup);

  it('schedules the audited function instead of deleting rows itself', () => {
    expect(cleanupCode).toContain("'select public.cleanup_rooms();'");
    expect(cleanupCode).toContain("'chor-police-cleanup-rooms'");
    expect(cleanupCode).not.toMatch(/delete\s+from\s+public\./i);
  });

  it('degrades to a notice when pg_cron is absent', () => {
    expect(cleanupCode).not.toMatch(/^\s*create\s+extension/im);
    expect(cleanupCode).toContain('pg_extension');
    expect(cleanupCode).toContain('raise notice');
  });

  it('never grants internal functions to public', () => {
    expect(cleanupCode).not.toMatch(/grant execute[\s\S]*?\bto public\b/i);
    expect(cleanupCode).toMatch(
      /revoke all on function public\.cleanup_rooms\(\) from public, anon, authenticated;/i,
    );
  });
});

describe('end-of-room deletion (006)', () => {
  const end = read(END);
  const endCode = withoutComments(end);

  it('starts the deletion window for every finalized room, not only abandoned ones', () => {
    expect(endCode).toContain("cleanup_at = now() + interval '120 seconds'");
    expect(endCode).not.toContain("p_reason = 'abandoned'");
  });

  it('deletes at cleanup_at, after finished_at, and for stuck final results', () => {
    expect(endCode).toMatch(/cleanup_at\s*<=\s*now\(\)/);
    expect(endCode).toMatch(/room\.status = 'finished'/);
    expect(endCode).toContain("finished_at < now() - interval '5 minutes'");
    expect(endCode).toContain("interval '10 minutes'");
    expect(endCode).toContain('r.round_number = room.total_rounds');
    expect(endCode).toContain('public.rounds r');
  });

  it('matches the client cleanup constants', () => {
    expect(endCode).toContain(`interval '${GAME_CONFIG.roomCleanupSeconds} seconds'`);
    expect(endCode).toContain(`interval '${GAME_CONFIG.finishedRoomDeleteMinutes} minutes'`);
    expect(endCode).toContain(`interval '${GAME_CONFIG.stuckFinalResultMinutes} minutes'`);
    expect(endCode).toContain(`interval '${GAME_CONFIG.inactiveRoomMinutes} minutes'`);
  });

  it('keeps finalize_room and cleanup_rooms server-only', () => {
    expect(endCode).toMatch(
      /revoke all on function public\.finalize_room\(uuid, text\) from public, anon, authenticated;/i,
    );
    expect(endCode).toMatch(
      /revoke all on function public\.cleanup_rooms\(\) from public, anon, authenticated;/i,
    );
  });
});
