-- ═════════════════════════════════════════════════════════════════════════════
-- চোর পুলিশ · Chor Police
-- 001 · Schema, constraints, RLS and realtime
--
-- Security model in one paragraph:
--   Every mutation goes through a security-definer RPC. Base tables are
--   read-only to clients and only room members may SELECT them. The secret
--   `round_roles` table has NO select policy at all, so even a determined
--   client with the anon key and a valid session cannot read hidden roles.
--   A filtered JSON state builder is the only pathway that exposes a role,
--   and only when the game phase allows it.
-- ═════════════════════════════════════════════════════════════════════════════

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create type public.room_status as enum ('lobby', 'playing', 'finished');
create type public.game_phase as enum (
  'SHUFFLE',
  'DRAW',
  'HIDDEN_ROLES',
  'BABU_REVEAL',
  'POLICE_REVEAL',
  'BABU_ORDER',
  'POLICE_GUESS',
  'FINAL_REVEAL',
  'ROUND_RESULT',
  'MATCH_END'
);
create type public.player_role as enum ('BABU', 'POLICE', 'CHOR', 'DAKAT');
create type public.target_role as enum ('CHOR', 'DAKAT');

-- ── Rooms ────────────────────────────────────────────────────────────────────
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique
    check (code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$'),
  status public.room_status not null default 'lobby',
  total_rounds integer not null default 8 check (total_rounds between 1 and 30),
  current_round integer not null default 0 check (current_round between 0 and 30),
  host_player_id uuid,
  created_by uuid not null references auth.users (id) on delete cascade,
  create_request_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  finished_reason text check (finished_reason in ('completed', 'abandoned', 'left')),
  paused_at timestamptz,
  cleanup_at timestamptz,
  constraint rooms_one_request unique (created_by, create_request_id)
);

-- ── Players ──────────────────────────────────────────────────────────────────
create table public.players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 20),
  avatar text not null check (char_length(avatar) between 1 and 16),
  seat smallint not null check (seat between 1 and 4),
  is_host boolean not null default false,
  is_ready boolean not null default false,
  is_online boolean not null default true,
  last_seen_at timestamptz not null default now(),
  disconnected_at timestamptz,
  joined_at timestamptz not null default now(),
  total_score integer not null default 0,
  babu_count integer not null default 0,
  final_rank smallint,
  unique (room_id, user_id),
  unique (room_id, seat)
);

alter table public.rooms
  add constraint rooms_host_player_fk
  foreign key (host_player_id) references public.players (id) on delete set null;

create unique index players_one_host_per_room on public.players (room_id) where is_host;
create index players_user_id_idx on public.players (user_id);
create index players_room_idx on public.players (room_id, seat);

-- ── Rounds (public, non-secret columns only) ─────────────────────────────────
create table public.rounds (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  round_number integer not null check (round_number between 1 and 30),
  shuffler_id uuid not null references public.players (id) on delete cascade,
  target_role public.target_role not null,
  phase public.game_phase not null default 'SHUFFLE',
  draw_order uuid[] not null default '{}',
  active_picker_id uuid references public.players (id) on delete set null,
  phase_started_at timestamptz not null default now(),
  phase_deadline timestamptz,
  guess_player_id uuid references public.players (id) on delete set null,
  guess_locked_at timestamptz,
  guess_correct boolean,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (room_id, round_number)
);

create index rounds_room_number_idx on public.rounds (room_id, round_number desc);
create index rounds_deadline_idx on public.rounds (phase_deadline) where phase_deadline is not null;

-- ── The secret drawer ────────────────────────────────────────────────────────
-- No client can select this table. It is never added to the realtime
-- publication. Only security-definer functions read and write it.
create table public.round_roles (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  round_id uuid not null references public.rounds (id) on delete cascade,
  slot smallint not null check (slot between 0 and 3),
  role public.player_role not null,
  player_id uuid references public.players (id) on delete cascade,
  picked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (round_id, slot),
  unique (round_id, role),
  unique (round_id, player_id)
);

create index round_roles_round_idx on public.round_roles (round_id);
create index round_roles_player_idx on public.round_roles (player_id) where player_id is not null;

