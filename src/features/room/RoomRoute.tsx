import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Clock3,
  LockKeyhole,
  PhoneOff,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { GAME_CONFIG } from '@/config/game';
import { useToastStore } from '@/hooks/useToastStore';
import { cn } from '@/lib/cn';
import { loadProfileDraft } from '@/lib/profileDraft';
import { sound } from '@/lib/sound';
import { haptics } from '@/lib/haptics';
import { useRoomSession, type JoinInput } from './useRoomSession';
import { LobbyView } from './LobbyView';
import { RoomPreviewView } from './RoomPreviewView';
import { GameTable } from './GameTable';

export function RoomRoute() {
  const { code } = useParams<{ code: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const pushToast = useToastStore((state) => state.push);

  const session = useRoomSession({ code: code?.toUpperCase() ?? '' });
  const {
    status,
    state,
    peek,
    errorCode,
    actionError,
    busy,
    connected,
    join,
    leave,
    retry,
    toggleReady,
    updateRounds,
    start,
    updateAvatar,
  } = session;

  const normalizedCode = code ? code.toUpperCase() : '';
  const [profileDraft] = useState(loadProfileDraft);
  const setupMode = status === 'setup';
  const errorMode = status === 'error';
  const closedMode = status === 'closed';
  const joinedMode = status === 'joined';

  const errorText = (() => {
    if (!errorCode) return t('room.notFoundBody');
    const key = `errors.${errorCode}`;
    const translated = t(key);
    return translated !== key ? translated : t('room.notFoundBody');
  })();

  // If we ever re-enter this route with an erased room, show the closed state
  // with a path back home instead of silently looping.
  useEffect(() => {
    if (!joinedMode && errorCode === 'ROOM_NOT_FOUND') {
      pushToast(t('room.closedKicker'), 'error');
    }
  }, [errorCode, pushToast, joinedMode, t]);

  const goHome = useCallback(() => {
    haptics.tap();
    sound.play('click');
    navigate('/', { replace: true });
  }, [navigate]);

  const goJoin = useCallback(() => {
    haptics.tap();
    sound.play('click');
    navigate('/?tab=join', { replace: true });
  }, [navigate]);

  const handleRetry = useCallback(() => {
    haptics.tap();
    sound.play('flip');
    retry();
  }, [retry]);

  return (
    <div className="game-desk fullscreen-fallback">
      <ToasterLikeBanner connected={connected} status={status} onRefresh={handleRetry} />

      {/* ── Setup: Supabase not configured ── */}
      {setupMode && (
        <AnimatePresence>
          <motion.div
            key="setup"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="relative mx-auto max-w-md px-5 pt-safe pb-16 sm:pt-12 sm:px-7"
          >
            <LoadingScreen
              title={t('room.setupTitle')}
              subtitle={t('room.setupBody')}
              fullScreen={false}
              dark
            />
            <Button
              className="mt-8"
              fullWidth
              variant="secondary"
              onClick={handleRetry}
              leftIcon={<Clock3 className="h-4 w-4" aria-hidden />}
            >
              {t('common.refresh')}
            </Button>
          </motion.div>
        </AnimatePresence>
      )}

      {/* ── Error: invalid code / not found ── */}
      {errorMode && !closedMode && (
        <AnimatePresence>
          <motion.div
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="relative mx-auto max-w-xl px-5 pt-safe pb-16 sm:pt-12 sm:px-7"
          >
            <div className="paper relative rounded-[12px] border border-ink/10 px-6 pb-7 pt-8 shadow-paper-lift sm:px-8">
              <div className="tape -top-3 left-1/2 h-6 w-24 -translate-x-1/2 rotate-[-1deg]" aria-hidden />
              <h2 className="font-display text-xl font-bold text-ink">{t('room.notFoundTitle')}</h2>
              <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-soft">{errorText}</p>
              <div className="mt-4 flex items-center gap-2 rounded-lg border border-ink/10 bg-paper-deep/20 px-3 py-2">
                <LockKeyhole className="h-4 w-4 text-teal" aria-hidden />
                <span className="font-mono text-xs font-bold tracking-[0.2em] text-ink">
                  {normalizedCode || '—'}
                </span>
              </div>
              <div className="mt-6 flex flex-col gap-2">
                <Button fullWidth variant="primary" onClick={goHome} leftIcon={<ArrowLeft className="h-4 w-4" aria-hidden />}>
                  {t('common.backHome')}
                </Button>
                <Button variant="secondary" fullWidth onClick={goJoin}>
                  {t('landing.joinTab')}
                </Button>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      )}

      {/* ── Closed: room was erased / abandoned ── */}
      {closedMode && (
        <AnimatePresence>
          <motion.div
            key="closed"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="relative mx-auto max-w-xl px-5 pt-safe pb-16 sm:pt-12 sm:px-7"
          >
            <div className="paper relative rounded-[12px] border border-ink/10 px-6 pb-7 pt-8 shadow-paper-lift sm:px-8">
              <div className="tape -top-3 left-1/2 h-6 w-24 -translate-x-1/2 rotate-[-1deg]" aria-hidden />
              <h2 className="font-display text-xl font-bold text-ink">{t('result.roomClosedTitle')}</h2>
              <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-soft">{t('result.roomClosedBody')}</p>
              <div className="mt-6">
                <Button fullWidth variant="primary" onClick={goHome} leftIcon={<ArrowLeft className="h-4 w-4" aria-hidden />}>
                  {t('common.backHome')}
                </Button>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      )}

      {/* ── Preview: room exists but we are not a member yet ── */}
      {status === 'preview' && peek && (
        <AnimatePresence>
          <motion.div
            key="preview"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="relative mx-auto max-w-xl px-5 pt-safe pb-16 sm:pt-12 sm:px-7"
          >
            <RoomPreviewView
              peek={peek}
              initialName={profileDraft?.name ?? ''}
              initialAvatar={profileDraft?.avatar ?? GAME_CONFIG.avatars[0]}
              busy={busy}
              actionError={actionError}
              onJoin={(input: JoinInput) => join(input)}
            />
          </motion.div>
        </AnimatePresence>
      )}

      {/* ── Joined: lobby or game ── */}
      {joinedMode && state && (
        <AnimatePresence>
          <motion.div
            key={state.room.status === 'lobby' ? 'lobby' : 'game'}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.25 }}
            className={cn(
              'relative min-h-screen',
              state.room.status === 'lobby' && 'bg-paper',
            )}
          >
            {state.room.status === 'lobby' ? (
              <LobbyView
                state={state}
                me={state.players.find((player) => player.id === state.me.id) ?? state.players[0]!}
                busy={busy}
                connected={connected}
                onReady={toggleReady}
                onRounds={updateRounds}
                onStart={start}
                onAvatar={(avatar: string) => updateAvatar(avatar)}
                onLeave={leave}
              />
            ) : (
              <GameTable session={session} />
            )}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}

interface ToasterLikeBannerProps {
  connected: boolean;
  status: string;
  onRefresh: () => void;
}

function ToasterLikeBanner({ connected, status, onRefresh }: ToasterLikeBannerProps) {
  const { t } = useTranslation();
  const [shown, setShown] = useState(false);

  useEffect(() => {
    // Show only while disconnected; a short delay avoids a flash during a
    // normal reconnect.
    if (connected || status === 'setup') {
      setShown(false);
      return;
    }
    const timer = window.setTimeout(() => setShown(true), 100);
    return () => window.clearTimeout(timer);
  }, [connected, status]);

  if (!shown) return null;

  const label = status === 'joined' ? t('room.disconnected') : t('room.reconnecting');

  return (
    <div className="fixed top-2 left-1/2 -translate-x-1/2 z-[90] flex items-center gap-2 rounded-full border-2 border-terracotta bg-terracotta px-3 py-1.5 text-xs font-semibold text-paper-light shadow-[0_4px_12px_rgba(184,75,61,.25)] animate-paper-float">
      <PhoneOff className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{label}</span>
      {status === 'joined' && !connected && (
        <button type="button" onClick={onRefresh} className="ml-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-ink text-paper-light text-[10px] font-bold">
          {t('common.refresh')}
        </button>
      )}
    </div>
  );
}
