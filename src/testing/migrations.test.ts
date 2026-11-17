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
const LEAVE = '20261024000700_leave_ends_match.sql';
const BOTS = '20261024000800_bots.sql';
const ADMIN = '20261117000900_admin_analytics.sql';

describe('migration set', () => {
  it('ships every required migration in order and no unsafe 003 draft', () => {
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    for (const file of [INIT, RPCS, MANUAL, CLEANUP, END, LEAVE, BOTS, ADMIN]) {
      expect(files).toContain(file);
    }
    expect(files.indexOf(INIT)).toBeLessThan(files.indexOf(RPCS));
    expect(files.indexOf(RPCS)).toBeLessThan(files.indexOf(MANUAL));
    expect(files.indexOf(MANUAL)).toBeLessThan(files.indexOf(CLEANUP));
    expect(files.indexOf(CLEANUP)).toBeLessThan(files.indexOf(END));
    expect(files.indexOf(END)).toBeLessThan(files.indexOf(LEAVE));
    expect(files.indexOf(LEAVE)).toBeLessThan(files.indexOf(BOTS));
    expect(files.indexOf(BOTS)).toBeLessThan(files.indexOf(ADMIN));
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

describe('leave ends match (007)', () => {
  const leave = read(LEAVE);
  const leaveCode = withoutComments(leave);

  it('finalizes a playing match instead of deleting the room', () => {
    expect(leaveCode).toContain("perform public.finalize_room(p_room_id, 'left');");
    expect(leaveCode).toMatch(/if v_room\.status = 'playing' then/);
  });

  it('keeps the leaver on the result for download', () => {
    expect(leaveCode).not.toContain('delete from public.players where room_id');
    expect(leaveCode).toContain("set is_online = false, disconnected_at = now()");
  });

  it('keeps lobby leave behavior unchanged', () => {
    expect(leaveCode).toMatch(/if v_room\.status = 'lobby' then/);
  });

  it('keeps leave_room behind authenticated grants only', () => {
    expect(leaveCode).toMatch(/grant execute on function public\.leave_room\(uuid\) to authenticated;/i);
  });
});

describe('computer players (008)', () => {
  const bots = read(BOTS);
  const botsCode = withoutComments(bots);

  it('allows bot rows without auth users but keeps humans authenticated', () => {
    expect(botsCode).toMatch(/alter table public\.players\s+alter column user_id drop not null;/);
    expect(botsCode).toContain('add column if not exists is_bot boolean not null default false;');
    expect(botsCode).toContain('players_bot_identity');
    expect(botsCode).toContain('(is_bot and user_id is null)');
    expect(botsCode).toContain('(not is_bot and user_id is not null)');
  });

  it('exposes isBot without widening the hidden-role window', () => {
    expect(botsCode).toContain("'isBot', p.is_bot,");
    expect(botsCode).toContain('v_round.babu_risen_at is not null');
    expect(botsCode).toContain('v_round.police_risen_at is not null');
    expect(botsCode).toContain("rr.role = 'BABU'");
    expect(botsCode).toContain("rr.role = 'POLICE'");
  });

  it('keeps fill/remove host-only and lobby-only', () => {
    expect(botsCode).toMatch(/create or replace function public\.fill_bots/);
    expect(botsCode).toMatch(/create or replace function public\.remove_bot/);
    expect(botsCode).toContain('if not public.is_room_host(p_room_id) then');
    expect(botsCode).toContain("if v_room.status <> 'lobby' then");
    expect(botsCode).toContain('delete from public.players where id = v_bot.id;');
  });

  it('starts a direct practice room with three computers', () => {
    expect(botsCode).toMatch(/create or replace function public\.create_practice_room/);
    expect(botsCode).toContain('perform public.fill_bots(v_room_id);');
    expect(botsCode).toContain('perform public.start_game(v_room_id);');
  });

  it('lets a human replace a computer in a bot-filled lobby', () => {
    expect(botsCode).toContain('where p.room_id = v_room.id and p.is_bot');
    expect(botsCode).toContain('delete from public.players where id = v_bot_id;');
    expect(botsCode).toContain("raise exception using message = 'ROOM_FULL';");
  });

  it('excludes computers from presence pauses and abandonment', () => {
    expect(botsCode).toMatch(/and not is_bot\s+and user_id <> v_user/);
    expect(botsCode).toMatch(/where room_id = p_room_id\s+and not is_bot\s+and not is_online/);
    expect(botsCode).toContain("and not is_bot\n        and not is_online\n        and coalesce(disconnected_at, last_seen_at) < now() - interval '90 seconds'");
  });

  it('drives bot turns from short server deadlines', () => {
    expect(botsCode).toMatch(/create or replace function public\.assign_slip/);
    expect(botsCode).toContain('v_next_bot := public.player_is_bot(v_next_picker);');
    expect(botsCode).toContain("when v_next_bot then interval '1300 milliseconds'");
    expect(botsCode).toMatch(/elsif v_round\.phase = 'BABU_REVEAL' then/);
    expect(botsCode).toMatch(/elsif v_round\.phase = 'POLICE_REVEAL' then/);
    expect(botsCode).toMatch(/elsif v_round\.phase = 'POLICE_GUESS' then/);
    expect(botsCode).toContain('perform public.assign_slip(v_round.id, v_auto_player, v_auto_slot);');
    expect(botsCode).toContain(`interval '${GAME_CONFIG.botPacingMs.draw} milliseconds'`);
    expect(botsCode).toContain(`interval '${GAME_CONFIG.botPacingMs.babuRise} milliseconds'`);
    expect(botsCode).toContain(`interval '${GAME_CONFIG.botPacingMs.babuAsk} milliseconds'`);
    expect(botsCode).toContain(`interval '${GAME_CONFIG.botPacingMs.policeRise} milliseconds'`);
    expect(botsCode).toContain(`interval '${GAME_CONFIG.botPacingMs.policeGuess} milliseconds'`);
    expect(botsCode).toContain(`interval '${GAME_CONFIG.botPacingMs.guessSuspense} milliseconds'`);
  });

  it('keeps internal helpers server-only and grants only public bot actions', () => {
    expect(botsCode).toMatch(
      /revoke all on function public\.player_is_bot\(uuid\) from public, anon, authenticated;/i,
    );
    expect(botsCode).toMatch(
      /revoke all on function public\.build_room_state\(uuid, uuid\) from public, anon, authenticated;/i,
    );
    expect(botsCode).toMatch(/grant execute on function public\.fill_bots\(uuid\) to authenticated;/i);
    expect(botsCode).toMatch(/grant execute on function public\.remove_bot\(uuid, uuid\) to authenticated;/i);
    expect(botsCode).toMatch(
      /grant execute on function public\.create_practice_room\(text, text, integer, uuid\) to authenticated;/i,
    );
    expect(botsCode).not.toMatch(/grant execute on function public\.build_room_state/i);
  });
});

describe('admin + analytics (009)', () => {
  const admin = read(ADMIN);
  const code = withoutComments(admin);

  it('keeps the admin allowlist SQL-only and protects every admin RPC', () => {
    expect(code).toMatch(/create table if not exists public\.admin_users/);
    expect(code).toContain('references auth.users (id) on delete cascade');
    expect(code).toContain('alter table public.admin_users enable row level security;');
    expect(code).toContain('revoke all on table public.admin_users from anon, authenticated;');
    expect(code).toContain('perform public.assert_admin();');
    expect(code).toContain("raise exception using message = 'UNAUTHENTICATED';");
    expect(code).toContain("raise exception using message = 'NOT_ADMIN';");
    expect(code).toContain('from public.admin_users where user_id = v_user');

    expect(code).toContain(
      'revoke all on function public.grant_admin(text, text) from public, anon, authenticated;',
    );
    expect(code).toContain(
      'revoke all on function public.revoke_admin(text) from public, anon, authenticated;',
    );
    expect(code).not.toMatch(/grant execute on function public\.grant_admin/i);
    expect(code).not.toMatch(/grant execute on function public\.revoke_admin/i);
  });

  it('exposes admin reads only to authenticated callers with server-side checks', () => {
    for (const signature of [
      'public.admin_session()',
      'public.admin_get_overview(text)',
      'public.admin_list_notices()',
      'public.admin_toggle_notice(uuid, boolean)',
      'public.admin_delete_notice(uuid)',
      'public.admin_get_seo()',
    ]) {
      expect(code).toContain(`grant execute on function ${signature} to authenticated;`);
      expect(code).toContain(`revoke all on function ${signature} from public, anon;`);
    }

    expect(code).toMatch(
      /grant execute on function public\.admin_save_notice\([\s\S]*?\) to authenticated;/,
    );
    expect(code).toMatch(
      /grant execute on function public\.admin_save_seo\([\s\S]*?\) to authenticated;/,
    );
    expect(code).not.toMatch(/grant execute on function public\.assert_admin/i);
    expect(code).not.toMatch(/grant execute on function public\.admin_period_stats/i);
    expect(code).not.toMatch(/grant execute on function public\.admin_pct_change/i);
  });

  it('keeps analytics pseudonymous and unreadable by clients', () => {
    const usersTable = code.slice(
      code.indexOf('create table if not exists public.analytics_users'),
      code.indexOf('create table if not exists public.analytics_visits'),
    );
    const visitsTable = code.slice(
      code.indexOf('create table if not exists public.analytics_visits'),
      code.indexOf('create table if not exists public.analytics_matches'),
    );
    const matchesTable = code.slice(
      code.indexOf('create table if not exists public.analytics_matches'),
      code.indexOf('create table if not exists public.analytics_player_sessions'),
    );
    const sessionsTable = code.slice(
      code.indexOf('create table if not exists public.analytics_player_sessions'),
      code.indexOf('alter table public.analytics_users'),
    );

    for (const table of [usersTable, visitsTable, matchesTable, sessionsTable]) {
      expect(table).not.toMatch(/\b(display_name|player_name|room_code)\b/i);
    }
    expect(usersTable).not.toMatch(/\b(name|code)\b/i);
    expect(matchesTable).not.toMatch(/\b(name|code)\b/i);
    expect(sessionsTable).not.toMatch(/\b(name|code)\b/i);

    for (const table of [
      'analytics_users',
      'analytics_visits',
      'analytics_matches',
      'analytics_player_sessions',
    ]) {
      expect(code).toContain(`alter table public.${table} enable row level security;`);
      expect(code).toContain(`revoke all on table public.${table} from anon, authenticated;`);
    }
  });

  it('records visits, matches and player-hours from triggers', () => {
    expect(code).toContain('after insert on public.players');
    expect(code).toContain('after update of status, started_at on public.rooms');
    expect(code).toContain('after update of status, finished_at on public.rooms');
    expect(code).toContain('before delete on public.rooms');
    expect(code).toContain('perform public.analytics_close_match(');
    expect(code).toMatch(/if new\.is_bot or new\.user_id is null then\s+return new;/);
    expect((code.match(/insert into public\.analytics_matches/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect((code.match(/insert into public\.analytics_player_sessions/g) ?? []).length).toBeGreaterThanOrEqual(
      3,
    );
    expect(code).toMatch(/on conflict \(room_id\) do update/);
    expect(code).toMatch(/on conflict \(room_id, user_id\) do nothing/);
  });

  it('backfills surviving rooms without storing names or room codes', () => {
    expect(code).toMatch(
      /insert into public\.analytics_users \([\s\S]*?select[\s\S]*?p\.user_id,[\s\S]*?from public\.players p/,
    );
    expect(code).toMatch(
      /insert into public\.analytics_visits \([\s\S]*?select p\.user_id, p\.room_id, p\.joined_at/,
    );
    expect(code).toMatch(
      /insert into public\.analytics_matches \([\s\S]*?select[\s\S]*?r\.id,[\s\S]*?from public\.rooms r/,
    );
    expect(code).not.toMatch(/insert into public\.analytics_[a-z_]+[\s\S]*?\b(room_code|player_name|display_name)\b/i);
  });

  it('publishes only live notices and SEO through one public RPC', () => {
    const publicRpc = code.slice(
      code.indexOf('create or replace function public.get_public_site_config()'),
      code.indexOf('create or replace function public.admin_period_stats'),
    );

    expect(publicRpc).toContain("'notice'");
    expect(publicRpc).toContain("'seo'");
    expect(publicRpc).toContain('where n.is_active');
    expect(publicRpc).toContain('n.starts_at <= now()');
    expect(publicRpc).toContain('(n.ends_at is null or n.ends_at > now())');
    expect(publicRpc).toContain('order by n.created_at desc');
    expect(publicRpc).toContain('limit 1');
    expect(publicRpc).not.toContain('admin_users');
    expect(publicRpc).not.toContain('created_by');
    expect(publicRpc).not.toContain('updated_by');

    expect(code).toContain('revoke all on function public.get_public_site_config() from public;');
    expect(code).toContain(
      'grant execute on function public.get_public_site_config() to anon, authenticated;',
    );
  });

  it('validates and mirrors notices before writing them', () => {
    expect(code).toContain("raise exception using message = 'INVALID_NOTICE';");
    expect(code).toContain("v_title_en := coalesce(nullif(v_title_en, ''), v_title_bn);");
    expect(code).toContain("v_title_bn := coalesce(nullif(v_title_bn, ''), v_title_en);");
    expect(code).toContain("v_body_en := coalesce(nullif(v_body_en, ''), v_body_bn);");
    expect(code).toContain("v_body_bn := coalesce(nullif(v_body_bn, ''), v_body_en);");
    expect(code).toContain('if v_ends_at is not null and v_ends_at <= v_starts_at then');
    expect(code).toContain("if v_tone not in ('info', 'success', 'warning') then");
    expect(code).toContain("raise exception using message = 'NOTICE_NOT_FOUND';");
    expect(code).toContain('order by n.is_active desc, n.created_at desc');
  });

  it('validates SEO and stores a singleton settings row', () => {
    expect(code).toContain("raise exception using message = 'INVALID_SEO';");
    expect(code).toContain("if v_twitter <> '' and v_twitter !~ '^[A-Za-z0-9_]{1,30}$' then");
    expect(code).toContain("if v_canonical <> '' and v_canonical !~* '^https?://[^[:space:]]+$' then");
    expect(code).toContain("if v_og_image <> '' and v_og_image !~* '^https?://[^[:space:]]+$' then");
    expect(code).toContain('insert into public.site_settings (');
    expect(code).toContain('on conflict (id) do update');
    expect(code).toContain('return public.admin_get_seo();');
    expect(code).toContain('where s.id = 1');
  });
});
