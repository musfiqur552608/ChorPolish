-- ═════════════════════════════════════════════════════════════════════════════
-- 008 · Computer players (bots)
--
-- Bots are ordinary rows in public.players with:
--   * user_id = null   (there is no auth user behind them)
--   * is_bot  = true   (the only way the server knows to play their turns)
--
-- Everything stays server-authoritative. Bots have no session and cannot call
-- an RPC. The host fills empty lobby seats with computers, and any member's
-- sync_room() call advances a bot turn once its short server deadline expires.
--
-- Flow:
--   lobby ──fill_bots()──▶ 4 ready players ──start_game()──▶ normal game
--   bot draw / Babu / Police turns are performed inside sync_room() with
--   short deadlines so humans can see each step before it moves on.
--
-- A human may still join a lobby that already contains computers: join_room()
-- removes the highest-seated bot and gives that chair to the human.
-- ═════════════════════════════════════════════════════════════════════════════

-- ── Schema: bots have no auth user, humans always do ─────────────────────────
alter table public.players
  alter column user_id drop not null;

alter table public.players
  add column if not exists is_bot boolean not null default false;

alter table public.players
  drop constraint if exists players_bot_identity;

alter table public.players
  add constraint players_bot_identity check (
    (is_bot and user_id is null)
    or (not is_bot and user_id is not null)
  );

create index if not exists players_bot_idx
  on public.players (room_id)
  where is_bot;

-- ── Internal: is this seat a computer? ───────────────────────────────────────
create or replace function public.player_is_bot(p_player_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select p.is_bot
    from public.players p
    where p.id = p_player_id
  ), false);
$$;

