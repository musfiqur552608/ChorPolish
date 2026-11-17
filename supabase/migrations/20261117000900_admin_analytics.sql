-- ═════════════════════════════════════════════════════════════════════════════
-- 009 · Admin access, play analytics, public notices and SEO
--
-- Security model
--   * Admins are ordinary Supabase Auth users listed in public.admin_users.
--     The table has RLS enabled, no policies and no client grants.
--   * Every admin read/write goes through a security-definer RPC that calls
--     public.assert_admin(). The browser only has the anon key.
--   * The admin browser session uses its own auth storage key, so signing in
--     as an admin never replaces a player's anonymous session.
--   * Analytics tables are append-only from triggers. They are not readable or
--     writable by clients. No room code is copied into analytics.
--   * Public notice/SEO data is exposed only through one read-only RPC.
--
-- Provisioning an admin (run once in the Supabase SQL editor):
--   1. Dashboard → Authentication → Users → Add user (email + password).
--   2. select public.grant_admin('you@example.com', 'Your name');
--   Both grant_admin() and revoke_admin() are revoked from anon/authenticated,
--   so they can only be run from the SQL editor/service role.
--
-- Analytics starts collecting when this migration is applied. Existing rooms
-- that still exist at that moment are backfilled; rooms already erased by the
-- cleanup job cannot be reconstructed.
-- ═════════════════════════════════════════════════════════════════════════════

-- ── Admin allowlist ──────────────────────────────────────────────────────────
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Admin'
    check (char_length(btrim(display_name)) between 1 and 60),
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;
revoke all on table public.admin_users from anon, authenticated;

comment on table public.admin_users is
  'Admin allowlist. No client policies/grants; access is only via security-definer RPCs.';

-- ── Persistent analytics ─────────────────────────────────────────────────────
-- These tables intentionally have no FK to auth.users or rooms: room rows are
-- erased after every match, while aggregate play history must survive.
create table if not exists public.analytics_users (
  user_id uuid primary key,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  visit_count integer not null default 0 check (visit_count >= 0),
  match_count integer not null default 0 check (match_count >= 0),
  seconds_played bigint not null default 0 check (seconds_played >= 0)
);

create table if not exists public.analytics_visits (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  room_id uuid not null,
  joined_at timestamptz not null default now(),
  unique (room_id, user_id)
);

create index if not exists analytics_visits_time_idx
  on public.analytics_visits (joined_at desc);
create index if not exists analytics_visits_user_time_idx
  on public.analytics_visits (user_id, joined_at desc);

