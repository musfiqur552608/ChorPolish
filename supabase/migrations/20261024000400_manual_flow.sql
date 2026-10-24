-- ═════════════════════════════════════════════════════════════════════════════
-- 004 · Manual Babu / Police reveal flow
--
-- The paper game is not on a stopwatch. Babu rises when Babu is ready, asks
-- for the Police by hand, and the Police raises a hand before choosing.
-- This migration makes those three moments explicit and server-authoritative:
--
--   HIDDEN_ROLES ──(auto)──▶ BABU_REVEAL
--   BABU_REVEAL ──babu_rise()──▶ Babu is public everywhere
--   BABU_REVEAL ──ask_police()──▶ POLICE_REVEAL (the question is on every screen)
--   POLICE_REVEAL ──police_rise()──▶ POLICE_GUESS (Police is public everywhere)
--   POLICE_GUESS ──police_guess()──▶ pick visible ──▶ FINAL_REVEAL ──▶ ROUND_RESULT
--
-- No secret every leaves round_roles before its proper moment. Babu is only
-- in publicRoles after babu_rise(); the Police only after police_rise().
-- ═════════════════════════════════════════════════════════════════════════════

-- ── Manual-step timestamps + a realtime-safe state counter ───────────────────
alter table public.rounds
  add column if not exists babu_risen_at timestamptz,
  add column if not exists police_called_at timestamptz,
  add column if not exists police_risen_at timestamptz;

-- `rooms.updated_at` changes on every heartbeat, so it cannot be used as a
-- meaningful-change signal on the realtime channel. This counter only moves
-- when a manual step actually changes what everybody sees.
alter table public.rooms
  add column if not exists state_version bigint not null default 0;

-- ── The only client-visible representation of the game ───────────────────────
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

