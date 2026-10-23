-- ═════════════════════════════════════════════════════════════════════════════
-- 002 · The authoritative game engine (Postgres RPCs)
--
-- RULE BOOK — keep in sync with src/config/game.ts
--   Babu 90 · Police 80 · Chor 60 · Dakat 70
--   Odd rounds hunt CHOR · even rounds hunt DAKAT
--   Draw timer 40s · guess timer 30s · grace 90s
--   Abandoned-room download window 120s · safety cleanup 30m
--
-- Every client-facing function is idempotent or safe to retry. Timed phases
-- are advanced only after their server deadline, so many clients calling
-- sync_room() at once cannot skip the game ahead.
-- ═════════════════════════════════════════════════════════════════════════════

-- ── Rule helpers ─────────────────────────────────────────────────────────────
create or replace function public.points_for_role(p_role public.player_role)
returns integer
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_role
    when 'BABU' then 90
    when 'POLICE' then 80
    when 'CHOR' then 60
    when 'DAKAT' then 70
  end;
$$;

create or replace function public.target_for_round(p_round integer)
returns public.target_role
language sql
immutable
set search_path = public, pg_temp
as $$
  select case when p_round % 2 = 1 then 'CHOR'::public.target_role else 'DAKAT'::public.target_role end;
$$;

-- ── Readable, unambiguous codes: no 0/O, 1/I/L. Uses cryptographic bytes. ────
create or replace function public.generate_room_code()
returns text
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text;
  v_attempt integer := 0;
begin
  loop
    v_attempt := v_attempt + 1;
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(
        v_alphabet,
        1 + (get_byte(gen_random_bytes(1), 0) % length(v_alphabet)),
        1
      );
    end loop;

    exit when not exists (select 1 from public.rooms where code = v_code);

    if v_attempt >= 24 then
      raise exception using message = 'ROOM_CODE_COLLISION';
    end if;
  end loop;
  return v_code;
end;
$$;

-- ── Internal: assign one secret role to a player ─────────────────────────────
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
    update public.rounds
    set
      phase = 'DRAW',
      active_picker_id = v_next_picker,
      phase_started_at = now(),
      phase_deadline = now() + interval '40 seconds'
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

