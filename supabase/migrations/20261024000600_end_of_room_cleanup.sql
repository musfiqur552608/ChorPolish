-- 006: end-of-room data deletion
-- ============================================================================
-- Guarantees that every room is eventually erased from the database, including
-- a normally completed match. The old behavior only set cleanup_at for
-- abandoned rooms and relied on 30-minute inactivity for completed ones, while
-- active clients kept polling sync_room() and refreshing updated_at.
--
-- Deletion paths:
--   * Explicit leave: leave_room() hard-deletes the room immediately (002).
--   * Every finalize_room() call (completed or abandoned) sets
--     cleanup_at = now() + 120 seconds, preserving a scorecard-download window.
--   * cleanup_rooms() (scheduled by 005) deletes:
--       - rooms past cleanup_at, regardless of client polling;
--       - finished rooms older than 5 minutes (fallback for old rows);
--       - rooms whose final round sat on ROUND_RESULT/MATCH_END for 10 minutes
--         because the host never advanced;
--       - rooms untouched for 30 minutes.
--   Deleting public.rooms cascades to players, rounds, round_roles,
--   round_results, and reactions.
-- ============================================================================

-- 1. Every finalized room gets a deterministic deletion time. -----------------
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
    -- Same short window for completed and abandoned matches: enough to export
    -- the notebook, then the cron erases the room and every child row.
    cleanup_at = now() + interval '120 seconds',
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

comment on function public.finalize_room(uuid, text) is
  'Ends a room, computes final ranks, and starts the 120-second deletion window.';

-- 2. Scheduled cleanup: delete every kind of ended room. ----------------------
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
  delete from public.rooms as room
  where room.updated_at < now() - interval '30 minutes'
     or (room.cleanup_at is not null and room.cleanup_at <= now())
     or (
       room.status = 'finished'
       and room.finished_at is not null
       and room.finished_at < now() - interval '5 minutes'
     )
     or exists (
       select 1
       from public.rounds r
       where r.room_id = room.id
         and r.round_number = room.total_rounds
         and r.phase in ('ROUND_RESULT', 'MATCH_END')
         and r.resolved_at is not null
         and r.resolved_at < now() - interval '10 minutes'
     );

  get diagnostics v_deleted = row_count;

  delete from public.reactions
  where created_at < now() - interval '1 day';

  return v_deleted;
end;
$$;

comment on function public.cleanup_rooms() is
  'Deletes ended rooms at cleanup_at, finished rooms after 5 minutes, stuck final results after 10 minutes, and idle rooms after 30 minutes. Child rows cascade.';

-- 3. Keep both functions server-only. ----------------------------------------
revoke all on function public.finalize_room(uuid, text) from public, anon, authenticated;
revoke all on function public.cleanup_rooms() from public, anon, authenticated;