create table if not exists public.analytics_matches (
  room_id uuid primary key,
  started_at timestamptz not null,
  ended_at timestamptz,
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  human_players smallint not null default 0 check (human_players between 0 and 4),
  bot_players smallint not null default 0 check (bot_players between 0 and 4),
  total_rounds smallint not null default 0 check (total_rounds between 0 and 30),
  rounds_completed smallint not null default 0 check (rounds_completed between 0 and 30),
  finished_reason text,
  is_solo boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists analytics_matches_started_idx
  on public.analytics_matches (started_at desc);
create index if not exists analytics_matches_ended_idx
  on public.analytics_matches (ended_at desc);

create table if not exists public.analytics_player_sessions (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  room_id uuid not null,
  joined_at timestamptz not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  seconds_played integer not null default 0 check (seconds_played >= 0),
  is_host boolean not null default false,
  unique (room_id, user_id)
);

create index if not exists analytics_sessions_started_idx
  on public.analytics_player_sessions (started_at desc);
create index if not exists analytics_sessions_user_started_idx
  on public.analytics_player_sessions (user_id, started_at desc);

alter table public.analytics_users enable row level security;
alter table public.analytics_visits enable row level security;
alter table public.analytics_matches enable row level security;
alter table public.analytics_player_sessions enable row level security;

revoke all on table public.analytics_users from anon, authenticated;
revoke all on table public.analytics_visits from anon, authenticated;
revoke all on table public.analytics_matches from anon, authenticated;
revoke all on table public.analytics_player_sessions from anon, authenticated;

comment on table public.analytics_users is
  'Pseudonymous lifetime counters keyed by Supabase auth uid. No names or room codes.';
comment on table public.analytics_visits is
  'One row per human join per room. Used for distinct-player period counts.';
comment on table public.analytics_matches is
  'One row per started match. Survives room cleanup so trends remain.';
comment on table public.analytics_player_sessions is
  'One row per human per started match. Used for player-hours.';

-- ── Admin check ──────────────────────────────────────────────────────────────
create or replace function public.assert_admin()
returns void
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception using message = 'UNAUTHENTICATED';
  end if;
  if not exists (
    select 1 from public.admin_users where user_id = auth.uid()
  ) then
    raise exception using message = 'NOT_ADMIN';
  end if;
end;
$$;

revoke all on function public.assert_admin() from public, anon, authenticated;

create or replace function public.admin_session()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_admin public.admin_users%rowtype;
  v_email text;
begin
  perform public.assert_admin();

  select * into v_admin from public.admin_users where user_id = v_user;
  select email into v_email from auth.users where id = v_user;

  return jsonb_build_object(
    'userId', v_user,
    'email', v_email,
    'displayName', v_admin.display_name,
    'createdAt', v_admin.created_at
  );
end;
$$;

revoke all on function public.admin_session() from public, anon;
grant execute on function public.admin_session() to authenticated;

-- ── SQL-editor-only admin provisioning ───────────────────────────────────────
create or replace function public.grant_admin(
  p_email text,
  p_display_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user uuid;
  v_name text;
begin
  if p_email is null or btrim(p_email) = '' then
    raise exception using message = 'INVALID_EMAIL';
  end if;

  select id into v_user
  from auth.users
  where lower(email) = lower(btrim(p_email))
  limit 1;

  if v_user is null then
    raise exception using message = 'AUTH_USER_NOT_FOUND';
  end if;

  v_name := left(
    coalesce(nullif(btrim(p_display_name), ''), split_part(btrim(p_email), '@', 1)),
    60
  );

  insert into public.admin_users (user_id, display_name)
  values (v_user, v_name)
  on conflict (user_id) do update set display_name = excluded.display_name;

  return v_user;
end;
$$;

revoke all on function public.grant_admin(text, text) from public, anon, authenticated;

create or replace function public.revoke_admin(p_email text)
returns boolean
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user uuid;
  v_deleted integer;
begin
  select id into v_user
  from auth.users
  where lower(email) = lower(btrim(p_email))
  limit 1;

  if v_user is null then
    return false;
  end if;

  delete from public.admin_users where user_id = v_user;
  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

revoke all on function public.revoke_admin(text) from public, anon, authenticated;

-- ── Analytics triggers ───────────────────────────────────────────────────────
create or replace function public.analytics_record_player_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.is_bot or new.user_id is null then
    return new;
  end if;

  insert into public.analytics_users (
    user_id, first_seen_at, last_seen_at, visit_count
  ) values (
    new.user_id, new.joined_at, new.joined_at, 1
  )
  on conflict (user_id) do update
  set
    last_seen_at = greatest(public.analytics_users.last_seen_at, excluded.last_seen_at),
    visit_count = public.analytics_users.visit_count + 1;

  insert into public.analytics_visits (user_id, room_id, joined_at)
  values (new.user_id, new.room_id, new.joined_at)
  on conflict (room_id, user_id) do nothing;

  return new;
end;
$$;

revoke all on function public.analytics_record_player_insert() from public, anon, authenticated;

create or replace function public.analytics_close_match(
  p_room_id uuid,
  p_ended_at timestamptz,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_started timestamptz;
  v_total_rounds smallint;
  v_humans integer := 0;
  v_bots integer := 0;
  v_rounds integer := 0;
  v_end timestamptz;
  v_duration integer;
begin
  select started_at, total_rounds
  into v_started, v_total_rounds
  from public.analytics_matches
  where room_id = p_room_id;

  if v_started is null then
    select coalesce(started_at, created_at), total_rounds
    into v_started, v_total_rounds
    from public.rooms
    where id = p_room_id;
  end if;

  if v_started is null then
    return;
  end if;

  v_end := greatest(coalesce(p_ended_at, now()), v_started);
  v_duration := greatest(0, extract(epoch from (v_end - v_started))::integer);

  select
    (count(*) filter (where not p.is_bot))::integer,
    (count(*) filter (where p.is_bot))::integer
  into v_humans, v_bots
  from public.players p
  where p.room_id = p_room_id;

  select count(distinct rr.round_id)::integer
  into v_rounds
  from public.round_results rr
  where rr.room_id = p_room_id;

  -- A match can be finalized after a page reload, or discovered by the delete
  -- trigger. Ensure every human has a session row before closing them.
  with new_sessions as (
    insert into public.analytics_player_sessions (
      user_id, room_id, joined_at, started_at, is_host
    )
    select
      p.user_id, p.room_id, p.joined_at, least(v_end, greatest(v_started, p.joined_at)), p.is_host
    from public.players p
    where p.room_id = p_room_id
      and not p.is_bot
      and p.user_id is not null
    on conflict (room_id, user_id) do nothing
    returning user_id
  )
  update public.analytics_users u
  set match_count = u.match_count + 1
  from new_sessions ns
  where u.user_id = ns.user_id;

  with closed as (
    update public.analytics_player_sessions s
    set
      ended_at = v_end,
      seconds_played = greatest(0, extract(epoch from (v_end - s.started_at))::integer)
    where s.room_id = p_room_id
      and s.ended_at is null
    returning s.user_id, s.seconds_played
  )
  update public.analytics_users u
  set
    seconds_played = u.seconds_played + closed.seconds_played,
    last_seen_at = greatest(u.last_seen_at, v_end)
  from closed
  where u.user_id = closed.user_id;

  insert into public.analytics_matches (
    room_id, started_at, ended_at, duration_seconds, human_players,
    bot_players, total_rounds, rounds_completed, finished_reason, is_solo
  ) values (
    p_room_id, v_started, v_end, v_duration, v_humans,
    v_bots, coalesce(v_total_rounds, 0), v_rounds, p_reason, v_humans <= 1
  )
  on conflict (room_id) do update
  set
    ended_at = coalesce(public.analytics_matches.ended_at, excluded.ended_at),
    duration_seconds = greatest(public.analytics_matches.duration_seconds, excluded.duration_seconds),
    human_players = greatest(public.analytics_matches.human_players, excluded.human_players),
    bot_players = greatest(public.analytics_matches.bot_players, excluded.bot_players),
    total_rounds = greatest(public.analytics_matches.total_rounds, excluded.total_rounds),
    rounds_completed = greatest(public.analytics_matches.rounds_completed, excluded.rounds_completed),
    finished_reason = coalesce(public.analytics_matches.finished_reason, excluded.finished_reason),
    is_solo = public.analytics_matches.is_solo and excluded.is_solo;
end;
$$;

revoke all on function public.analytics_close_match(uuid, timestamptz, text)
  from public, anon, authenticated;

create or replace function public.analytics_room_started()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_start timestamptz;
  v_humans integer := 0;
  v_bots integer := 0;
begin
  if new.status <> 'playing' then
    return new;
  end if;
  if old.status = 'playing' and old.started_at is not distinct from new.started_at then
    return new;
  end if;

  v_start := coalesce(new.started_at, now());

  select
    (count(*) filter (where not p.is_bot))::integer,
    (count(*) filter (where p.is_bot))::integer
  into v_humans, v_bots
  from public.players p
  where p.room_id = new.id;

  insert into public.analytics_matches (
    room_id, started_at, human_players, bot_players, total_rounds, is_solo
  ) values (
    new.id, v_start, v_humans, v_bots, new.total_rounds, v_humans <= 1
  )
  on conflict (room_id) do update
  set
    started_at = least(public.analytics_matches.started_at, excluded.started_at),
    human_players = greatest(public.analytics_matches.human_players, excluded.human_players),
    bot_players = greatest(public.analytics_matches.bot_players, excluded.bot_players),
    total_rounds = greatest(public.analytics_matches.total_rounds, excluded.total_rounds),
    is_solo = public.analytics_matches.is_solo and excluded.is_solo;

  insert into public.analytics_player_sessions (
    user_id, room_id, joined_at, started_at, is_host
  )
  select
    p.user_id, p.room_id, p.joined_at, greatest(v_start, p.joined_at), p.is_host
  from public.players p
  where p.room_id = new.id
    and not p.is_bot
    and p.user_id is not null
  on conflict (room_id, user_id) do nothing;

  update public.analytics_player_sessions
  set started_at = v_start
  where room_id = new.id and ended_at is null and started_at < v_start;

  if old.status is distinct from 'playing' then
    update public.analytics_users u
    set match_count = u.match_count + 1
    from public.analytics_player_sessions s
    where s.room_id = new.id
      and s.user_id = u.user_id;
  end if;

  return new;
end;
$$;

revoke all on function public.analytics_room_started() from public, anon, authenticated;

create or replace function public.analytics_room_finished()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'finished'
     and (old.status is distinct from 'finished' or old.finished_at is distinct from new.finished_at) then
    perform public.analytics_close_match(
      new.id,
      coalesce(new.finished_at, now()),
      coalesce(new.finished_reason, 'completed')
    );
  end if;
  return new;
end;
$$;

revoke all on function public.analytics_room_finished() from public, anon, authenticated;

create or replace function public.analytics_room_deleted()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.started_at is not null then
    perform public.analytics_close_match(
      old.id,
      coalesce(old.finished_at, now()),
      coalesce(old.finished_reason, 'deleted')
    );
  end if;
  return old;
end;
$$;

revoke all on function public.analytics_room_deleted() from public, anon, authenticated;

drop trigger if exists players_analytics_visit on public.players;
create trigger players_analytics_visit
after insert on public.players
for each row execute function public.analytics_record_player_insert();

drop trigger if exists rooms_analytics_started on public.rooms;
create trigger rooms_analytics_started
after update of status, started_at on public.rooms
for each row execute function public.analytics_room_started();

drop trigger if exists rooms_analytics_finished on public.rooms;
create trigger rooms_analytics_finished
after update of status, finished_at on public.rooms
for each row execute function public.analytics_room_finished();

drop trigger if exists rooms_analytics_deleted on public.rooms;
create trigger rooms_analytics_deleted
before delete on public.rooms
for each row execute function public.analytics_room_deleted();

-- ── Backfill whatever rooms still exist when this migration is applied ───────
insert into public.analytics_users (
  user_id, first_seen_at, last_seen_at, visit_count
)
select
  p.user_id,
  min(p.joined_at),
  max(p.joined_at),
  count(distinct p.room_id)::integer
from public.players p
where not p.is_bot and p.user_id is not null
group by p.user_id
on conflict (user_id) do nothing;

insert into public.analytics_visits (user_id, room_id, joined_at)
select p.user_id, p.room_id, p.joined_at
from public.players p
where not p.is_bot and p.user_id is not null
on conflict (room_id, user_id) do nothing;

insert into public.analytics_matches (
  room_id, started_at, ended_at, duration_seconds, human_players,
  bot_players, total_rounds, rounds_completed, finished_reason, is_solo
)
select
  r.id,
  coalesce(r.started_at, r.created_at),
  case when r.status = 'finished' then coalesce(r.finished_at, now()) end,
  case
    when r.status = 'finished'
      then greatest(0, extract(epoch from (coalesce(r.finished_at, now()) - coalesce(r.started_at, r.created_at)))::integer)
    else 0
  end,
  coalesce((
    select count(*)::integer from public.players p
    where p.room_id = r.id and not p.is_bot
  ), 0),
  coalesce((
    select count(*)::integer from public.players p
    where p.room_id = r.id and p.is_bot
  ), 0),
  r.total_rounds,
  coalesce((
    select count(distinct rr.round_id)::integer
    from public.round_results rr
    where rr.room_id = r.id
  ), 0),
  r.finished_reason,
  coalesce((
    select count(*)::integer from public.players p
    where p.room_id = r.id and not p.is_bot
  ), 0) <= 1
from public.rooms r
where r.started_at is not null
on conflict (room_id) do nothing;

insert into public.analytics_player_sessions (
  user_id, room_id, joined_at, started_at, is_host
)
select
  p.user_id,
  p.room_id,
  p.joined_at,
  greatest(coalesce(r.started_at, r.created_at), p.joined_at),
  p.is_host
from public.players p
join public.rooms r on r.id = p.room_id
where r.started_at is not null
  and not p.is_bot
  and p.user_id is not null
on conflict (room_id, user_id) do nothing;

update public.analytics_player_sessions s
set
  ended_at = m.ended_at,
  seconds_played = greatest(0, extract(epoch from (m.ended_at - s.started_at))::integer)
from public.analytics_matches m
where s.room_id = m.room_id
  and m.ended_at is not null
  and s.ended_at is null;

update public.analytics_users u
set
  seconds_played = coalesce((
    select sum(s.seconds_played)::bigint
    from public.analytics_player_sessions s
    where s.user_id = u.user_id and s.ended_at is not null
  ), 0),
  match_count = coalesce((
    select count(*)::integer
    from public.analytics_player_sessions s
    where s.user_id = u.user_id
  ), 0);

-- ── Notices ──────────────────────────────────────────────────────────────────
create table if not exists public.notices (
  id uuid primary key default gen_random_uuid(),
  title_en text not null check (char_length(btrim(title_en)) between 1 and 120),
  title_bn text not null check (char_length(btrim(title_bn)) between 1 and 120),
  body_en text not null check (char_length(btrim(body_en)) between 1 and 800),
  body_bn text not null check (char_length(btrim(body_bn)) between 1 and 800),
  tone text not null default 'info' check (tone in ('info', 'success', 'warning')),
  link_url text check (
    link_url is null or link_url ~* '^https?://[^[:space:]]+$'
  ),
  link_label_en text check (
    link_label_en is null or char_length(btrim(link_label_en)) between 1 and 60
  ),
  link_label_bn text check (
    link_label_bn is null or char_length(btrim(link_label_bn)) between 1 and 60
  ),
  is_active boolean not null default true,
  is_dismissible boolean not null default true,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notices_schedule_valid check (ends_at is null or ends_at > starts_at)
);

create index if not exists notices_active_idx
  on public.notices (is_active, starts_at desc, ends_at);

alter table public.notices enable row level security;
revoke all on table public.notices from anon, authenticated;

drop trigger if exists notices_updated_at on public.notices;
create trigger notices_updated_at
before update on public.notices
for each row execute function public.set_updated_at();

comment on table public.notices is
  'Admin-authored public notices. Clients read the active notice through get_public_site_config().';

-- ── Site-wide SEO settings (singleton row) ───────────────────────────────────
create table if not exists public.site_settings (
  id smallint primary key default 1 check (id = 1),
  seo_title text not null default 'চোর পুলিশ · Chor Police'
    check (char_length(btrim(seo_title)) between 1 and 120),
  seo_description text not null default
    'চোর পুলিশ — বন্ধুদের সাথে খেলা শৈশবের কাগজের খেলা। Four friends, four paper slips, one classic Bangladeshi childhood game.'
    check (char_length(btrim(seo_description)) between 1 and 320),
  seo_keywords text not null default
    'Chor Police, চোর পুলিশ, Bangladeshi games, childhood games, online party game, four player game'
    check (char_length(btrim(seo_keywords)) between 1 and 300),
  canonical_url text not null default ''
    check (canonical_url = '' or canonical_url ~* '^https?://[^[:space:]]+$'),
  og_image_url text not null default ''
    check (og_image_url = '' or og_image_url ~* '^https?://[^[:space:]]+$'),
  twitter_handle text not null default ''
    check (twitter_handle = '' or twitter_handle ~ '^[A-Za-z0-9_]{1,30}$'),
  noindex boolean not null default false,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.site_settings (id) values (1)
on conflict (id) do nothing;

drop trigger if exists site_settings_updated_at on public.site_settings;
create trigger site_settings_updated_at
before update on public.site_settings
for each row execute function public.set_updated_at();

alter table public.site_settings enable row level security;
revoke all on table public.site_settings from anon, authenticated;

comment on table public.site_settings is
  'Singleton SEO settings managed by admins and read through get_public_site_config().';

-- ── Public read RPC ──────────────────────────────────────────────────────────
create or replace function public.get_public_site_config()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'notice', (
      select jsonb_build_object(
        'id', n.id,
        'titleEn', n.title_en,
        'titleBn', n.title_bn,
        'bodyEn', n.body_en,
        'bodyBn', n.body_bn,
        'tone', n.tone,
        'linkUrl', n.link_url,
        'linkLabelEn', n.link_label_en,
        'linkLabelBn', n.link_label_bn,
        'isDismissible', n.is_dismissible,
        'updatedAt', n.updated_at
      )
      from public.notices n
      where n.is_active
        and n.starts_at <= now()
        and (n.ends_at is null or n.ends_at > now())
      order by n.created_at desc
      limit 1
    ),
    'seo', (
      select jsonb_build_object(
        'title', s.seo_title,
        'description', s.seo_description,
        'keywords', s.seo_keywords,
        'canonicalUrl', s.canonical_url,
        'ogImageUrl', s.og_image_url,
        'twitterHandle', s.twitter_handle,
        'noindex', s.noindex,
        'updatedAt', s.updated_at
      )
      from public.site_settings s
      where s.id = 1
    )
  );
$$;

revoke all on function public.get_public_site_config() from public;
grant execute on function public.get_public_site_config() to anon, authenticated;

comment on function public.get_public_site_config() is
  'Returns the currently live notice and public SEO settings. No admin data.';

-- ── Period stats + comparison helpers ────────────────────────────────────────
create or replace function public.admin_period_stats(
  p_start timestamptz,
  p_end timestamptz
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with visit_stats as (
    select count(distinct v.user_id)::bigint as players
    from public.analytics_visits v
    where v.joined_at >= p_start and v.joined_at < p_end
  ),
  new_players as (
    select count(*)::bigint as new_players
    from public.analytics_users u
    where u.first_seen_at >= p_start and u.first_seen_at < p_end
  ),
  match_stats as (
    select
      count(*)::bigint as matches,
      coalesce(sum(m.rounds_completed), 0)::bigint as rounds,
      coalesce(sum(m.duration_seconds), 0)::bigint as table_seconds
    from public.analytics_matches m
    where m.started_at >= p_start and m.started_at < p_end
  ),
  play_stats as (
    select coalesce(sum(s.seconds_played), 0)::bigint as player_seconds
    from public.analytics_player_sessions s
    where s.started_at >= p_start and s.started_at < p_end
  )
  select jsonb_build_object(
    'players', visit_stats.players,
    'newPlayers', new_players.new_players,
    'matches', match_stats.matches,
    'rounds', match_stats.rounds,
    'playerSeconds', play_stats.player_seconds,
    'tableSeconds', match_stats.table_seconds,
    'avgMatchSeconds', case
      when match_stats.matches = 0 then 0
      else round(match_stats.table_seconds::numeric / match_stats.matches)::bigint
    end
  )
  from visit_stats, new_players, match_stats, play_stats;
$$;

revoke all on function public.admin_period_stats(timestamptz, timestamptz)
  from public, anon, authenticated;

create or replace function public.admin_pct_change(
  p_current bigint,
  p_previous bigint
)
returns integer
language sql
immutable
as $$
  select case
    when p_previous = 0 and p_current = 0 then 0
    when p_previous = 0 then 100
    else round(((p_current - p_previous)::numeric * 100) / p_previous)::integer
  end;
$$;

revoke all on function public.admin_pct_change(bigint, bigint)
  from public, anon, authenticated;

-- ── Admin dashboard RPC ──────────────────────────────────────────────────────
create or replace function public.admin_get_overview(p_timezone text default 'UTC')
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := now();
  v_tz text := coalesce(nullif(btrim(p_timezone), ''), 'UTC');
  v_today_start timestamptz;
  v_week_start timestamptz;
  v_month_start timestamptz;
  v_year_start timestamptz;
  v_prev_today_start timestamptz;
  v_prev_week_start timestamptz;
  v_prev_month_start timestamptz;
  v_prev_year_start timestamptz;
  v_prev_today_end timestamptz;
  v_prev_week_end timestamptz;
  v_prev_month_end timestamptz;
  v_prev_year_end timestamptz;
  v_today jsonb;
  v_week jsonb;
  v_month jsonb;
  v_year jsonb;
  v_prev_today jsonb;
  v_prev_week jsonb;
  v_prev_month jsonb;
  v_prev_year jsonb;
  v_series jsonb;
  v_monthly jsonb;
  v_live_rooms jsonb;
  v_live_room_count integer := 0;
  v_lobby_rooms integer := 0;
  v_playing_rooms integer := 0;
  v_online_humans integer := 0;
  v_seated_humans integer := 0;
  v_bots integer := 0;
  v_analytics_since timestamptz;
begin
  perform public.assert_admin();

  if not exists (
    select 1 from pg_catalog.pg_timezone_names where name = v_tz
  ) then
    v_tz := 'UTC';
  end if;

  v_today_start := date_trunc('day', v_now at time zone v_tz) at time zone v_tz;
  v_week_start := date_trunc('week', v_now at time zone v_tz) at time zone v_tz;
  v_month_start := date_trunc('month', v_now at time zone v_tz) at time zone v_tz;
  v_year_start := date_trunc('year', v_now at time zone v_tz) at time zone v_tz;

  v_prev_today_start := date_trunc('day', (v_now - interval '1 day') at time zone v_tz) at time zone v_tz;
  v_prev_week_start := date_trunc('week', (v_now - interval '7 days') at time zone v_tz) at time zone v_tz;
  v_prev_month_start := date_trunc('month', (v_now - interval '1 month') at time zone v_tz) at time zone v_tz;
  v_prev_year_start := date_trunc('year', (v_now - interval '1 year') at time zone v_tz) at time zone v_tz;
  v_prev_today_end := v_now - interval '1 day';
  v_prev_week_end := v_now - interval '7 days';
  v_prev_month_end := v_now - interval '1 month';
  v_prev_year_end := v_now - interval '1 year';

  v_today := public.admin_period_stats(v_today_start, v_now);
  v_week := public.admin_period_stats(v_week_start, v_now);
  v_month := public.admin_period_stats(v_month_start, v_now);
  v_year := public.admin_period_stats(v_year_start, v_now);
  v_prev_today := public.admin_period_stats(v_prev_today_start, v_prev_today_end);
  v_prev_week := public.admin_period_stats(v_prev_week_start, v_prev_week_end);
  v_prev_month := public.admin_period_stats(v_prev_month_start, v_prev_month_end);
  v_prev_year := public.admin_period_stats(v_prev_year_start, v_prev_year_end);

  with days as (
    select generate_series(
      date_trunc('day', v_now at time zone v_tz) - interval '29 days',
      date_trunc('day', v_now at time zone v_tz),
      interval '1 day'
    ) as local_day
  ),
  visits as (
    select
      (v.joined_at at time zone v_tz)::date as day,
      count(distinct v.user_id)::bigint as players
    from public.analytics_visits v
    where v.joined_at >= ((date_trunc('day', v_now at time zone v_tz) - interval '29 days') at time zone v_tz)
      and v.joined_at < ((date_trunc('day', v_now at time zone v_tz) + interval '1 day') at time zone v_tz)
    group by 1
  ),
  new_players as (
    select
      (u.first_seen_at at time zone v_tz)::date as day,
      count(*)::bigint as new_players
    from public.analytics_users u
    where u.first_seen_at >= ((date_trunc('day', v_now at time zone v_tz) - interval '29 days') at time zone v_tz)
      and u.first_seen_at < ((date_trunc('day', v_now at time zone v_tz) + interval '1 day') at time zone v_tz)
    group by 1
  ),
  matches as (
    select
      (m.started_at at time zone v_tz)::date as day,
      count(*)::bigint as matches,
      coalesce(sum(m.duration_seconds), 0)::bigint as table_seconds
    from public.analytics_matches m
    where m.started_at >= ((date_trunc('day', v_now at time zone v_tz) - interval '29 days') at time zone v_tz)
      and m.started_at < ((date_trunc('day', v_now at time zone v_tz) + interval '1 day') at time zone v_tz)
    group by 1
  ),
  sessions as (
    select
      (s.started_at at time zone v_tz)::date as day,
      coalesce(sum(s.seconds_played), 0)::bigint as player_seconds
    from public.analytics_player_sessions s
    where s.started_at >= ((date_trunc('day', v_now at time zone v_tz) - interval '29 days') at time zone v_tz)
      and s.started_at < ((date_trunc('day', v_now at time zone v_tz) + interval '1 day') at time zone v_tz)
    group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'date', to_char(d.local_day, 'YYYY-MM-DD'),
    'players', coalesce(v.players, 0),
    'newPlayers', coalesce(n.new_players, 0),
    'matches', coalesce(m.matches, 0),
    'playerSeconds', coalesce(s.player_seconds, 0),
    'tableSeconds', coalesce(m.table_seconds, 0)
  ) order by d.local_day), '[]'::jsonb)
  into v_series
  from days d
  left join visits v on v.day = d.local_day::date
  left join new_players n on n.day = d.local_day::date
  left join matches m on m.day = d.local_day::date
  left join sessions s on s.day = d.local_day::date;

  with months as (
    select generate_series(
      date_trunc('month', v_now at time zone v_tz) - interval '11 months',
      date_trunc('month', v_now at time zone v_tz),
      interval '1 month'
    ) as local_month
  ),
  visits as (
    select
      date_trunc('month', v.joined_at at time zone v_tz) as month,
      count(distinct v.user_id)::bigint as players
    from public.analytics_visits v
    where v.joined_at >= ((date_trunc('month', v_now at time zone v_tz) - interval '11 months') at time zone v_tz)
      and v.joined_at < ((date_trunc('month', v_now at time zone v_tz) + interval '1 month') at time zone v_tz)
    group by 1
  ),
  new_players as (
    select
      date_trunc('month', u.first_seen_at at time zone v_tz) as month,
      count(*)::bigint as new_players
    from public.analytics_users u
    where u.first_seen_at >= ((date_trunc('month', v_now at time zone v_tz) - interval '11 months') at time zone v_tz)
      and u.first_seen_at < ((date_trunc('month', v_now at time zone v_tz) + interval '1 month') at time zone v_tz)
    group by 1
  ),
  matches as (
    select
      date_trunc('month', m.started_at at time zone v_tz) as month,
      count(*)::bigint as matches,
      coalesce(sum(m.duration_seconds), 0)::bigint as table_seconds
    from public.analytics_matches m
    where m.started_at >= ((date_trunc('month', v_now at time zone v_tz) - interval '11 months') at time zone v_tz)
      and m.started_at < ((date_trunc('month', v_now at time zone v_tz) + interval '1 month') at time zone v_tz)
    group by 1
  ),
  sessions as (
    select
      date_trunc('month', s.started_at at time zone v_tz) as month,
      coalesce(sum(s.seconds_played), 0)::bigint as player_seconds
    from public.analytics_player_sessions s
    where s.started_at >= ((date_trunc('month', v_now at time zone v_tz) - interval '11 months') at time zone v_tz)
      and s.started_at < ((date_trunc('month', v_now at time zone v_tz) + interval '1 month') at time zone v_tz)
    group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'month', to_char(mo.local_month, 'YYYY-MM'),
    'players', coalesce(v.players, 0),
    'newPlayers', coalesce(n.new_players, 0),
    'matches', coalesce(m.matches, 0),
    'playerSeconds', coalesce(s.player_seconds, 0),
    'tableSeconds', coalesce(m.table_seconds, 0)
  ) order by mo.local_month), '[]'::jsonb)
  into v_monthly
  from months mo
  left join visits v on v.month = mo.local_month
  left join new_players n on n.month = mo.local_month
  left join matches m on m.month = mo.local_month
  left join sessions s on s.month = mo.local_month;

  select
    (count(*) filter (where r.status = 'lobby'))::integer,
    (count(*) filter (where r.status = 'playing'))::integer,
    count(*)::integer
  into v_lobby_rooms, v_playing_rooms, v_live_room_count
  from public.rooms r
  where r.status in ('lobby', 'playing');

  select
    (count(*) filter (where not p.is_bot and p.is_online))::integer,
    (count(*) filter (where not p.is_bot))::integer,
    (count(*) filter (where p.is_bot))::integer
  into v_online_humans, v_seated_humans, v_bots
  from public.players p
  join public.rooms r on r.id = p.room_id
  where r.status in ('lobby', 'playing');

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', room.id,
    'code', room.code,
    'status', room.status,
    'phase', room.phase,
    'currentRound', room.current_round,
    'totalRounds', room.total_rounds,
    'humanPlayers', coalesce(room.human_players, 0),
    'onlinePlayers', coalesce(room.online_players, 0),
    'bots', coalesce(room.bots, 0),
    'createdAt', room.created_at,
    'startedAt', room.started_at,
    'elapsedSeconds', room.elapsed_seconds
  ) order by room.created_at desc), '[]'::jsonb)
  into v_live_rooms
  from (
    select
      r.id,
      r.code,
      r.status,
      case
        when r.status = 'lobby' then null
        else (
          select rd.phase
          from public.rounds rd
          where rd.room_id = r.id
          order by rd.round_number desc
          limit 1
        )
      end as phase,
      r.current_round,
      r.total_rounds,
      counts.human_players,
      counts.online_players,
      counts.bots,
      r.created_at,
      r.started_at,
      greatest(0, extract(epoch from (v_now - coalesce(r.started_at, r.created_at)))::integer) as elapsed_seconds
    from public.rooms r
    left join (
      select
        p.room_id,
        (count(*) filter (where not p.is_bot))::integer as human_players,
        (count(*) filter (where not p.is_bot and p.is_online))::integer as online_players,
        (count(*) filter (where p.is_bot))::integer as bots
      from public.players p
      group by p.room_id
    ) counts on counts.room_id = r.id
    where r.status in ('lobby', 'playing')
    order by r.created_at desc
    limit 12
  ) room;

  select min(u.first_seen_at) into v_analytics_since
  from public.analytics_users u;

  return jsonb_build_object(
    'generatedAt', v_now,
    'timezone', v_tz,
    'analyticsSince', v_analytics_since,
    'live', jsonb_build_object(
      'rooms', v_live_room_count,
      'lobbyRooms', v_lobby_rooms,
      'playingRooms', v_playing_rooms,
      'activeMatches', v_playing_rooms,
      'onlineHumans', v_online_humans,
      'seatedHumans', v_seated_humans,
      'bots', v_bots
    ),
    'periods', jsonb_build_object(
      'today', v_today || jsonb_build_object(
        'previous', v_prev_today,
        'comparison', jsonb_build_object(
          'players', public.admin_pct_change((v_today->>'players')::bigint, (v_prev_today->>'players')::bigint),
          'playerSeconds', public.admin_pct_change((v_today->>'playerSeconds')::bigint, (v_prev_today->>'playerSeconds')::bigint),
          'matches', public.admin_pct_change((v_today->>'matches')::bigint, (v_prev_today->>'matches')::bigint)
        )
      ),
      'week', v_week || jsonb_build_object(
        'previous', v_prev_week,
        'comparison', jsonb_build_object(
          'players', public.admin_pct_change((v_week->>'players')::bigint, (v_prev_week->>'players')::bigint),
          'playerSeconds', public.admin_pct_change((v_week->>'playerSeconds')::bigint, (v_prev_week->>'playerSeconds')::bigint),
          'matches', public.admin_pct_change((v_week->>'matches')::bigint, (v_prev_week->>'matches')::bigint)
        )
      ),
      'month', v_month || jsonb_build_object(
        'previous', v_prev_month,
        'comparison', jsonb_build_object(
          'players', public.admin_pct_change((v_month->>'players')::bigint, (v_prev_month->>'players')::bigint),
          'playerSeconds', public.admin_pct_change((v_month->>'playerSeconds')::bigint, (v_prev_month->>'playerSeconds')::bigint),
          'matches', public.admin_pct_change((v_month->>'matches')::bigint, (v_prev_month->>'matches')::bigint)
        )
      ),
      'year', v_year || jsonb_build_object(
        'previous', v_prev_year,
        'comparison', jsonb_build_object(
          'players', public.admin_pct_change((v_year->>'players')::bigint, (v_prev_year->>'players')::bigint),
          'playerSeconds', public.admin_pct_change((v_year->>'playerSeconds')::bigint, (v_prev_year->>'playerSeconds')::bigint),
          'matches', public.admin_pct_change((v_year->>'matches')::bigint, (v_prev_year->>'matches')::bigint)
        )
      )
    ),
    'series', v_series,
    'monthly', v_monthly,
    'liveRooms', v_live_rooms
  );