-- ── Sanitized state, now with a bot marker on each public player ─────────────
create or replace function public.build_room_state(
  p_room_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_room public.rooms%rowtype;
  v_me public.players%rowtype;
  v_round public.rounds%rowtype;
  v_has_round boolean := false;
  v_my_role public.player_role;
  v_public_roles jsonb := '{}'::jsonb;
  v_results jsonb := '[]'::jsonb;
  v_available_slots jsonb := '[]'::jsonb;
  v_picked_players jsonb := '[]'::jsonb;
  v_players_json jsonb := '[]'::jsonb;
  v_history_json jsonb := '[]'::jsonb;
  v_reactions_json jsonb := '[]'::jsonb;
  v_round_json jsonb := null;
begin
  select * into v_room from public.rooms where id = p_room_id;
  if not found then
    raise exception using message = 'ROOM_NOT_FOUND';
  end if;

  select * into v_me
  from public.players
  where room_id = p_room_id and user_id = p_user_id;

  if not found then
    raise exception using message = 'NOT_MEMBER';
  end if;

  select * into v_round
  from public.rounds
  where room_id = p_room_id
  order by round_number desc
  limit 1;

  v_has_round := found;

  if v_has_round then
    -- round_roles starts with player_id = null for every slip; assign_slip()
    -- fills it only when that player picks (the shuffler receives the last
    -- slip automatically). This therefore exposes the caller's own role only
    -- after their own pick, and never anybody else's.
    select rr.role into v_my_role
    from public.round_roles rr
    where rr.round_id = v_round.id and rr.player_id = v_me.id;

    if v_round.phase in ('FINAL_REVEAL', 'ROUND_RESULT')
       or (v_round.phase = 'MATCH_END' and v_round.resolved_at is not null) then
      select coalesce(jsonb_object_agg(rr.player_id::text, rr.role::text), '{}'::jsonb)
      into v_public_roles
      from public.round_roles rr
      where rr.round_id = v_round.id and rr.player_id is not null;
    else
      -- Babu stays hidden until Babu actually rises. Police stays hidden
      -- until Police actually raises a hand. This is the whole point of the
      -- manual flow; never widen these conditions without checking the UI.
      select coalesce(jsonb_object_agg(rr.player_id::text, rr.role::text), '{}'::jsonb)
      into v_public_roles
      from public.round_roles rr
      where rr.round_id = v_round.id
        and rr.player_id is not null
        and (
          (
            rr.role = 'BABU'
            and v_round.babu_risen_at is not null
            and v_round.phase in ('BABU_REVEAL', 'POLICE_REVEAL', 'BABU_ORDER', 'POLICE_GUESS')
          )
          or
          (
            rr.role = 'POLICE'
            and v_round.police_risen_at is not null
            and v_round.phase in ('POLICE_REVEAL', 'BABU_ORDER', 'POLICE_GUESS')
          )
        );
    end if;

    if v_round.phase in ('FINAL_REVEAL', 'ROUND_RESULT', 'MATCH_END') then
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'playerId', rr.player_id,
          'role', rr.role,
          'points', rr.points
        )
        order by p.seat
      ), '[]'::jsonb)
      into v_results
      from public.round_results rr
      join public.players p on p.id = rr.player_id
      where rr.round_id = v_round.id;
    end if;

    select coalesce(jsonb_agg(rr.slot order by rr.slot), '[]'::jsonb)
    into v_available_slots
    from public.round_roles rr
    where rr.round_id = v_round.id and rr.player_id is null;

    select coalesce(jsonb_agg(rr.player_id order by rr.picked_at), '[]'::jsonb)
    into v_picked_players
    from public.round_roles rr
    where rr.round_id = v_round.id and rr.player_id is not null;

    v_round_json := jsonb_build_object(
      'id', v_round.id,
      'number', v_round.round_number,
      'shufflerId', v_round.shuffler_id,
      'targetRole', v_round.target_role,
      'phase', v_round.phase,
      'activePickerId', case when v_round.phase = 'DRAW' then v_round.active_picker_id else null end,
      'phaseStartedAt', v_round.phase_started_at,
      'phaseDeadline', v_round.phase_deadline,
      'pickedPlayerIds', v_picked_players,
      'availableSlots', v_available_slots,
      'drawOrder', to_jsonb(v_round.draw_order),
      'guessPlayerId', v_round.guess_player_id,
      'guessCorrect', case
        when v_round.phase in ('FINAL_REVEAL', 'ROUND_RESULT', 'MATCH_END') then v_round.guess_correct
        else null
      end,
      'babuRisenAt', v_round.babu_risen_at,
      'policeCalledAt', v_round.police_called_at,
      'policeRisenAt', v_round.police_risen_at,
      'publicRoles', v_public_roles,
      'results', v_results
    );
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', p.id,
      'name', p.name,
      'avatar', p.avatar,
      'seat', p.seat,
      'isHost', p.is_host,
      'isBot', p.is_bot,
      'isReady', p.is_ready,
      'isOnline', p.is_online,
      'totalScore', p.total_score,
      'babuCount', p.babu_count,
      'finalRank', p.final_rank,
      'disconnectedAt', p.disconnected_at,
      'lastSeenAt', p.last_seen_at
    )
    order by p.seat
  ), '[]'::jsonb)
  into v_players_json
  from public.players p
  where p.room_id = p_room_id;

  select coalesce(jsonb_agg(q.round_json order by q.round_number), '[]'::jsonb)
  into v_history_json
  from (
    select
      r.round_number,
      jsonb_build_object(
        'id', r.id,
        'number', r.round_number,
        'shufflerId', r.shuffler_id,
        'targetRole', r.target_role,
        'guessPlayerId', r.guess_player_id,
        'guessCorrect', r.guess_correct,
        'finishedAt', coalesce(r.resolved_at, r.phase_started_at),
        'results', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'playerId', rr.player_id,
              'role', rr.role,
              'points', rr.points
            )
            order by p2.seat
          )
          from public.round_results rr
          join public.players p2 on p2.id = rr.player_id
          where rr.round_id = r.id
        ), '[]'::jsonb)
      ) as round_json
    from public.rounds r
    where r.room_id = p_room_id
      and exists (
        select 1 from public.round_results rr2 where rr2.round_id = r.id
      )
  ) q;

  select coalesce(jsonb_agg(q.reaction_json order by q.created_at), '[]'::jsonb)
  into v_reactions_json
  from (
    select
      jsonb_build_object(
        'id', rx.id,
        'playerId', rx.player_id,
        'emoji', rx.emoji,
        'createdAt', rx.created_at
      ) as reaction_json,
      rx.created_at
    from public.reactions rx
    where rx.room_id = p_room_id
      and rx.created_at > now() - interval '30 seconds'
    order by rx.created_at desc
    limit 12
  ) q;

  return jsonb_build_object(
    'serverNow', now(),
    'version', floor(extract(epoch from v_room.updated_at))::bigint,
    'room', jsonb_build_object(
      'id', v_room.id,
      'code', v_room.code,
      'status', v_room.status,
      'totalRounds', v_room.total_rounds,
      'currentRound', v_room.current_round,
      'phase', case when v_has_round then v_round.phase else null end,
      'hostPlayerId', v_room.host_player_id,
      'createdAt', v_room.created_at,
      'startedAt', v_room.started_at,
      'finishedAt', v_room.finished_at,
      'finishedReason', v_room.finished_reason,
      'cleanupAt', v_room.cleanup_at,
      'pausedAt', v_room.paused_at,
      'stateVersion', v_room.state_version,
      'serverNow', now()
    ),
    'me', jsonb_build_object(
      'id', v_me.id,
      'isHost', v_me.is_host,
      'role', v_my_role
    ),
    'players', v_players_json,
    'round', v_round_json,
    'history', v_history_json,
    'reactions', v_reactions_json
  );
