-- 005: scheduled cleanup (safe replacement for the old 003 draft)
-- ============================================================================
-- Schedules the audited cleanup routine already defined in 002_game_rpcs.sql
-- (public.cleanup_rooms) with pg_cron.
--
-- This file intentionally does NOT:
--   * create the pg_cron extension (that needs elevated privileges on hosted
--     Supabase and can make a whole migration run fail),
--   * redefine finalize_room() or leave_room() (002 is authoritative),
--   * grant EXECUTE to public/anon/authenticated on internal functions,
--   * delete child rows with bespoke statements (cleanup_rooms() handles room
--     deletion; child rows cascade from the rooms foreign keys).
--
-- Prerequisites
--   Apply, in order:
--     20261023000100_init.sql
--     20261023000200_game_rpcs.sql
--     20261024000400_manual_flow.sql
--     20261024000500_scheduled_cleanup.sql  (this file)
--
--   Enable pg_cron once per project:
--     Supabase Dashboard -> Database -> Extensions -> pg_cron -> Enable
--   On a plain PostgreSQL 17 test database:  create extension pg_cron;
--
--   If pg_cron is absent this migration still succeeds and only raises a
--   notice, so local/test databases are never broken. Enable pg_cron later and
--   run the `cron.schedule(...)` statement printed in the notice (also in
--   README.md).
--
-- If the old unsafe 003 draft was ever applied to a database, re-run
-- 20261023000200_game_rpcs.sql once afterwards: it is idempotent and restores
-- the audited finalize_room()/leave_room() bodies that the draft replaced.
-- ============================================================================

-- 1. Remove jobs left by the earlier unsafe draft (and any previous copy of
--    this job) so the migration is idempotent. ---------------------------------
do $$
declare
  v_job_id bigint;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    for v_job_id in
      select jobid
      from cron.job
      where jobname in (
        'delete-abandoned-rooms',
        'delete-finished-rooms',
        'delete-inactive-rooms',
        'chor-police-cleanup-rooms'
      )
    loop
      begin
        perform cron.unschedule(v_job_id);
      exception
        when others then
          -- Very old pg_cron versions raise if a job disappears mid-loop.
          null;
      end;
    end loop;
  end if;
end;
$$;

-- 2. Schedule the single authoritative cleanup body every minute. --------------
--    cleanup_rooms() deletes rooms that:
--      * have been idle for 30 minutes, or
--      * are past cleanup_at (abandoned rooms get a 120-second download window
--        in finalize_room; explicit leave deletes immediately in leave_room),
--    and prunes reactions older than one day.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'chor-police-cleanup-rooms',
      '* * * * *',
      'select public.cleanup_rooms();'
    );
    raise notice 'pg_cron: scheduled chor-police-cleanup-rooms every minute.';
  else
    raise notice 'pg_cron is not enabled. Enable it, then run: select cron.schedule(''chor-police-cleanup-rooms'', ''* * * * *'', ''select public.cleanup_rooms();'');';
  end if;
end;
$$;

-- 3. Re-assert privileges (defensive; no function bodies change here). ---------
--    cleanup_rooms() and finalize_room() are server-side only.
revoke all on function public.cleanup_rooms() from public, anon, authenticated;
revoke all on function public.finalize_room(uuid, text) from public, anon, authenticated;
--    leave_room() is a client RPC for anonymous-auth sessions only.
revoke all on function public.leave_room(uuid) from public, anon;
grant execute on function public.leave_room(uuid) to authenticated;

-- 4. Verification (read-only; run manually after applying). --------------------
--    select extname from pg_extension where extname = 'pg_cron';
--    select jobid, jobname, schedule, command, active
--      from cron.job where jobname = 'chor-police-cleanup-rooms';
--    select public.cleanup_rooms();  -- manual run if pg_cron is unavailable