end;
$$;

revoke all on function public.admin_get_overview(text) from public, anon;
grant execute on function public.admin_get_overview(text) to authenticated;

-- ── Admin notice CRUD ────────────────────────────────────────────────────────
create or replace function public.admin_list_notices()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_notices jsonb;
begin
  perform public.assert_admin();

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', n.id,
    'titleEn', n.title_en,
    'titleBn', n.title_bn,
    'bodyEn', n.body_en,
    'bodyBn', n.body_bn,
    'tone', n.tone,
    'linkUrl', n.link_url,
    'linkLabelEn', n.link_label_en,
    'linkLabelBn', n.link_label_bn,
    'isActive', n.is_active,
    'isDismissible', n.is_dismissible,
    'isLive', n.is_active and n.starts_at <= now() and (n.ends_at is null or n.ends_at > now()),
    'startsAt', n.starts_at,
    'endsAt', n.ends_at,
    'createdAt', n.created_at,
    'updatedAt', n.updated_at
  ) order by n.is_active desc, n.created_at desc), '[]'::jsonb)
  into v_notices
  from public.notices n;

  return v_notices;
end;
$$;

revoke all on function public.admin_list_notices() from public, anon;
grant execute on function public.admin_list_notices() to authenticated;

create or replace function public.admin_save_notice(
  p_id uuid,
  p_title_en text,
  p_title_bn text,
  p_body_en text,
  p_body_bn text,
  p_tone text,
  p_link_url text,
  p_link_label_en text,
  p_link_label_bn text,
  p_is_active boolean,
  p_is_dismissible boolean,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_title_en text;
  v_title_bn text;
  v_body_en text;
  v_body_bn text;
  v_tone text := coalesce(nullif(btrim(p_tone), ''), 'info');
  v_link_url text := nullif(btrim(coalesce(p_link_url, '')), '');
  v_link_label_en text := nullif(btrim(coalesce(p_link_label_en, '')), '');
  v_link_label_bn text := nullif(btrim(coalesce(p_link_label_bn, '')), '');
  v_starts_at timestamptz := coalesce(p_starts_at, now());
  v_ends_at timestamptz := p_ends_at;
begin
  perform public.assert_admin();

  v_title_en := btrim(coalesce(p_title_en, ''));
  v_title_bn := btrim(coalesce(p_title_bn, ''));
  v_body_en := btrim(coalesce(p_body_en, ''));
  v_body_bn := btrim(coalesce(p_body_bn, ''));

  if v_title_en = '' and v_title_bn = '' then
    raise exception using message = 'INVALID_NOTICE';
  end if;
  if v_body_en = '' and v_body_bn = '' then
    raise exception using message = 'INVALID_NOTICE';
  end if;

  -- One language is enough; mirror it so both public locales always have copy.
  v_title_en := coalesce(nullif(v_title_en, ''), v_title_bn);
  v_title_bn := coalesce(nullif(v_title_bn, ''), v_title_en);
  v_body_en := coalesce(nullif(v_body_en, ''), v_body_bn);
  v_body_bn := coalesce(nullif(v_body_bn, ''), v_body_en);

  if char_length(v_title_en) > 120 or char_length(v_title_bn) > 120
     or char_length(v_body_en) > 800 or char_length(v_body_bn) > 800 then
    raise exception using message = 'INVALID_NOTICE';
  end if;

  if v_tone not in ('info', 'success', 'warning') then
    raise exception using message = 'INVALID_NOTICE';
  end if;

  if v_link_url is not null and v_link_url !~* '^https?://[^[:space:]]+$' then
    raise exception using message = 'INVALID_NOTICE';
  end if;

  if v_link_label_en is not null and char_length(v_link_label_en) > 60 then
    raise exception using message = 'INVALID_NOTICE';
  end if;
  if v_link_label_bn is not null and char_length(v_link_label_bn) > 60 then
    raise exception using message = 'INVALID_NOTICE';
  end if;

  if v_ends_at is not null and v_ends_at <= v_starts_at then
    raise exception using message = 'INVALID_NOTICE';
  end if;

  if p_id is null then
    insert into public.notices (
      title_en, title_bn, body_en, body_bn, tone, link_url,
      link_label_en, link_label_bn, is_active, is_dismissible,
      starts_at, ends_at, created_by
    ) values (
      v_title_en, v_title_bn, v_body_en, v_body_bn, v_tone, v_link_url,
      v_link_label_en, v_link_label_bn, coalesce(p_is_active, true),
      coalesce(p_is_dismissible, true), v_starts_at, v_ends_at, auth.uid()
    )
    returning id into v_id;
  else
    update public.notices
    set
      title_en = v_title_en,
      title_bn = v_title_bn,
      body_en = v_body_en,
      body_bn = v_body_bn,
      tone = v_tone,
      link_url = v_link_url,
      link_label_en = v_link_label_en,
      link_label_bn = v_link_label_bn,
      is_active = coalesce(p_is_active, is_active),
      is_dismissible = coalesce(p_is_dismissible, is_dismissible),
      starts_at = v_starts_at,
      ends_at = v_ends_at
    where id = p_id;

    if not found then
      raise exception using message = 'NOTICE_NOT_FOUND';
    end if;
    v_id := p_id;
  end if;

  return jsonb_build_object('id', v_id);
end;
$$;

revoke all on function public.admin_save_notice(
  uuid, text, text, text, text, text, text, text, text, boolean, boolean, timestamptz, timestamptz
) from public, anon;
grant execute on function public.admin_save_notice(
  uuid, text, text, text, text, text, text, text, text, boolean, boolean, timestamptz, timestamptz
) to authenticated;

create or replace function public.admin_toggle_notice(
  p_id uuid,
  p_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.assert_admin();

  update public.notices set is_active = p_is_active where id = p_id;
  if not found then
    raise exception using message = 'NOTICE_NOT_FOUND';
  end if;
end;
$$;

revoke all on function public.admin_toggle_notice(uuid, boolean) from public, anon;
grant execute on function public.admin_toggle_notice(uuid, boolean) to authenticated;

create or replace function public.admin_delete_notice(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.assert_admin();

  delete from public.notices where id = p_id;
  if not found then
    raise exception using message = 'NOTICE_NOT_FOUND';
  end if;
end;
$$;

revoke all on function public.admin_delete_notice(uuid) from public, anon;
grant execute on function public.admin_delete_notice(uuid) to authenticated;

-- ── Admin SEO RPCs ───────────────────────────────────────────────────────────
create or replace function public.admin_get_seo()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_seo jsonb;
begin
  perform public.assert_admin();

  select jsonb_build_object(
    'title', s.seo_title,
    'description', s.seo_description,
    'keywords', s.seo_keywords,
    'canonicalUrl', s.canonical_url,
    'ogImageUrl', s.og_image_url,
    'twitterHandle', s.twitter_handle,
    'noindex', s.noindex,
    'updatedAt', s.updated_at
  )
  into v_seo
  from public.site_settings s
  where s.id = 1;

  return coalesce(v_seo, '{}'::jsonb);
end;
$$;

revoke all on function public.admin_get_seo() from public, anon;
grant execute on function public.admin_get_seo() to authenticated;

create or replace function public.admin_save_seo(
  p_title text,
  p_description text,
  p_keywords text,
  p_canonical_url text,
  p_og_image_url text,
  p_twitter_handle text,
  p_noindex boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_title text := btrim(coalesce(p_title, ''));
  v_description text := btrim(coalesce(p_description, ''));
  v_keywords text := btrim(coalesce(p_keywords, ''));
  v_canonical text := btrim(coalesce(p_canonical_url, ''));
  v_og_image text := btrim(coalesce(p_og_image_url, ''));
  v_twitter text := ltrim(btrim(coalesce(p_twitter_handle, '')), '@');
begin
  perform public.assert_admin();

  if char_length(v_title) < 1 or char_length(v_title) > 120
     or char_length(v_description) < 1 or char_length(v_description) > 320
     or char_length(v_keywords) < 1 or char_length(v_keywords) > 300 then
    raise exception using message = 'INVALID_SEO';
  end if;

  if v_canonical <> '' and v_canonical !~* '^https?://[^[:space:]]+$' then
    raise exception using message = 'INVALID_SEO';
  end if;
  if v_og_image <> '' and v_og_image !~* '^https?://[^[:space:]]+$' then
    raise exception using message = 'INVALID_SEO';
  end if;
  if v_twitter <> '' and v_twitter !~ '^[A-Za-z0-9_]{1,30}$' then
    raise exception using message = 'INVALID_SEO';
  end if;

  insert into public.site_settings (
    id, seo_title, seo_description, seo_keywords, canonical_url,
    og_image_url, twitter_handle, noindex, updated_by
  ) values (
    1, v_title, v_description, v_keywords, v_canonical,
    v_og_image, v_twitter, coalesce(p_noindex, false), auth.uid()
  )
  on conflict (id) do update
  set
    seo_title = excluded.seo_title,
    seo_description = excluded.seo_description,
    seo_keywords = excluded.seo_keywords,
    canonical_url = excluded.canonical_url,
    og_image_url = excluded.og_image_url,
    twitter_handle = excluded.twitter_handle,
    noindex = excluded.noindex,
    updated_by = auth.uid();

  return public.admin_get_seo();
end;
$$;

revoke all on function public.admin_save_seo(
  text, text, text, text, text, text, boolean
) from public, anon;
grant execute on function public.admin_save_seo(
  text, text, text, text, text, text, boolean
) to authenticated;

-- ── Verification (manual) ────────────────────────────────────────────────────
-- select public.grant_admin('you@example.com', 'Your name');
-- select public.admin_session();  -- run in the browser console as an admin
-- select public.admin_get_overview('Asia/Dhaka');
-- select public.get_public_site_config();