end;
$$;

-- ── A bot picks a slip without a 40-second human clock ───────────────────────
create or replace function public.assign_slip(
  p_round_id uuid,
  p_player_id uuid,
  p_slot integer
)
returns void
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_round public.rounds%rowtype;
  v_slot integer := p_slot;
  v_picks integer;
  v_next_picker uuid;
  v_next_bot boolean := false;
  v_remaining_slot integer;
begin
  select * into v_round from public.rounds where id = p_round_id for update;
  if not found then
    raise exception using message = 'ROUND_NOT_FOUND';
  end if;
  if v_round.phase <> 'DRAW' and v_round.phase <> 'SHUFFLE' then
    raise exception using message = 'WRONG_PHASE';
  end if;

  -- Retrying the same tap is safe.
  if exists (
    select 1 from public.round_roles
    where round_id = p_round_id and player_id = p_player_id
  ) then
    return;
  end if;

  if p_player_id = v_round.shuffler_id then
    raise exception using message = 'NOT_YOUR_TURN';
  end if;

  if v_slot is null then
    select slot into v_slot
    from public.round_roles
    where round_id = p_round_id and player_id is null
    order by gen_random_bytes(4)
    limit 1;
  end if;

  if v_slot is null or v_slot < 0 or v_slot > 3 then
    raise exception using message = 'SLOT_TAKEN';
  end if;

  update public.round_roles
  set player_id = p_player_id, picked_at = now()
  where round_id = p_round_id and slot = v_slot and player_id is null;

  if not found then
    raise exception using message = 'SLOT_TAKEN';
  end if;

  select count(*) into v_picks
  from public.round_roles
  where round_id = p_round_id
    and player_id is not null
    and player_id <> v_round.shuffler_id;

  if v_picks < 3 then
    v_next_picker := v_round.draw_order[v_picks + 1];
    v_next_bot := public.player_is_bot(v_next_picker);
    update public.rounds
    set
      phase = 'DRAW',
      active_picker_id = v_next_picker,
      phase_started_at = now(),
      phase_deadline = now() + case
        when v_next_bot then interval '1300 milliseconds'
        else interval '40 seconds'
      end
    where id = p_round_id;
  else
    -- The shuffler takes the final slip, exactly like the original game.
    select slot into v_remaining_slot
    from public.round_roles
    where round_id = p_round_id and player_id is null
    limit 1;

    if v_remaining_slot is not null then
      update public.round_roles
      set player_id = v_round.shuffler_id, picked_at = now()
      where round_id = p_round_id and slot = v_remaining_slot;
    end if;

    update public.rounds
    set
      phase = 'HIDDEN_ROLES',
      active_picker_id = null,
      phase_started_at = now(),
      phase_deadline = now() + interval '1800 milliseconds'
    where id = p_round_id;
  end if;
end;
$$;

