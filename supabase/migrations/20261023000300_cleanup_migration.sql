-- +goose Up
-- SQL statements are run sequentially
SELECT 'applying 003 pg_cron cleanup migration';

-- Create the pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule cleanup of abandoned rooms after 120 seconds
-- This cron job runs every 30 minutes to find and delete inactive rooms
SELECT cron.schedule(
  'delete-abandoned-rooms',
  '*/30 * * * *',
  $$
    DELETE FROM public.players WHERE id IN (
      SELECT p.id
      FROM public.players p
      JOIN public.rooms r ON p.room_id = r.id
      WHERE r.status = 'finished'
        AND r.finished_reason = 'abandoned'
        AND r.cleanup_at < now()
    );
  $$
);

-- Schedule cleanup of finished rooms after 120 seconds from cleanup_at
SELECT cron.schedule(
  'delete-finished-rooms',
  '*/30 * * * *',
  $$
    DELETE FROM public.rounds WHERE room_id IN (
      SELECT id FROM public.rooms WHERE status = 'finished'
        AND finished_at < now() - interval '120 seconds'
    );
  $$
);

-- Schedule deletion of finished rooms after 30 minutes of inactivity
SELECT cron.schedule(
  'delete-inactive-rooms',
  '*/30 * * * *',
  $$
    DELETE FROM public.rooms WHERE status IN ('lobby', 'playing', 'finished')
      AND cleanup_at < now() - interval '30 minutes';
  $$
);

-- Update rooms table to set cleanup_at on finalize
CREATE OR REPLACE FUNCTION public.finalize_room(p_room_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, auth, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION using message = 'UNAUTHENTICATED';
  END IF;

  UPDATE public.rooms
  SET status = 'finished',
      finished_at = now(),
      finished_reason = p_reason,
      paused_at = null,
      cleanup_at = now() + interval '120 seconds',
      updated_at = now()
  WHERE id = p_room_id;
END;
$$;

-- Update leave_room to set cleanup_at for abandoned rooms
CREATE OR REPLACE FUNCTION public.leave_room(p_room_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, auth, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_player public.players%rowtype;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION using message = 'UNAUTHENTICATED';
  END IF;

  SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT * INTO v_player FROM public.players WHERE room_id = p_room_id AND user_id = v_user;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_room.status = 'lobby' AND NOT v_player.is_host THEN
    DELETE FROM public.players WHERE id = v_player.id;
    UPDATE public.rooms SET updated_at = now() WHERE id = p_room_id;
    RETURN;
  END IF;

  IF v_room.status != 'lobby' THEN
    -- In-game leave: erase entire room for everyone
    UPDATE public.rooms
    SET status = 'finished',
        finished_at = now(),
        finished_reason = 'left',
        paused_at = null,
        cleanup_at = now() + interval '120 seconds',
        updated_at = now()
    WHERE id = p_room_id;
  ELSE
    -- Lobby guest leave: just free the seat
    DELETE FROM public.players WHERE id = v_player.id;
    UPDATE public.rooms SET updated_at = now() WHERE id = p_room_id;
  END IF;
END;
$$;

-- Update the finalize function used in SQL tests
CREATE OR REPLACE FUNCTION public.set_config(key text, value text, p_session_id uuid DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, auth, pg_temp
AS $$
BEGIN
  PERFORM set_config(key, value, p_session_id);
  RETURN value;
END;
$$;

-- Grant necessary permissions for the cron jobs
GRANT EXECUTE ON FUNCTION public.finalize_room TO public;
GRANT EXECUTE ON FUNCTION public.leave_room TO public;
GRANT EXECUTE ON FUNCTION public.set_config TO public;

COMMENT ON EXTENSION pg_cron IS 'Schedule cleanup of abandoned and finished rooms';