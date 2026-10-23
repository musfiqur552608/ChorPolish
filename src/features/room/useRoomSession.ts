import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import type { PeekRoom, RoomState } from '@/types';
import {
  advancePhase,
  changeAvatar,
  getRoomState,
  joinRoom,
  leaveRoom,
  peekRoom,
  pickSlip,
  policeGuess,
  sendReaction,
  setReady,
  setRounds,
  startGame,
  syncRoom,
} from '@/lib/supabase/api';
import { ensureAnonymousUser, isSupabaseConfigured, supabase } from '@/lib/supabase/client';
import { normalizeApiError, userErrorMessage } from '@/lib/errors';
import { useToastStore } from '@/hooks/useToastStore';
import { clearRecentRoom, saveProfileDraft } from '@/lib/profileDraft';
import { sound } from '@/lib/sound';
import { haptics } from '@/lib/haptics';

export type RoomViewStatus = 'loading' | 'setup' | 'error' | 'closed' | 'preview' | 'joined';

export interface JoinInput {
  name: string;
  avatar: string;
}

interface SessionOptions {
  code: string;
  initialName?: string;
  initialAvatar?: string;
}

const PLAYER_CHANGE_KEYS = [
  'name',
  'avatar',
  'seat',
  'is_host',
  'is_ready',
  'is_online',
  'total_score',
  'babu_count',
  'final_rank',
  'disconnected_at',
];

const ROOM_CHANGE_KEYS = [
  'status',
  'total_rounds',
  'current_round',
  'host_player_id',
  'started_at',
  'finished_at',
  'finished_reason',
  'paused_at',
  'cleanup_at',
];

function madeMeaningfulChange(
  payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
  keys: string[],
): boolean {
  if (payload.eventType !== 'UPDATE') return true;
  const before = (payload.old ?? {}) as Record<string, unknown>;
  const after = (payload.new ?? {}) as Record<string, unknown>;
  return keys.some((key) => before[key] !== after[key]);
}

