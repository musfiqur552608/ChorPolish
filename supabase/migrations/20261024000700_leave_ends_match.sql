-- 007: leaving mid-game ends the match with a result from completed rounds
-- ============================================================================
-- When a player explicitly leaves while a match is in progress, the room is
-- finalized (MATCH_END) instead of being hard-deleted. finalize_room()
-- ranks by total_score (completed rounds only) + babu_count, so the stranded
-- clients see the last real gameplay result plus the short download window
-- from 006 before cleanup_rooms() erases the room.
--
-- Lobby behavior is unchanged: a guest leaving just frees their seat, a host
-- leaving deletes the (unstarted) room. A leaver stays a member of a finished
-- room so everyone — including the leaver — can view/download the result.
-- ============================================================================

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

  if v_room.status = 'lobby' then
    if v_player.is_host then
      delete from public.rooms where id = p_room_id;
    else
      delete from public.players where id = v_player.id;
      update public.rooms set updated_at = now() where id = p_room_id;
    end if;
    return;
  end if;

  -- A match is playing or already finished: end it from the last completed
  -- rounds' scores rather than erasing anyone's notebook. finalize_room()
  -- moves every open phase to MATCH_END and ranks by total_score, preserving
  -- the 120-second export window before the scheduled cleanup (006).
  if v_room.status = 'playing' then
    perform public.finalize_room(p_room_id, 'left');
  end if;

  -- Keep the leaver's row for the result table; just mark them offline so the
  -- pause overlay no longer treats them as a reconnecting player.
  update public.players
  set is_online = false, disconnected_at = now()
  where id = v_player.id;
end;
$$;

revoke all on function public.leave_room(uuid) from public, anon;
grant execute on function public.leave_room(uuid) to authenticated;

comment on function public.leave_room(uuid) is
  'Lobby: guest frees a seat, host erases the room. Playing: ends the match on the last completed rounds and keeps everyone on the result screen until cleanup.';
