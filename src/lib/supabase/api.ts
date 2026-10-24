import type { RoomState, PeekRoom } from '@/types';
import { ensureAnonymousUser, supabase } from './client';

function client() {
  if (!supabase) throw new Error('NETWORK');
  return supabase;
}

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  await ensureAnonymousUser();
  const { data, error } = await client().rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}

function passCode(code: string): string {
  return code.trim().toUpperCase();
}

export async function createRoom(input: {
  name: string;
  avatar: string;
  rounds: number;
  requestId: string;
}): Promise<{ code: string; roomId: string }> {
  return rpc('create_room', {
    p_name: input.name.trim(),
    p_avatar: input.avatar,
    p_rounds: input.rounds,
    p_request_id: input.requestId,
  });
}

export async function joinRoom(input: {
  code: string;
  name: string;
  avatar: string;
}): Promise<{ code: string; roomId: string }> {
  return rpc('join_room', {
    p_code: passCode(input.code),
    p_name: input.name.trim(),
    p_avatar: input.avatar,
  });
}

export async function peekRoom(code: string): Promise<PeekRoom> {
  return rpc('peek_room', { p_code: passCode(code) });
}

export async function getRoomState(code: string): Promise<RoomState> {
  return rpc('get_room_state', { p_code: passCode(code) });
}

export async function getMyRoom(): Promise<{ code: string; roomId: string } | null> {
  return rpc('find_my_room', {});
}

export async function syncRoom(roomId: string): Promise<RoomState> {
  return rpc('sync_room', { p_room_id: roomId });
}

export async function setReady(roomId: string, ready: boolean): Promise<void> {
  await rpc('set_ready', { p_room_id: roomId, p_ready: ready });
}

export async function setRounds(roomId: string, rounds: number): Promise<void> {
  await rpc('set_rounds', { p_room_id: roomId, p_rounds: rounds });
}

export async function startGame(roomId: string): Promise<void> {
  await rpc('start_game', { p_room_id: roomId });
}

export async function pickSlip(roomId: string, slot: number): Promise<void> {
  await rpc('pick_slip', { p_room_id: roomId, p_slot: slot });
}

export async function babuRise(roomId: string): Promise<RoomState> {
  return rpc('babu_rise', { p_room_id: roomId });
}

export async function askPolice(roomId: string): Promise<RoomState> {
  return rpc('ask_police', { p_room_id: roomId });
}

export async function policeRise(roomId: string): Promise<RoomState> {
  return rpc('police_rise', { p_room_id: roomId });
}

export async function policeGuess(roomId: string, playerId: string): Promise<void> {
  await rpc('police_guess', { p_room_id: roomId, p_guessed_player_id: playerId });
}

export async function advancePhase(roomId: string, expectedPhase: string): Promise<RoomState> {
  return rpc('advance_phase', { p_room_id: roomId, p_phase: expectedPhase });
}

export async function sendReaction(roomId: string, emoji: string): Promise<void> {
  await rpc('send_reaction', { p_room_id: roomId, p_emoji: emoji });
}

export async function leaveRoom(roomId: string): Promise<void> {
  await rpc('leave_room', { p_room_id: roomId });
}

export async function changeAvatar(roomId: string, avatar: string): Promise<void> {
  await rpc('change_avatar', { p_room_id: roomId, p_avatar: avatar });
}

export async function heartbeat(roomId: string): Promise<void> {
  await rpc('heartbeat', { p_room_id: roomId });
}