-- ── The conductor: manual phases have no deadline and never auto-advance ─────
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
    -- Anyone silent for 40 seconds is considered away. The 90-second grace
    -- clock starts from their last actual contact, not from when we noticed.
    update public.players
    set
      is_online = false,
      disconnected_at = coalesce(disconnected_at, last_seen_at)
    where room_id = p_room_id
      and user_id <> v_user
      and is_online
      and last_seen_at < now() - interval '40 seconds';

    if exists (
      select 1 from public.players
      where room_id = p_room_id
        and not is_online
        and coalesce(disconnected_at, last_seen_at) < now() - interval '90 seconds'
    ) then
      perform public.finalize_room(p_room_id, 'abandoned');
      return public.build_room_state(p_room_id, v_user);
    end if;

    if exists (
      select 1 from public.players
      where room_id = p_room_id and not is_online
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
      for v_loop in 1..12 loop
        exit when v_round.phase_deadline is null or v_round.phase_deadline > now();

        if v_round.phase = 'SHUFFLE' then
          update public.rounds
          set
            phase = 'DRAW',
            phase_started_at = now(),
            phase_deadline = now() + interval '40 seconds',
            active_picker_id = case
              when coalesce(array_length(draw_order, 1), 0) > 0 then draw_order[1]
              else null
            end
          where id = v_round.id;

        elsif v_round.phase = 'DRAW' then
          v_auto_player := v_round.active_picker_id;
          select slot into v_auto_slot
          from public.round_roles
          where round_id = v_round.id and player_id is null
          order by gen_random_bytes(4)
          limit 1;

          if v_auto_player is not null and v_auto_slot is not null then
            perform public.assign_slip(v_round.id, v_auto_player, v_auto_slot);
          else
            update public.rounds
            set phase = 'HIDDEN_ROLES', phase_started_at = now(),
                phase_deadline = now() + interval '1800 milliseconds',
                active_picker_id = null
            where id = v_round.id;
          end if;

        elsif v_round.phase = 'HIDDEN_ROLES' then
          -- From here on the table is in human hands. No deadline means the
          -- loop will not auto-advance this phase.
          update public.rounds
          set phase = 'BABU_REVEAL', phase_started_at = now(),
              phase_deadline = null
          where id = v_round.id;

        elsif v_round.phase = 'BABU_REVEAL' then
          -- Legacy rounds that still carry an old deadline are parked here
          -- until Babu presses the button. Never reveal early.
          update public.rounds
          set phase_deadline = null
          where id = v_round.id;

        elsif v_round.phase = 'POLICE_REVEAL' then
          update public.rounds
          set phase_deadline = null
          where id = v_round.id;

        elsif v_round.phase = 'BABU_ORDER' then
          -- Old rounds created before this migration. Move them to the manual
          -- choosing stage, revealing Police at the same time as the paper
          -- game would have.
          update public.rounds
          set phase = 'POLICE_GUESS', phase_started_at = now(),
              phase_deadline = null,
              police_risen_at = coalesce(police_risen_at, now())
          where id = v_round.id;

        elsif v_round.phase = 'POLICE_GUESS' then
          if v_round.guess_player_id is null then
            select rr.player_id into v_auto_guess
            from public.round_roles rr
            where rr.round_id = v_round.id
              and rr.player_id is not null
              and rr.role in ('CHOR', 'DAKAT')
            order by gen_random_bytes(4)
            limit 1;

            update public.rounds
            set guess_player_id = v_auto_guess,
                guess_locked_at = now(),
                phase_deadline = now() + interval '1800 milliseconds'
            where id = v_round.id;
          else
            perform public.resolve_round(p_room_id, v_round.id);
          end if;

        elsif v_round.phase = 'FINAL_REVEAL' then
          update public.rounds
          set phase = 'ROUND_RESULT', phase_started_at = now(), phase_deadline = null
          where id = v_round.id;

        elsif v_round.phase in ('ROUND_RESULT', 'MATCH_END') then
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

-- ── Step 1: Babu rises ───────────────────────────────────────────────────────
create or replace function public.babu_rise(p_room_id uuid)
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

  if not found or v_round.phase <> 'BABU_REVEAL' then
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

  if v_round.babu_risen_at is null then
    update public.rounds
    set
      babu_risen_at = now(),
      phase_deadline = null,
      phase_started_at = case
        when phase_deadline is not null then now()
        else phase_started_at
      end
    where id = v_round.id;

    update public.rooms
    set updated_at = now(), state_version = state_version + 1
    where id = p_room_id;
  end if;

  return public.build_room_state(p_room_id, v_user);
end;
$$;

-- ── Step 2: Babu asks, "Who is the Police?" ──────────────────────────────────
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
    update public.rounds
    set
      police_called_at = now(),
      phase = 'POLICE_REVEAL',
      phase_started_at = now(),
      phase_deadline = null
    where id = v_round.id;

    update public.rooms
    set updated_at = now(), state_version = state_version + 1
    where id = p_room_id;
  end if;

  return public.build_room_state(p_room_id, v_user);
end;
$$;

-- ── Step 3: Police raises a hand ─────────────────────────────────────────────
create or replace function public.police_rise(p_room_id uuid)
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
  if v_round.phase = 'POLICE_GUESS' and v_round.police_risen_at is not null then
    return public.build_room_state(p_room_id, v_user);
  end if;

  if v_round.phase <> 'POLICE_REVEAL'
     or v_round.police_called_at is null
     or v_round.babu_risen_at is null then
    raise exception using message = 'WRONG_PHASE';
  end if;

  if not exists (
    select 1 from public.round_roles
    where round_id = v_round.id
      and player_id = v_player.id
      and role = 'POLICE'
  ) then
    raise exception using message = 'ONLY_POLICE';
  end if;

  if v_round.police_risen_at is null then
    update public.rounds
    set
      police_risen_at = now(),
      phase = 'POLICE_GUESS',
      phase_started_at = now(),
      phase_deadline = null
    where id = v_round.id;

    update public.rooms
    set updated_at = now(), state_version = state_version + 1
    where id = p_room_id;
  end if;

  return public.build_room_state(p_room_id, v_user);
end;
$$;

-- ── Step 4: Police picks one of the two hidden slips ─────────────────────────
create or replace function public.police_guess(p_room_id uuid, p_guessed_player_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public, extensions, auth, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_round public.rounds%rowtype;
  v_player public.players%rowtype;
  v_guessed_role public.player_role;
begin
  if v_user is null then raise exception using message = 'UNAUTHENTICATED'; end if;

  select * into v_room from public.rooms where id = p_room_id for update;
  if not found then raise exception using message = 'ROOM_NOT_FOUND'; end if;
  if v_room.status <> 'playing' then raise exception using message = 'GAME_FINISHED'; end if;
  if v_room.paused_at is not null then raise exception using message = 'ROOM_PAUSED'; end if;

  select * into v_player from public.players where room_id = p_room_id and user_id = v_user;
  if not found then raise exception using message = 'NOT_MEMBER'; end if;

  select * into v_round
  from public.rounds
  where room_id = p_room_id
  order by round_number desc
  limit 1
  for update;

  if not found then
    raise exception using message = 'WRONG_PHASE';
  end if;

  -- If the round has already moved on, a retry is not a cheat attempt.
  if v_round.phase <> 'POLICE_GUESS' or v_round.police_risen_at is null then
    if v_round.guess_player_id = p_guessed_player_id then
      return;
    end if;
    raise exception using message = 'WRONG_PHASE';
  end if;

  if not exists (
    select 1 from public.round_roles
    where round_id = v_round.id
      and player_id = v_player.id
      and role = 'POLICE'
  ) then
    raise exception using message = 'ONLY_POLICE';
  end if;

  if v_round.guess_player_id is not null then
    if v_round.guess_player_id = p_guessed_player_id then
      return;
    end if;
    raise exception using message = 'GUESS_LOCKED';
  end if;

  select rr.role into v_guessed_role
  from public.round_roles rr
  where rr.round_id = v_round.id
    and rr.player_id = p_guessed_player_id;

  if v_guessed_role is null or v_guessed_role not in ('CHOR', 'DAKAT') then
    raise exception using message = 'INVALID_GUESS';
  end if;

  update public.rounds
  set
    guess_player_id = p_guessed_player_id,
    guess_locked_at = now(),
    -- Short suspense window so every screen can see the pick before the
    -- roles turn over and sync_room resolves the round.
    phase_deadline = now() + interval '1800 milliseconds'
  where id = v_round.id;

  update public.rooms
  set updated_at = now(), state_version = state_version + 1
  where id = p_room_id;
end;
$$;

-- ── Privileges ───────────────────────────────────────────────────────────────
revoke all on function public.babu_rise(uuid) from public, anon;
revoke all on function public.ask_police(uuid) from public, anon;
revoke all on function public.police_rise(uuid) from public, anon;

grant execute on function public.babu_rise(uuid) to authenticated;
grant execute on function public.ask_police(uuid) to authenticated;
grant execute on function public.police_rise(uuid) to authenticated;

revoke all on function public.build_room_state(uuid, uuid) from public, anon, authenticated;
revoke all on function public.sync_room(uuid) from public, anon;
grant execute on function public.sync_room(uuid) to authenticated;
revoke all on function public.police_guess(uuid, uuid) from public, anon;
grant execute on function public.police_guess(uuid, uuid) to authenticated;

comment on function public.babu_rise(uuid) is
  'Babu raises a hand. Reveals Babu to the table; no deadline, no auto-advance.';
comment on function public.ask_police(uuid) is
  'Babu asks who the Police is. Puts the question on every screen.';
comment on function public.police_rise(uuid) is
  'Police raises a hand. Reveals Police, then opens the two-slip choice.';