-- ── Published round results (inserted only at FINAL_REVEAL) ──────────────────
create table public.round_results (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  round_id uuid not null references public.rounds (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  role public.player_role not null,
  points integer not null check (points >= 0),
  created_at timestamptz not null default now(),
  unique (round_id, player_id),
  unique (round_id, role)
);

create index round_results_round_idx on public.round_results (round_id);
create index round_results_room_idx on public.round_results (room_id);

-- ── Ephemeral reactions ──────────────────────────────────────────────────────
create table public.reactions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  emoji text not null check (emoji in ('😂', '😱', '👏')),
  created_at timestamptz not null default now()
);

create index reactions_room_time_idx on public.reactions (room_id, created_at desc);

-- ── Shared utility trigger ───────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger rooms_updated_at
before update on public.rooms
for each row execute function public.set_updated_at();

-- ── Membership helpers (security definer to avoid recursive RLS) ────────────
create or replace function public.is_room_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.players
    where room_id = p_room_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.is_room_host(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.players
    where room_id = p_room_id
      and user_id = auth.uid()
      and is_host
  );
$$;

-- ── Row level security ───────────────────────────────────────────────────────
alter table public.rooms enable row level security;
alter table public.players enable row level security;
alter table public.rounds enable row level security;
alter table public.round_roles enable row level security;
alter table public.round_results enable row level security;
alter table public.reactions enable row level security;

create policy "members can read their room"
on public.rooms for select to authenticated
using (public.is_room_member(id));

create policy "members can read players at their table"
on public.players for select to authenticated
using (public.is_room_member(room_id));

-- Deliberately NO policy on `rounds` either. It carries the police's
-- `guess_correct` flag, which would reveal whether an accused player holds the
-- target role before FINAL_REVEAL. Clients receive round data only through
-- get_room_state()/sync_room(), which build a sanitized JSON projection.
--
-- Deliberately NO policy on round_roles. The drawer stays locked.
-- No insert/update/delete policies exist on any game table.

create policy "members can read finished round results"
on public.round_results for select to authenticated
using (public.is_room_member(room_id));

create policy "members can read reactions at their table"
on public.reactions for select to authenticated
using (public.is_room_member(room_id));

-- ── Privileges: read public tables, touch secrets not at all ────────────────
revoke all on table public.rooms from anon, authenticated;
revoke all on table public.players from anon, authenticated;
revoke all on table public.rounds from anon, authenticated;
revoke all on table public.round_roles from anon, authenticated;
revoke all on table public.round_results from anon, authenticated;
revoke all on table public.reactions from anon, authenticated;

grant select on table public.rooms to authenticated;
grant select on table public.players to authenticated;
grant select on table public.round_results to authenticated;
grant select on table public.reactions to authenticated;

revoke all on function public.is_room_member(uuid) from public, anon;
revoke all on function public.is_room_host(uuid) from public, anon;
grant execute on function public.is_room_member(uuid) to authenticated;
grant execute on function public.is_room_host(uuid) to authenticated;

-- ── Realtime ─────────────────────────────────────────────────────────────────
-- round_roles is intentionally absent. So is rounds: it holds secret-adjacent
-- guess data and is delivered only through the sanitized RPC projection.
-- Realtime Postgres Changes also respects the SELECT policies above.
-- REPLICA IDENTITY FULL lets delete events reach the other players while a
-- room is being wiped.
alter table public.rooms replica identity full;
alter table public.players replica identity full;
alter table public.round_results replica identity full;
alter table public.reactions replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.rooms;
    exception when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table public.players;
    exception when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table public.round_results;
    exception when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table public.reactions;
    exception when duplicate_object then null;
    end;
  end if;
end;
$$;

comment on table public.round_roles is
  'SECRET: server-only role assignments. No RLS policy, no grants, no realtime publication.';
comment on column public.rounds.target_role is
  'Public by design: the target alternates Chor/Dakat each round.';
comment on table public.round_results is
  'Public only after FINAL_REVEAL. Rows are inserted in the same transaction as the phase change.';