export function useRoomSession({ code, initialName = '', initialAvatar = '' }: SessionOptions) {
  const { t } = useTranslation();
  const tRef = useRef(t);
  tRef.current = t;

  const navigate = useNavigate();
  const pushToast = useToastStore((state) => state.push);

  const [status, setStatus] = useState<RoomViewStatus>('loading');
  const [state, setState] = useState<RoomState | null>(null);
  const [peek, setPeek] = useState<PeekRoom | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [connected, setConnected] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [bootToken, setBootToken] = useState(0);

  const stateRef = useRef<RoomState | null>(null);
  const roomIdRef = useRef<string | null>(null);
  const syncingRef = useRef(false);
  const busyRef = useRef<string | null>(null);
  const offsetRef = useRef(0);

  useEffect(() => {
    stateRef.current = state;
    roomIdRef.current = state?.room.id ?? null;
  }, [state]);

  const applyState = useCallback((next: RoomState | null) => {
    if (!next) {
      setState(null);
      stateRef.current = null;
      roomIdRef.current = null;
      return;
    }
    setState(next);
    stateRef.current = next;
    roomIdRef.current = next.room.id;
    const serverMs = Date.parse(next.serverNow);
    if (!Number.isNaN(serverMs)) offsetRef.current = serverMs - Date.now();
    setConnected(true);
    setErrorCode(null);
    setActionError(null);
    setStatus('joined');
  }, []);

  // ── Boot: identify anonymously, then either resume or preview ─────────────
  useEffect(() => {
    let cancelled = false;

    async function boot() {
      setStatus('loading');
      setErrorCode(null);
      setActionError(null);
      setPeek(null);
      setState(null);
      stateRef.current = null;
      roomIdRef.current = null;

      if (!isSupabaseConfigured) {
        if (!cancelled) setStatus('setup');
        return;
      }
      if (!/^[A-Z2-9]{6}$/.test(code)) {
        if (!cancelled) {
          setErrorCode('INVALID_ROOM_CODE');
          setStatus('error');
        }
        return;
      }

      try {
        const uid = await ensureAnonymousUser();
        if (cancelled) return;
        setUserId(uid);

        try {
          const next = await getRoomState(code);
          if (!cancelled) applyState(next);
        } catch (cause) {
          const normalized = normalizeApiError(cause);
          if (cancelled) return;
          if (normalized.code === 'NOT_MEMBER') {
            const room = await peekRoom(code);
            if (cancelled) return;
            if (!room.exists) {
              setErrorCode('ROOM_NOT_FOUND');
              setStatus('error');
              return;
            }
            setPeek(room);
            setStatus('preview');
            return;
          }
          if (normalized.code === 'ROOM_NOT_FOUND') {
            setErrorCode('ROOM_NOT_FOUND');
            setStatus('error');
            return;
          }
          throw cause;
        }
      } catch (cause) {
        if (cancelled) return;
        setErrorCode(normalizeApiError(cause).code);
        setStatus('error');
      }
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, [code, bootToken, applyState]);

  const syncNow = useCallback(
    async (silent = true) => {
      const roomId = roomIdRef.current;
      if (!roomId || syncingRef.current) return;
      syncingRef.current = true;
      try {
        const next = await syncRoom(roomId);
        applyState(next);
      } catch (cause) {
        const normalized = normalizeApiError(cause);
        if (normalized.code === 'ROOM_NOT_FOUND' || normalized.code === 'NOT_MEMBER') {
          setState(null);
          stateRef.current = null;
          roomIdRef.current = null;
          setStatus('closed');
          return;
        }
        setConnected(false);
        if (!silent) {
          pushToast(userErrorMessage(cause, tRef.current), 'error');
        }
      } finally {
        syncingRef.current = false;
      }
    },
    [applyState, pushToast],
  );

  // ── Presence / state-change nudge ────────────────────────────────────────
  useEffect(() => {
    if (!supabase || status !== 'joined') return;
    const roomId = state?.room.id;
    if (!roomId || !userId) return;

    let nudgeTimer = 0;
    const nudge = () => {
      window.clearTimeout(nudgeTimer);
      nudgeTimer = window.setTimeout(() => {
        void syncNow(true);
      }, 140);
    };

    const channel = supabase.channel(`room:${roomId}`, {
      config: { presence: { key: userId } },
    });

    channel
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${roomId}` },
        (payload) => {
          if (madeMeaningfulChange(payload, PLAYER_CHANGE_KEYS)) nudge();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        (payload) => {
          if (madeMeaningfulChange(payload, ROOM_CHANGE_KEYS)) nudge();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'round_results', filter: `room_id=eq.${roomId}` },
        nudge,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'reactions', filter: `room_id=eq.${roomId}` },
        nudge,
      )
      .on('presence', { event: 'sync' }, nudge)
      .subscribe((channelStatus) => {
        if (channelStatus === 'SUBSCRIBED') {
          setConnected(true);
          const me = stateRef.current?.players.find((player) => player.id === stateRef.current?.me.id);
          void channel
            .track({
              userId,
              name: me?.name ?? '',
              avatar: me?.avatar ?? '',
              at: Date.now(),
            })
            .catch(() => undefined);
          nudge();
        } else if (
          channelStatus === 'CHANNEL_ERROR' ||
          channelStatus === 'TIMED_OUT' ||
          channelStatus === 'CLOSED'
        ) {
          setConnected(false);
        }
      });

    return () => {
      window.clearTimeout(nudgeTimer);
      void supabase?.removeChannel(channel);
    };
  }, [status, state?.room.id, userId, syncNow]);

  // ── Safety poll. Realtime makes it feel instant; this survives socket loss ─
  useEffect(() => {
    if (status !== 'joined') return;
    let cancelled = false;
    let timer = 0;

    const loop = async () => {
      if (cancelled) return;
      if (document.visibilityState === 'visible') {
        await syncNow(true);
      }
      if (cancelled) return;
      const playing = stateRef.current?.room.status === 'playing';
      timer = window.setTimeout(() => void loop(), playing ? 2200 : 5000);
    };

    timer = window.setTimeout(() => void loop(), 1600);

    const onVisible = () => {
      if (document.visibilityState === 'visible' && !cancelled) void syncNow(true);
    };
    const onOffline = () => setConnected(false);
    const onOnline = () => void syncNow(true);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, [status, syncNow]);

  // ── Wake exactly at the server deadline ──────────────────────────────────
  useEffect(() => {
    if (status !== 'joined') return;
    const deadline = state?.round?.phaseDeadline;
    if (!deadline) return;
    const target = Date.parse(deadline);
    if (Number.isNaN(target)) return;
    const wait = target + offsetRef.current - Date.now() + 260;
    const timer = window.setTimeout(() => void syncNow(true), Math.max(250, Math.min(wait, 90_000)));
    return () => window.clearTimeout(timer);
  }, [status, state?.round?.phaseDeadline, state?.round?.phase, syncNow]);

  const join = useCallback(
    async (input: JoinInput) => {
      if (busyRef.current) return false;
      busyRef.current = 'join';
      setBusy('join');
      setActionError(null);
      try {
        await ensureAnonymousUser();
        const result = await joinRoom({ code, name: input.name.trim(), avatar: input.avatar });
        saveProfileDraft({ name: input.name.trim(), avatar: input.avatar });
        const next = await getRoomState(result.code);
        applyState(next);
        sound.play('join');
        haptics.caught();
        return true;
      } catch (cause) {
        const normalized = normalizeApiError(cause);
        if (['ROOM_FULL', 'GAME_STARTED', 'GAME_FINISHED'].includes(normalized.code)) {
          try {
            const room = await peekRoom(code);
            setPeek(room);
            if (!room.exists) {
              setErrorCode('ROOM_NOT_FOUND');
              setStatus('error');
            }
          } catch {
            // keep the original error visible
          }
        }
        const message = userErrorMessage(cause, tRef.current);
        setActionError(message);
        pushToast(message, 'error');
        haptics.error();
        return false;
      } finally {
        busyRef.current = null;
        setBusy(null);
      }
    },
    [applyState, code, pushToast],
  );

  const runAction = useCallback(
    async (
      key: string,
      action: () => Promise<RoomState | null>,
      successSound: Parameters<typeof sound.play>[0] | null = null,
    ) => {
      if (busyRef.current) return false;
      busyRef.current = key;
      setBusy(key);
      setActionError(null);
      try {
        const next = await action();
        if (next) {
          applyState(next);
        } else {
          await syncNow(true);
        }
        if (successSound) sound.play(successSound);
        return true;
      } catch (cause) {
        const normalized = normalizeApiError(cause);
        if (normalized.code === 'ROOM_NOT_FOUND' || normalized.code === 'NOT_MEMBER') {
          setState(null);
          stateRef.current = null;
          roomIdRef.current = null;
          setStatus('closed');
          return false;
        }
        const message = userErrorMessage(cause, tRef.current);
        pushToast(message, 'error');
        haptics.error();
        return false;
      } finally {
        busyRef.current = null;
        setBusy(null);
      }
    },
    [applyState, pushToast, syncNow],
  );

  const roomId = state?.room.id ?? null;
  const me = state?.players.find((player) => player.id === state?.me.id) ?? null;

  const toggleReady = useCallback(async () => {
    if (!roomId || !me) return false;
    const nextReady = !me.isReady;
    haptics.tap();
    return runAction('ready', async () => {
      await setReady(roomId, nextReady);
      return null;
    });
  }, [roomId, me, runAction]);

  const updateRounds = useCallback(
    async (rounds: number) => {
      if (!roomId) return false;
      return runAction('rounds', async () => {
        await setRounds(roomId, rounds);
        return null;
      });
    },
    [roomId, runAction],
  );

  const start = useCallback(async () => {
    if (!roomId) return false;
    haptics.caught();
    return runAction(
      'start',
      async () => {
        await startGame(roomId);
        return null;
      },
      'shuffle',
    );
  }, [roomId, runAction]);

  const pick = useCallback(
    async (slot: number) => {
      if (!roomId) return false;
      haptics.tap();
      return runAction(
        'pick',
        async () => {
          await pickSlip(roomId, slot);
          return null;
        },
        'flip',
      );
    },
    [roomId, runAction],
  );

  const guess = useCallback(
    async (playerId: string) => {
      if (!roomId) return false;
      haptics.tap();
      return runAction(
        'guess',
        async () => {
          await policeGuess(roomId, playerId);
          return null;
        },
        'gavel',
      );
    },
    [roomId, runAction],
  );

  const advance = useCallback(async () => {
    if (!roomId || !stateRef.current) return false;
    const phase = stateRef.current.round?.phase;
    if (!phase) return false;
    return runAction(
      'advance',
      async () => advancePhase(roomId, phase),
      'write',
    );
  }, [roomId, runAction]);

  const react = useCallback(
    async (emoji: string) => {
      if (!roomId) return false;
      haptics.tap();
      return runAction('react', async () => {
        await sendReaction(roomId, emoji);
        return null;
      });
    },
    [roomId, runAction],
  );

  const updateAvatar = useCallback(
    async (avatar: string) => {
      if (!roomId) return false;
      return runAction(
        'avatar',
        async () => {
          await changeAvatar(roomId, avatar);
          return null;
        },
        'flip',
      );
    },
    [roomId, runAction],
  );

  const leave = useCallback(async () => {
    if (!roomId) {
      navigate('/', { replace: true });
      return;
    }
    if (busyRef.current) return;
    busyRef.current = 'leave';
    setBusy('leave');
    try {
      await leaveRoom(roomId);
      clearRecentRoom();
      sound.play('flip');
      pushToast(tRef.current('leave.left'), 'info');
      navigate('/', { replace: true });
    } catch (cause) {
      const normalized = normalizeApiError(cause);
      if (normalized.code === 'ROOM_NOT_FOUND' || normalized.code === 'NOT_MEMBER') {
        clearRecentRoom();
        navigate('/', { replace: true });
        return;
      }
      pushToast(userErrorMessage(cause, tRef.current), 'error');
      setBusy(null);
      busyRef.current = null;
    }
  }, [roomId, navigate, pushToast]);

  const retry = useCallback(() => {
    setBootToken((token) => token + 1);
  }, []);

  return {
    status,
    state,
    peek,
    errorCode,
    actionError,
    busy,
    connected,
    userId,
    initialName,
    initialAvatar,
    me,
    join,
    leave,
    retry,
    syncNow,
    toggleReady,
    updateRounds,
    start,
    pick,
    guess,
    advance,
    react,
    updateAvatar,
  };
}