-- ── Start: computers are always ready and online ─────────────────────────────
create or replace function public.start_game(p_room_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public, extensions, auth, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_count integer;
  v_ready integer;
  v_online integer;
begin
  if v_user is null then raise exception using message = 'UNAUTHENTICATED'; end if;

  select * into v_room from public.rooms where id = p_room_id for update;
  if not found then raise exception using message = 'ROOM_NOT_FOUND'; end if;

  -- A repeated tap on Start is harmless.
  if v_room.status = 'playing' then
    return;
  end if;
  if v_room.status <> 'lobby' then
    raise exception using message = 'GAME_FINISHED';
  end if;
  if not public.is_room_host(p_room_id) then
    raise exception using message = 'NOT_HOST';
  end if;

  select
    count(*),
    count(*) filter (where is_ready),
    count(*) filter (
      where is_bot or (is_online and last_seen_at > now() - interval '40 seconds')
    )
  into v_count, v_ready, v_online
  from public.players
  where room_id = p_room_id;

  if v_count <> 4 then
    raise exception using message = 'NOT_ENOUGH_PLAYERS';
  end if;
  if v_ready <> 4 then
    raise exception using message = 'PLAYERS_NOT_READY';
  end if;
  if v_online <> 4 then
    raise exception using message = 'PLAYERS_OFFLINE';
  end if;

  update public.players
  set last_seen_at = now(), is_online = true
  where room_id = p_room_id and user_id = v_user;

  update public.rooms
  set
    status = 'playing',
    started_at = now(),
    current_round = 1,
    paused_at = null,
    updated_at = now()
  where id = p_room_id;

  perform public.begin_round(p_room_id, 1);
end;
$$;

-- ── Join: a human can take a computer's chair in the lobby ───────────────────
create or replace function public.join_room(
  p_code text,
  p_name text,
  p_avatar text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions, auth, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_existing public.players%rowtype;
  v_bot_id uuid;
  v_name text;
  v_avatar text;
  v_count integer;
  v_seat smallint;
begin
  if v_user is null then
    raise exception using message = 'UNAUTHENTICATED';
  end if;

  v_name := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_avatar := btrim(coalesce(p_avatar, ''));
  if char_length(v_name) < 1 or char_length(v_name) > 20 then
    raise exception using message = 'INVALID_NAME';
  end if;
  if char_length(v_avatar) < 1 or char_length(v_avatar) > 16 then
    raise exception using message = 'INVALID_NAME';
  end if;

  select * into v_room
  from public.rooms
  where code = upper(btrim(coalesce(p_code, '')))
  for update;

  if not found then
    raise exception using message = 'ROOM_NOT_FOUND';
  end if;

  select * into v_existing
  from public.players
  where room_id = v_room.id and user_id = v_user;

  if found then
    update public.players
    set is_online = true, last_seen_at = now(), disconnected_at = null
    where id = v_existing.id;
    update public.rooms set updated_at = now() where id = v_room.id;
    return jsonb_build_object('roomId', v_room.id, 'code', v_room.code);
  end if;

  if v_room.status = 'playing' then
    raise exception using message = 'GAME_STARTED';
  elsif v_room.status = 'finished' then
    raise exception using message = 'GAME_FINISHED';
  end if;

  select count(*) into v_count from public.players where room_id = v_room.id;
  if v_count >= 4 then
    -- Give the human the highest-seated computer's chair. A room full of
    -- humans stays full and is never silently broken.
    select p.id into v_bot_id
    from public.players p
    where p.room_id = v_room.id and p.is_bot
    order by p.seat desc
    limit 1;

    if v_bot_id is null then
      raise exception using message = 'ROOM_FULL';
    end if;

    delete from public.players where id = v_bot_id;
    v_count := v_count - 1;
  end if;

  select s.seat into v_seat
  from generate_series(1, 4) as s(seat)
  where not exists (
    select 1 from public.players p where p.room_id = v_room.id and p.seat = s.seat
  )
  order by s.seat
  limit 1;

  insert into public.players (room_id, user_id, name, avatar, seat, is_host, is_ready, is_online)
  values (v_room.id, v_user, v_name, v_avatar, coalesce(v_seat, 4), false, false, true);

  update public.rooms
  set updated_at = now(), state_version = state_version + 1
  where id = v_room.id;

  return jsonb_build_object('roomId', v_room.id, 'code', v_room.code);
end;
$$;

-- ── Peek: report computer chairs separately from human chairs ────────────────
create or replace function public.peek_room(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, auth, pg_temp
as $$
declare
  v_room public.rooms%rowtype;
  v_count integer := 0;
  v_human_count integer := 0;
  v_bot_count integer := 0;
  v_is_member boolean := false;
begin
  select * into v_room
  from public.rooms
  where code = upper(btrim(coalesce(p_code, '')));

  if not found then
    return jsonb_build_object(
      'exists', false,
      'code', upper(btrim(coalesce(p_code, ''))),
      'status', null,
      'playerCount', 0,
      'botCount', 0,
      'totalRounds', null,
      'isMember', false,
      'seatsOpen', 0
    );
  end if;

  select
    count(*),
    count(*) filter (where not is_bot)
  into v_count, v_human_count
  from public.players
  where room_id = v_room.id;

  v_bot_count := v_count - v_human_count;

  if auth.uid() is not null then
    select exists (
      select 1 from public.players where room_id = v_room.id and user_id = auth.uid()
    ) into v_is_member;
  end if;

  return jsonb_build_object(
    'exists', true,
    'code', v_room.code,
    'status', v_room.status,
    'playerCount', v_count,
    'botCount', v_bot_count,
    'totalRounds', v_room.total_rounds,
    'isMember', v_is_member,
    -- A computer chair can always be handed to a human in the lobby.
    'seatsOpen', case
      when v_room.status = 'lobby' then greatest(0, 4 - v_human_count)
      else 0
    end
  );
end;
$$;

-- ── Host fills every empty chair with a ready computer ───────────────────────
create or replace function public.fill_bots(p_room_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = public, extensions, auth, pg_temp
as $$
declare
  v_room public.rooms%rowtype;
  v_count integer;
  v_added integer := 0;
  v_seat integer;
  v_names constant text[] := array['Host', 'Robo', 'Mina', 'Tara'];
  v_avatars constant text[] := array['🕵️', '🤖', '👾', '🛸'];
begin
  if auth.uid() is null then
    raise exception using message = 'UNAUTHENTICATED';
  end if;

  select * into v_room from public.rooms where id = p_room_id for update;
  if not found then
    raise exception using message = 'ROOM_NOT_FOUND';
  end if;
  if v_room.status <> 'lobby' then
    raise exception using message = 'WRONG_PHASE';
  end if;
  if not public.is_room_host(p_room_id) then
    raise exception using message = 'NOT_HOST';
  end if;

  select count(*) into v_count from public.players where room_id = p_room_id;
  if v_count >= 4 then
    return 0;
  end if;

  for v_seat in 1..4 loop
    exit when v_count >= 4;

    if not exists (
      select 1 from public.players
      where room_id = p_room_id and seat = v_seat
    ) then
      insert into public.players (
        room_id, user_id, name, avatar, seat, is_host, is_ready, is_online, is_bot
      )
      values (
        p_room_id, null, v_names[v_seat], v_avatars[v_seat], v_seat, false, true, true, true
      );
      v_count := v_count + 1;
      v_added := v_added + 1;
    end if;
  end loop;

  if v_added > 0 then
    update public.rooms
    set updated_at = now(), state_version = state_version + 1
    where id = p_room_id;
  end if;

  return v_added;
end;
$$;

-- ── Host removes a computer from an unstarted room ──────────────────────────
create or replace function public.remove_bot(p_room_id uuid, p_player_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public, extensions, auth, pg_temp
as $$
declare
  v_room public.rooms%rowtype;
  v_bot public.players%rowtype;
begin
  if auth.uid() is null then
    raise exception using message = 'UNAUTHENTICATED';
  end if;

  select * into v_room from public.rooms where id = p_room_id for update;
  if not found then
    raise exception using message = 'ROOM_NOT_FOUND';
  end if;
  if v_room.status <> 'lobby' then
    raise exception using message = 'WRONG_PHASE';
  end if;
  if not public.is_room_host(p_room_id) then
    raise exception using message = 'NOT_HOST';
  end if;

  select * into v_bot
  from public.players
  where id = p_player_id and room_id = p_room_id and is_bot;

  -- A retried remove is harmless; a human id is never removed.
  if not found then
    return;
  end if;

  delete from public.players where id = v_bot.id;

  update public.rooms
  set updated_at = now(), state_version = state_version + 1
  where id = p_room_id;
end;
$$;

-- ── Direct solo practice: create, seat three computers, start atomically ─────
create or replace function public.create_practice_room(
  p_name text,
  p_avatar text,
  p_rounds integer,
  p_request_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions, auth, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_result jsonb;
  v_room_id uuid;
  v_status public.room_status;
begin
  if v_user is null then
    raise exception using message = 'UNAUTHENTICATED';
  end if;

  -- create_room() validates the name, avatar, rounds and request id.
  v_result := public.create_room(p_name, p_avatar, p_rounds, p_request_id);
  v_room_id := (v_result->>'roomId')::uuid;

  select status into v_status from public.rooms where id = v_room_id;

  if v_status = 'lobby' then
    perform public.fill_bots(v_room_id);

    update public.players
    set is_ready = true, is_online = true, last_seen_at = now(), disconnected_at = null
    where room_id = v_room_id and user_id = v_user;

    perform public.start_game(v_room_id);
  end if;

  return v_result;
end;
$$;

-- ── Babu asks: if Police is a computer, give it a short hand-raise clock ─────
create or replace function public.ask_police(p_room_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions, auth, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_player public.players%rowtype;
  v_round public.rounds%rowtype;
  v_police_id uuid;
  v_police_bot boolean := false;
begin
  if v_user is null then raise exception using message = 'UNAUTHENTICATED'; end if;

  select * into v_room from public.rooms where id = p_room_id for update;
  if not found then raise exception using message = 'ROOM_NOT_FOUND'; end if;
  if v_room.status <> 'playing' then raise exception using message = 'GAME_FINISHED'; end if;
  if v_room.paused_at is not null then raise exception using message = 'ROOM_PAUSED'; end if;

  select * into v_player from public.players
  where room_id = p_room_id and user_id = v_user;
  if not found then raise exception using message = 'NOT_MEMBER'; end if;

  select * into v_round
  from public.rounds
  where room_id = p_room_id
  order by round_number desc
  limit 1
  for update;

  if not found then raise exception using message = 'WRONG_PHASE'; end if;

  -- A retried tap after the phase already moved on is harmless.
  if v_round.phase = 'POLICE_REVEAL' and v_round.police_called_at is not null then
    return public.build_room_state(p_room_id, v_user);
  end if;

  if v_round.phase <> 'BABU_REVEAL' or v_round.babu_risen_at is null then
    raise exception using message = 'WRONG_PHASE';
  end if;

  if not exists (
    select 1 from public.round_roles
    where round_id = v_round.id
      and player_id = v_player.id
      and role = 'BABU'
  ) then
    raise exception using message = 'ONLY_BABU';
  end if;

  if v_round.police_called_at is null then
    select rr.player_id into v_police_id
    from public.round_roles rr
    where rr.round_id = v_round.id and rr.role = 'POLICE';

    v_police_bot := public.player_is_bot(v_police_id);

    update public.rounds
    set
      police_called_at = now(),
      phase = 'POLICE_REVEAL',
      phase_started_at = now(),
      phase_deadline = case
        when v_police_bot then now() + interval '1500 milliseconds'
        else null
      end
    where id = v_round.id;

    update public.rooms
    set updated_at = now(), state_version = state_version + 1
    where id = p_room_id;
  end if;

  return public.build_room_state(p_room_id, v_user);
end;
$$;

-- ── The conductor: human presence, bot turns, deadlines ─────────────────────
create or replace function public.sync_room(p_room_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions, auth, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_player public.players%rowtype;
  v_round public.rounds%rowtype;
  v_has_round boolean := false;
  v_auto_slot integer;
  v_auto_player uuid;
  v_auto_guess uuid;
  v_loop integer;
  v_unpaused_at timestamptz;
  v_babu_id uuid;
  v_police_id uuid;
  v_babu_bot boolean := false;
  v_police_bot boolean := false;
  v_actor_bot boolean := false;
begin
  if v_user is null then raise exception using message = 'UNAUTHENTICATED'; end if;

  select * into v_room from public.rooms where id = p_room_id for update;
  if not found then raise exception using message = 'ROOM_NOT_FOUND'; end if;

  select * into v_player from public.players
  where room_id = p_room_id and user_id = v_user;
  if not found then raise exception using message = 'NOT_MEMBER'; end if;

  update public.players
  set is_online = true, last_seen_at = now(), disconnected_at = null
  where id = v_player.id;

  update public.rooms set updated_at = now() where id = p_room_id;

  if v_room.status = 'playing' then
    -- Only humans can go away. A computer has no browser to reconnect from.
    update public.players
    set
      is_online = false,
      disconnected_at = coalesce(disconnected_at, last_seen_at)
    where room_id = p_room_id
      and not is_bot
      and user_id <> v_user
      and is_online
      and last_seen_at < now() - interval '40 seconds';

    if exists (
      select 1 from public.players
      where room_id = p_room_id
        and not is_bot
        and not is_online
        and coalesce(disconnected_at, last_seen_at) < now() - interval '90 seconds'
    ) then
      perform public.finalize_room(p_room_id, 'abandoned');
      return public.build_room_state(p_room_id, v_user);
    end if;

    if exists (
      select 1 from public.players
      where room_id = p_room_id and not is_bot and not is_online
    ) then
      if v_room.paused_at is null then
        update public.rooms set paused_at = now() where id = p_room_id;
      end if;
      return public.build_room_state(p_room_id, v_user);
    end if;

    if v_room.paused_at is not null then
      v_unpaused_at := now();
      update public.rounds
      set
        phase_deadline = case
          when phase_deadline is not null then phase_deadline + (v_unpaused_at - v_room.paused_at)
          else null
        end,
        phase_started_at = phase_started_at + (v_unpaused_at - v_room.paused_at)
      where room_id = p_room_id
        and phase_deadline is not null;

      update public.rooms set paused_at = null where id = p_room_id;
      v_room.paused_at := null;
    end if;

    select * into v_round
    from public.rounds
    where room_id = p_room_id
    order by round_number desc
    limit 1
    for update;

    v_has_round := found;

    if v_has_round then
      for v_loop in 1..16 loop
        exit when v_round.phase in ('ROUND_RESULT', 'MATCH_END');

        select rr.player_id into v_babu_id
        from public.round_roles rr
        where rr.round_id = v_round.id and rr.role = 'BABU';

        select rr.player_id into v_police_id
        from public.round_roles rr
        where rr.round_id = v_round.id and rr.role = 'POLICE';

        v_babu_bot := public.player_is_bot(v_babu_id);
        v_police_bot := public.player_is_bot(v_police_id);

        if v_round.phase = 'SHUFFLE' then
          if v_round.phase_deadline is null or v_round.phase_deadline > now() then
            exit;
          end if;

          v_auto_player := case
            when coalesce(array_length(v_round.draw_order, 1), 0) > 0
              then v_round.draw_order[1]
            else null
          end;
          v_actor_bot := public.player_is_bot(v_auto_player);

          update public.rounds
          set
            phase = 'DRAW',
            phase_started_at = now(),
            phase_deadline = now() + case
              when v_actor_bot then interval '1300 milliseconds'
              else interval '40 seconds'
            end,
            active_picker_id = v_auto_player
          where id = v_round.id;

        elsif v_round.phase = 'DRAW' then
          if v_round.phase_deadline is null or v_round.phase_deadline > now() then
            exit;
          end if;

          v_auto_player := v_round.active_picker_id;
          v_actor_bot := public.player_is_bot(v_auto_player);

          select slot into v_auto_slot
          from public.round_roles
          where round_id = v_round.id and player_id is null
          order by gen_random_bytes(4)
          limit 1;

          if v_auto_player is not null and v_auto_slot is not null then
            perform public.assign_slip(v_round.id, v_auto_player, v_auto_slot);

            if v_actor_bot then
              update public.rooms
              set updated_at = now(), state_version = state_version + 1
              where id = p_room_id;
            end if;
          else
            update public.rounds
            set
              phase = 'HIDDEN_ROLES',
              phase_started_at = now(),
              phase_deadline = now() + interval '1800 milliseconds',
              active_picker_id = null
            where id = v_round.id;
          end if;

        elsif v_round.phase = 'HIDDEN_ROLES' then
          if v_round.phase_deadline is null or v_round.phase_deadline > now() then
            exit;
          end if;

          -- A human Babu gets no deadline. A computer Babu gets a short,
          -- visible beat before it rises on its own.
          update public.rounds
          set
            phase = 'BABU_REVEAL',
            phase_started_at = now(),
            phase_deadline = case
              when v_babu_bot then now() + interval '1600 milliseconds'
              else null
            end
          where id = v_round.id;

        elsif v_round.phase = 'BABU_REVEAL' then
          if not v_babu_bot then
            if v_round.phase_deadline is not null then
              update public.rounds set phase_deadline = null where id = v_round.id;
            end if;
            exit;
          end if;

          if v_round.babu_risen_at is null then
            if v_round.phase_deadline is null then
              update public.rounds
              set phase_deadline = now() + interval '1500 milliseconds'
              where id = v_round.id;
              exit;
            elsif v_round.phase_deadline > now() then
              exit;
            else
              update public.rounds
              set
                babu_risen_at = now(),
                phase_started_at = now(),
                phase_deadline = now() + interval '1400 milliseconds'
              where id = v_round.id;

              update public.rooms
              set updated_at = now(), state_version = state_version + 1
              where id = p_room_id;
            end if;
          elsif v_round.police_called_at is null then
            if v_round.phase_deadline is null then
              update public.rounds
              set phase_deadline = now() + interval '1400 milliseconds'
              where id = v_round.id;
              exit;
            elsif v_round.phase_deadline > now() then
              exit;
            else
              update public.rounds
              set
                police_called_at = now(),
                phase = 'POLICE_REVEAL',
                phase_started_at = now(),
                phase_deadline = case
                  when v_police_bot then now() + interval '1500 milliseconds'
                  else null
                end
              where id = v_round.id;

              update public.rooms
              set updated_at = now(), state_version = state_version + 1
              where id = p_room_id;
            end if;
          else
            exit;
          end if;

        elsif v_round.phase = 'POLICE_REVEAL' then
          if not v_police_bot then
            if v_round.phase_deadline is not null then
              update public.rounds set phase_deadline = null where id = v_round.id;
            end if;
            exit;
          end if;

          if v_round.police_risen_at is null then
            if v_round.phase_deadline is null then
              update public.rounds
              set phase_deadline = now() + interval '1500 milliseconds'
              where id = v_round.id;
              exit;
            elsif v_round.phase_deadline > now() then
              exit;
            else
              update public.rounds
              set
                police_risen_at = now(),
                phase = 'POLICE_GUESS',
                phase_started_at = now(),
                phase_deadline = now() + interval '1700 milliseconds'
              where id = v_round.id;

              update public.rooms
              set updated_at = now(), state_version = state_version + 1
              where id = p_room_id;
            end if;
          else
            exit;
          end if;

        elsif v_round.phase = 'POLICE_GUESS' then
          if v_round.guess_player_id is null then
            if not v_police_bot then
              if v_round.phase_deadline is not null then
                update public.rounds set phase_deadline = null where id = v_round.id;
              end if;
              exit;
            end if;

            if v_round.phase_deadline is null then
              update public.rounds
              set phase_deadline = now() + interval '1700 milliseconds'
              where id = v_round.id;
              exit;
            elsif v_round.phase_deadline > now() then
              exit;
            else
              select rr.player_id into v_auto_guess
              from public.round_roles rr
              where rr.round_id = v_round.id
                and rr.player_id is not null
                and rr.role in ('CHOR', 'DAKAT')
              order by gen_random_bytes(4)
              limit 1;

              if v_auto_guess is null then
                exit;
              end if;

              update public.rounds
              set
                guess_player_id = v_auto_guess,
                guess_locked_at = now(),
                phase_deadline = now() + interval '1800 milliseconds'
              where id = v_round.id;

              update public.rooms
              set updated_at = now(), state_version = state_version + 1
              where id = p_room_id;
            end if;
          else
            if v_round.phase_deadline is null then
              update public.rounds
              set phase_deadline = now() + interval '1800 milliseconds'
              where id = v_round.id;
              exit;
            elsif v_round.phase_deadline > now() then
              exit;
            else
              perform public.resolve_round(p_room_id, v_round.id);
            end if;
          end if;

        elsif v_round.phase = 'FINAL_REVEAL' then
          if v_round.phase_deadline is null or v_round.phase_deadline > now() then
            exit;
          end if;

          update public.rounds
          set phase = 'ROUND_RESULT', phase_started_at = now(), phase_deadline = null
          where id = v_round.id;

        else
          exit;
        end if;

        select * into v_round
        from public.rounds
        where id = v_round.id;
      end loop;
    end if;
  end if;

  return public.build_room_state(p_room_id, v_user);
end;
$$;

-- ── Privileges ───────────────────────────────────────────────────────────────
revoke all on function public.player_is_bot(uuid) from public, anon, authenticated;

revoke all on function public.build_room_state(uuid, uuid) from public, anon, authenticated;

revoke all on function public.assign_slip(uuid, uuid, integer) from public, anon, authenticated;

revoke all on function public.start_game(uuid) from public, anon;
grant execute on function public.start_game(uuid) to authenticated;

revoke all on function public.join_room(text, text, text) from public, anon;
grant execute on function public.join_room(text, text, text) to authenticated;

revoke all on function public.peek_room(text) from public, anon;
grant execute on function public.peek_room(text) to authenticated;

revoke all on function public.ask_police(uuid) from public, anon;
grant execute on function public.ask_police(uuid) to authenticated;

revoke all on function public.sync_room(uuid) from public, anon;
grant execute on function public.sync_room(uuid) to authenticated;

revoke all on function public.fill_bots(uuid) from public, anon;
grant execute on function public.fill_bots(uuid) to authenticated;

revoke all on function public.remove_bot(uuid, uuid) from public, anon;
grant execute on function public.remove_bot(uuid, uuid) to authenticated;

revoke all on function public.create_practice_room(text, text, integer, uuid) from public, anon;
grant execute on function public.create_practice_room(text, text, integer, uuid) to authenticated;

comment on column public.players.is_bot is
  'True for server-driven computer players. Bots have user_id = null and never call RPCs.';
comment on function public.fill_bots(uuid) is
  'Host-only lobby action: seat ready computers in every empty chair.';
comment on function public.remove_bot(uuid, uuid) is
  'Host-only lobby action: remove one computer and free its chair.';
comment on function public.create_practice_room(text, text, integer, uuid) is
  'Create a private practice room, fill three computers and start immediately.';
comment on function public.player_is_bot(uuid) is
  'Internal helper: true when the player row is a server-driven computer.';