-- ── Internal: score and reveal a round atomically ────────────────────────────
create or replace function public.resolve_round(
  p_room_id uuid,
  p_round_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_round public.rounds%rowtype;
  v_guess uuid;
  v_guess_role public.player_role;
  v_caught boolean := false;
begin
  select * into v_round from public.rounds where id = p_round_id for update;
  if not found then
    raise exception using message = 'ROUND_NOT_FOUND';
  end if;

  if exists (select 1 from public.round_results where round_id = p_round_id limit 1) then
    return;
  end if;

  if (select count(*) from public.round_roles where round_id = p_round_id and player_id is not null) <> 4 then
    raise exception using message = 'WRONG_PHASE';
  end if;

  v_guess := v_round.guess_player_id;
  v_guess_role := null;

  if v_guess is null then
    select player_id, role
    into v_guess, v_guess_role
    from public.round_roles
    where round_id = p_round_id
      and player_id is not null
      and role in ('CHOR', 'DAKAT')
    order by gen_random_bytes(4)
    limit 1;

    update public.rounds
    set guess_player_id = v_guess, guess_locked_at = now()
    where id = p_round_id;
  else
    select role into v_guess_role
    from public.round_roles
    where round_id = p_round_id and player_id = v_guess;
  end if;

  -- Never trust a stale or malformed accusation. Repair server-side if needed.
  if v_guess is null or v_guess_role is null or v_guess_role not in ('CHOR', 'DAKAT') then
    select player_id, role into v_guess, v_guess_role
    from public.round_roles
    where round_id = p_round_id
      and player_id is not null
      and role in ('CHOR', 'DAKAT')
    order by gen_random_bytes(4)
    limit 1;

    if v_guess is null or v_guess_role is null then
      raise exception using message = 'WRONG_PHASE';
    end if;

    update public.rounds
    set guess_player_id = v_guess, guess_locked_at = coalesce(guess_locked_at, now())
    where id = p_round_id;
  end if;

  v_caught := (v_guess_role::text = v_round.target_role::text);

  insert into public.round_results (room_id, round_id, player_id, role, points)
  select
    rr.room_id,
    rr.round_id,
    rr.player_id,
    rr.role,
    case
      when rr.role = 'BABU' then 90
      when rr.role = 'POLICE' then case when v_caught then 80 else 0 end
      when rr.role::text = v_round.target_role::text then case when v_caught then 0 else public.points_for_role(rr.role) end
      else public.points_for_role(rr.role)
    end
  from public.round_roles rr
  where rr.round_id = p_round_id and rr.player_id is not null;

  update public.players p
  set
    total_score = p.total_score + rr.points,
    babu_count = p.babu_count + case when rr.role = 'BABU' then 1 else 0 end
  from public.round_results rr
  where rr.round_id = p_round_id
    and rr.player_id = p.id
    and p.room_id = p_room_id;

  update public.rounds
  set
    phase = 'FINAL_REVEAL',
    guess_player_id = v_guess,
    guess_correct = v_caught,
    phase_started_at = now(),
    phase_deadline = now() + interval '3800 milliseconds',
    resolved_at = now()
  where id = p_round_id;

  update public.rooms set updated_at = now() where id = p_room_id;
end;
$$;

-- ── Internal: deal a fresh round ─────────────────────────────────────────────
create or replace function public.begin_round(
  p_room_id uuid,
  p_round_number integer
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_room public.rooms%rowtype;
  v_round_id uuid;
  v_shuffler uuid;
  v_shuffler_seat integer;
  v_prev_shuffler uuid;
  v_prev_seat integer;
  v_draw_order uuid[];
  v_roles public.player_role[];
  v_temp public.player_role;
  v_j integer;
  v_target public.target_role;
  v_existing uuid;
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found then
    raise exception using message = 'ROOM_NOT_FOUND';
  end if;
  if v_room.status <> 'playing' then
    raise exception using message = 'WRONG_PHASE';
  end if;
  if p_round_number < 1 or p_round_number > v_room.total_rounds then
    raise exception using message = 'INVALID_ROUNDS';
  end if;

  select id into v_existing
  from public.rounds
  where room_id = p_room_id and round_number = p_round_number;
  if v_existing is not null then
    return v_existing;
  end if;

  if v_room.host_player_id is null then
    raise exception using message = 'NOT_HOST';
  end if;

  if p_round_number = 1 then
    v_shuffler := v_room.host_player_id;
  else
    select r.shuffler_id, p.seat
    into v_prev_shuffler, v_prev_seat
    from public.rounds r
    join public.players p on p.id = r.shuffler_id
    where r.room_id = p_room_id
      and r.round_number = p_round_number - 1;

    if v_prev_shuffler is null then
      v_shuffler := v_room.host_player_id;
    else
      select p.id, p.seat
      into v_shuffler, v_shuffler_seat
      from public.players p
      where p.room_id = p_room_id
        and p.id <> v_prev_shuffler
      order by
        case when p.seat > v_prev_seat then 0 else 1 end,
        p.seat
      limit 1;
    end if;
  end if;

  select p.seat into v_shuffler_seat
  from public.players p
  where p.id = v_shuffler and p.room_id = p_room_id;

  if v_shuffler is null or v_shuffler_seat is null then
    raise exception using message = 'PLAYERS_OFFLINE';
  end if;

  select array_agg(
    p.id
    order by
      case when p.seat > v_shuffler_seat then 0 else 1 end,
      p.seat
  )
  into v_draw_order
  from public.players p
  where p.room_id = p_room_id
    and p.id <> v_shuffler;

  if coalesce(array_length(v_draw_order, 1), 0) <> 3 then
    raise exception using message = 'NOT_ENOUGH_PLAYERS';
  end if;

  v_target := public.target_for_round(p_round_number);

  insert into public.rounds (
    room_id,
    round_number,
    shuffler_id,
    target_role,
    phase,
    draw_order,
    phase_started_at,
    phase_deadline
  )
  values (
    p_room_id,
    p_round_number,
    v_shuffler,
    v_target,
    'SHUFFLE',
    v_draw_order,
    now(),
    now() + interval '3200 milliseconds'
  )
  returning id into v_round_id;

  -- Fisher–Yates shuffle driven by cryptographic random bytes.
  v_roles := array['BABU', 'POLICE', 'CHOR', 'DAKAT']::public.player_role[];
  for i in reverse 4..2 loop
    v_j := 1 + (get_byte(gen_random_bytes(1), 0) % i);
    v_temp := v_roles[i];
    v_roles[i] := v_roles[v_j];
    v_roles[v_j] := v_temp;
  end loop;

  for i in 1..4 loop
    insert into public.round_roles (room_id, round_id, slot, role)
    values (p_room_id, v_round_id, i - 1, v_roles[i]);
  end loop;

  update public.rooms
  set current_round = p_round_number, updated_at = now()
  where id = p_room_id;

  return v_round_id;
end;
$$;

-- ── Internal: finish a match and compute competition ranks ───────────────────
create or replace function public.finalize_room(
  p_room_id uuid,
  p_reason text
)
returns void
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  update public.rooms
  set
    status = 'finished',
    finished_at = now(),
    finished_reason = p_reason,
    paused_at = null,
    cleanup_at = case
      when p_reason = 'abandoned' then now() + interval '120 seconds'
      else null
    end,
    updated_at = now()
  where id = p_room_id;

  update public.rounds
  set
    phase = 'MATCH_END',
    active_picker_id = null,
    phase_deadline = null
  where room_id = p_room_id
    and phase in (
      'SHUFFLE',
      'DRAW',
      'HIDDEN_ROLES',
      'BABU_REVEAL',
      'POLICE_REVEAL',
      'BABU_ORDER',
      'POLICE_GUESS',
      'FINAL_REVEAL',
      'ROUND_RESULT'
    );

  update public.players p
  set final_rank = ranked.rank
  from (
    select
      id,
      rank() over (order by total_score desc, babu_count desc)::smallint as rank
    from public.players
    where room_id = p_room_id
  ) ranked
  where p.id = ranked.id;
end;
$$;

-- ── Internal: build the only client-visible representation of the game ───────
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
      select coalesce(jsonb_object_agg(rr.player_id::text, rr.role::text), '{}'::jsonb)
      into v_public_roles
      from public.round_roles rr
      where rr.round_id = v_round.id
        and rr.player_id is not null
        and (
          (rr.role = 'BABU' and v_round.phase in ('BABU_REVEAL', 'POLICE_REVEAL', 'BABU_ORDER', 'POLICE_GUESS'))
          or
          (rr.role = 'POLICE' and v_round.phase in ('POLICE_REVEAL', 'BABU_ORDER', 'POLICE_GUESS'))
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

-- ── Create ───────────────────────────────────────────────────────────────────
create or replace function public.create_room(
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
  v_name text;
  v_avatar text;
  v_code text;
  v_room_id uuid;
  v_code_attempt integer;
  v_existing public.rooms%rowtype;
begin
  if v_user is null then
    raise exception using message = 'UNAUTHENTICATED';
  end if;
  if p_request_id is null then
    raise exception using message = 'UNKNOWN';
  end if;

  v_name := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_avatar := btrim(coalesce(p_avatar, ''));
  if char_length(v_name) < 1 or char_length(v_name) > 20 then
    raise exception using message = 'INVALID_NAME';
  end if;
  if char_length(v_avatar) < 1 or char_length(v_avatar) > 16 then
    raise exception using message = 'INVALID_NAME';
  end if;
  if p_rounds is null or p_rounds < 1 or p_rounds > 30 then
    raise exception using message = 'INVALID_ROUNDS';
  end if;

  select * into v_existing
  from public.rooms
  where created_by = v_user and create_request_id = p_request_id;
  if found then
    return jsonb_build_object('roomId', v_existing.id, 'code', v_existing.code);
  end if;

  for v_code_attempt in 1..8 loop
    begin
      v_code := public.generate_room_code();

      insert into public.rooms (
        code, status, total_rounds, created_by, create_request_id
      )
      values (
        v_code, 'lobby', p_rounds, v_user, p_request_id
      )
      returning id into v_room_id;

      insert into public.players (room_id, user_id, name, avatar, seat, is_host, is_ready, is_online)
      values (v_room_id, v_user, v_name, v_avatar, 1, true, false, true);

      update public.rooms
      set host_player_id = (
        select id from public.players where room_id = v_room_id and is_host
      )
      where id = v_room_id;

      return jsonb_build_object('roomId', v_room_id, 'code', v_code);
    exception
      when unique_violation then
        select * into v_existing
        from public.rooms
        where created_by = v_user and create_request_id = p_request_id;
        if found then
          -- A retried request is a success, not a duplicate game.
          return jsonb_build_object('roomId', v_existing.id, 'code', v_existing.code);
        end if;
        -- Otherwise it was an astronomically unlikely room-code collision.
        if v_code_attempt = 8 then
          raise exception using message = 'ROOM_CODE_COLLISION';
        end if;
    end;
  end loop;

  raise exception using message = 'ROOM_CODE_COLLISION';
end;
$$;

-- ── Join ─────────────────────────────────────────────────────────────────────
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
    raise exception using message = 'ROOM_FULL';
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

  update public.rooms set updated_at = now() where id = v_room.id;

  return jsonb_build_object('roomId', v_room.id, 'code', v_room.code);
end;
$$;

-- ── Safe pre-join lookup ─────────────────────────────────────────────────────
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
      'totalRounds', null,
      'isMember', false,
      'seatsOpen', 0
    );
  end if;

  select count(*) into v_count from public.players where room_id = v_room.id;
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
    'totalRounds', v_room.total_rounds,
    'isMember', v_is_member,
    'seatsOpen', greatest(0, 4 - v_count)
  );
end;
$$;

-- ── Full sanitized state ─────────────────────────────────────────────────────
create or replace function public.get_room_state(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, auth, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_room public.rooms%rowtype;
begin
  if v_user is null then
    raise exception using message = 'UNAUTHENTICATED';
  end if;
  select * into v_room
  from public.rooms
  where code = upper(btrim(coalesce(p_code, '')));
  if not found then
    raise exception using message = 'ROOM_NOT_FOUND';
  end if;
  return public.build_room_state(v_room.id, v_user);
end;
$$;

create or replace function public.find_my_room()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, auth, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_room public.rooms%rowtype;
begin
  if v_user is null then
    return null;
  end if;

  select r.* into v_room
  from public.players p
  join public.rooms r on r.id = p.room_id
  where p.user_id = v_user
  order by
    case r.status when 'playing' then 0 when 'lobby' then 1 else 2 end,
    r.updated_at desc
  limit 1;

  if not found then
    return null;
  end if;
  return jsonb_build_object('roomId', v_room.id, 'code', v_room.code);
end;
$$;

-- ── Lobby actions ────────────────────────────────────────────────────────────
create or replace function public.set_ready(p_room_id uuid, p_ready boolean)
returns void
language plpgsql
volatile
security definer
set search_path = public, extensions, auth, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_player public.players%rowtype;
begin
  if v_user is null then raise exception using message = 'UNAUTHENTICATED'; end if;
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found then raise exception using message = 'ROOM_NOT_FOUND'; end if;
  if v_room.status <> 'lobby' then raise exception using message = 'WRONG_PHASE'; end if;

  select * into v_player from public.players where room_id = p_room_id and user_id = v_user;
  if not found then raise exception using message = 'NOT_MEMBER'; end if;

  update public.players
  set
    is_ready = coalesce(p_ready, false),
    is_online = true,
    last_seen_at = now(),
    disconnected_at = null
  where id = v_player.id;

  update public.rooms set updated_at = now() where id = p_room_id;
end;
$$;

create or replace function public.set_rounds(p_room_id uuid, p_rounds integer)
returns void
language plpgsql
volatile
security definer
set search_path = public, extensions, auth, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_room public.rooms%rowtype;
begin
  if v_user is null then raise exception using message = 'UNAUTHENTICATED'; end if;
  if p_rounds is null or p_rounds < 1 or p_rounds > 30 then
    raise exception using message = 'INVALID_ROUNDS';
  end if;

  select * into v_room from public.rooms where id = p_room_id for update;
  if not found then raise exception using message = 'ROOM_NOT_FOUND'; end if;
  if v_room.status <> 'lobby' then raise exception using message = 'WRONG_PHASE'; end if;
  if not public.is_room_host(p_room_id) then raise exception using message = 'NOT_HOST'; end if;

  update public.rooms
  set total_rounds = p_rounds, updated_at = now()
  where id = p_room_id;
end;
$$;

create or replace function public.change_avatar(p_room_id uuid, p_avatar text)
returns void
language plpgsql
volatile
security definer
set search_path = public, extensions, auth, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_avatar text;
  v_room public.rooms%rowtype;
begin
  if v_user is null then raise exception using message = 'UNAUTHENTICATED'; end if;
  v_avatar := btrim(coalesce(p_avatar, ''));
  if char_length(v_avatar) < 1 or char_length(v_avatar) > 16 then
    raise exception using message = 'INVALID_NAME';
  end if;

  select * into v_room from public.rooms where id = p_room_id for update;
  if not found then raise exception using message = 'ROOM_NOT_FOUND'; end if;
  if v_room.status <> 'lobby' then raise exception using message = 'WRONG_PHASE'; end if;

  update public.players
  set avatar = v_avatar, last_seen_at = now(), is_online = true, disconnected_at = null
  where room_id = p_room_id and user_id = v_user;

  if not found then raise exception using message = 'NOT_MEMBER'; end if;
  update public.rooms set updated_at = now() where id = p_room_id;
end;
$$;

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
      where is_online and last_seen_at > now() - interval '40 seconds'
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

-- ── Draw ─────────────────────────────────────────────────────────────────────
create or replace function public.pick_slip(p_room_id uuid, p_slot integer)
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

  if v_round.phase <> 'DRAW' then
    -- A retry after the round moved on should not look like cheating.
    if exists (
      select 1 from public.round_roles
      where round_id = v_round.id and player_id = v_player.id
    ) then
      return;
    end if;
    raise exception using message = 'WRONG_PHASE';
  end if;

  if exists (
    select 1 from public.round_roles
    where round_id = v_round.id and player_id = v_player.id
  ) then
    return;
  end if;

  if v_round.active_picker_id is null or v_round.active_picker_id <> v_player.id then
    raise exception using message = 'NOT_YOUR_TURN';
  end if;

  if p_slot is null or p_slot < 0 or p_slot > 3 then
    raise exception using message = 'SLOT_TAKEN';
  end if;

  perform public.assign_slip(v_round.id, v_player.id, p_slot);
  update public.rooms set updated_at = now() where id = p_room_id;
end;
$$;

-- ── Police accusation ────────────────────────────────────────────────────────
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

  if not found or v_round.phase <> 'POLICE_GUESS' then
    raise exception using message = 'WRONG_PHASE';
  end if;

  if v_round.phase_deadline is not null and now() > v_round.phase_deadline + interval '1500 milliseconds' then
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
    phase_deadline = now() + interval '1800 milliseconds'
  where id = v_round.id;

  update public.rooms set updated_at = now() where id = p_room_id;
end;
$$;

-- ── Presence heartbeat (lightweight, does not drive phases) ─────────────────
create or replace function public.heartbeat(p_room_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public, extensions, auth, pg_temp
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception using message = 'UNAUTHENTICATED'; end if;

  update public.players
  set is_online = true, last_seen_at = now(), disconnected_at = null
  where room_id = p_room_id and user_id = v_user;

  if not found then
    raise exception using message = 'NOT_MEMBER';
  end if;

  update public.rooms set updated_at = now() where id = p_room_id;
end;
$$;

-- ── The conductor: presence, pause/resume, deadlines and auto timeouts ───────
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
          update public.rounds
          set phase = 'BABU_REVEAL', phase_started_at = now(),
              phase_deadline = now() + interval '3400 milliseconds'
          where id = v_round.id;

        elsif v_round.phase = 'BABU_REVEAL' then
          update public.rounds
          set phase = 'POLICE_REVEAL', phase_started_at = now(),
              phase_deadline = now() + interval '3000 milliseconds'
          where id = v_round.id;

        elsif v_round.phase = 'POLICE_REVEAL' then
          update public.rounds
          set phase = 'BABU_ORDER', phase_started_at = now(),
              phase_deadline = now() + interval '2600 milliseconds'
          where id = v_round.id;

        elsif v_round.phase = 'BABU_ORDER' then
          update public.rounds
          set phase = 'POLICE_GUESS', phase_started_at = now(),
              phase_deadline = now() + interval '30 seconds'
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

-- ── Host advances from ROUND_RESULT, or ends the match ──────────────────────
create or replace function public.advance_phase(
  p_room_id uuid,
  p_phase text
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
  v_round public.rounds%rowtype;
begin
  if v_user is null then raise exception using message = 'UNAUTHENTICATED'; end if;

  select * into v_room from public.rooms where id = p_room_id for update;
  if not found then raise exception using message = 'ROOM_NOT_FOUND'; end if;
  if not public.is_room_member(p_room_id) then
    raise exception using message = 'NOT_MEMBER';
  end if;

  if v_room.status <> 'playing' then
    return public.build_room_state(p_room_id, v_user);
  end if;
  if v_room.paused_at is not null then
    return public.build_room_state(p_room_id, v_user);
  end if;

  select * into v_round
  from public.rounds
  where room_id = p_room_id
  order by round_number desc
  limit 1;

  if not found or v_round.phase::text <> upper(coalesce(p_phase, '')) then
    return public.build_room_state(p_room_id, v_user);
  end if;

  if v_round.phase = 'ROUND_RESULT' then
    if not public.is_room_host(p_room_id) then
      raise exception using message = 'NOT_HOST';
    end if;

    if v_room.current_round >= v_room.total_rounds then
      perform public.finalize_room(p_room_id, 'completed');
    else
      perform public.begin_round(p_room_id, v_room.current_round + 1);
    end if;
  end if;

  return public.build_room_state(p_room_id, v_user);
end;
$$;

-- ── Reactions ────────────────────────────────────────────────────────────────
create or replace function public.send_reaction(p_room_id uuid, p_emoji text)
returns void
language plpgsql
volatile
security definer
set search_path = public, extensions, auth, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_player public.players%rowtype;
  v_last timestamptz;
begin
  if v_user is null then raise exception using message = 'UNAUTHENTICATED'; end if;
  if p_emoji not in ('😂', '😱', '👏') then
    raise exception using message = 'UNKNOWN';
  end if;

  select * into v_room from public.rooms where id = p_room_id for update;
  if not found then raise exception using message = 'ROOM_NOT_FOUND'; end if;
  if v_room.status = 'finished' then
    raise exception using message = 'GAME_FINISHED';
  end if;

  select * into v_player from public.players where room_id = p_room_id and user_id = v_user;
  if not found then raise exception using message = 'NOT_MEMBER'; end if;

  select max(created_at) into v_last
  from public.reactions
  where room_id = p_room_id and player_id = v_player.id;

  if v_last is not null and v_last > now() - interval '1500 milliseconds' then
    raise exception using message = 'REACTION_THROTTLED';
  end if;

  insert into public.reactions (room_id, player_id, emoji)
  values (p_room_id, v_player.id, p_emoji);

  update public.rooms set updated_at = now() where id = p_room_id;
end;
$$;

-- ── Leave / erase ────────────────────────────────────────────────────────────
-- Lobby: the host leaving closes the room; a guest simply gives up their seat.
-- In-game or result: an explicit leave erases the entire room, for everyone,
-- as required by the data-lifecycle policy. The UI warns and offers download.
create or replace function public.leave_room(p_room_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public, extensions, auth, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_player public.players%rowtype;
begin
  if v_user is null then raise exception using message = 'UNAUTHENTICATED'; end if;

  select * into v_room from public.rooms where id = p_room_id for update;
  if not found then return; end if;

  select * into v_player from public.players
  where room_id = p_room_id and user_id = v_user;
  if not found then return; end if;

  if v_room.status = 'lobby' and not v_player.is_host then
    delete from public.players where id = v_player.id;
    update public.rooms set updated_at = now() where id = p_room_id;
    return;
  end if;

  delete from public.rooms where id = p_room_id;
end;
$$;

-- ── Safety net / cron body ───────────────────────────────────────────────────
create or replace function public.cleanup_rooms()
returns integer
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_deleted integer := 0;
begin
  delete from public.rooms
  where updated_at < now() - interval '30 minutes'
     or (cleanup_at is not null and cleanup_at <= now());

  get diagnostics v_deleted = row_count;

  delete from public.reactions
  where created_at < now() - interval '1 day';

  return v_deleted;
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- Privileges
-- ═════════════════════════════════════════════════════════════════════════════
revoke all on function public.points_for_role(public.player_role) from public, anon, authenticated;
revoke all on function public.target_for_round(integer) from public, anon, authenticated;
revoke all on function public.generate_room_code() from public, anon, authenticated;
revoke all on function public.assign_slip(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.resolve_round(uuid, uuid) from public, anon, authenticated;
revoke all on function public.begin_round(uuid, integer) from public, anon, authenticated;
revoke all on function public.finalize_room(uuid, text) from public, anon, authenticated;
revoke all on function public.build_room_state(uuid, uuid) from public, anon, authenticated;
revoke all on function public.cleanup_rooms() from public, anon, authenticated;

revoke all on function public.create_room(text, text, integer, uuid) from public, anon;
revoke all on function public.join_room(text, text, text) from public, anon;
revoke all on function public.peek_room(text) from public, anon;
revoke all on function public.get_room_state(text) from public, anon;
revoke all on function public.find_my_room() from public, anon;
revoke all on function public.set_ready(uuid, boolean) from public, anon;
revoke all on function public.set_rounds(uuid, integer) from public, anon;
revoke all on function public.start_game(uuid) from public, anon;
revoke all on function public.pick_slip(uuid, integer) from public, anon;
revoke all on function public.police_guess(uuid, uuid) from public, anon;
revoke all on function public.sync_room(uuid) from public, anon;
revoke all on function public.advance_phase(uuid, text) from public, anon;
revoke all on function public.heartbeat(uuid) from public, anon;
revoke all on function public.send_reaction(uuid, text) from public, anon;
revoke all on function public.change_avatar(uuid, text) from public, anon;
revoke all on function public.leave_room(uuid) from public, anon;

grant execute on function public.create_room(text, text, integer, uuid) to authenticated;
grant execute on function public.join_room(text, text, text) to authenticated;
grant execute on function public.peek_room(text) to authenticated;
grant execute on function public.get_room_state(text) to authenticated;
grant execute on function public.find_my_room() to authenticated;
grant execute on function public.set_ready(uuid, boolean) to authenticated;
grant execute on function public.set_rounds(uuid, integer) to authenticated;
grant execute on function public.start_game(uuid) to authenticated;
grant execute on function public.pick_slip(uuid, integer) to authenticated;
grant execute on function public.police_guess(uuid, uuid) to authenticated;
grant execute on function public.sync_room(uuid) to authenticated;
grant execute on function public.advance_phase(uuid, text) to authenticated;
grant execute on function public.heartbeat(uuid) to authenticated;
grant execute on function public.send_reaction(uuid, text) to authenticated;
grant execute on function public.change_avatar(uuid, text) to authenticated;
grant execute on function public.leave_room(uuid) to authenticated;

comment on function public.sync_room(uuid) is
  'Client-nudged, server-authoritative clock + presence reconciler. Safe to call concurrently.';
comment on function public.cleanup_rooms() is
  'Deletes abandoned rooms after the download window and inactive rooms after 30 minutes. Run on a schedule.';
