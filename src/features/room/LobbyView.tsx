import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import {
  Check,
  Clock3,
  Copy,
  Crown,
  Facebook,
  Link2,
  LogOut,
  MessageCircle,
  Minus,
  Pencil,
  Plus,
  Send,
  Share2,
  UserPlus,
  WifiOff,
} from 'lucide-react';
import { AvatarPicker } from '@/components/ui/AvatarPicker';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Modal } from '@/components/ui/Modal';
import { GAME_CONFIG } from '@/config/game';
import { toast } from '@/hooks/useToastStore';
import { cn } from '@/lib/cn';
import { copyText } from '@/lib/clipboard';
import { haptics } from '@/lib/haptics';
import { localizeNumber } from '@/lib/numbers';
import { canNativeShare, messengerUrl, nativeShare, roomUrl, telegramUrl, whatsappUrl } from '@/lib/share';
import { sound } from '@/lib/sound';
import type { PlayerPublic, RoomState } from '@/types';

interface LobbyViewProps {
  state: RoomState;
  me: PlayerPublic;
  busy: string | null;
  connected: boolean;
  onReady: () => Promise<boolean>;
  onRounds: (rounds: number) => Promise<boolean>;
  onStart: () => Promise<boolean>;
  onAvatar: (avatar: string) => Promise<boolean>;
  onLeave: () => Promise<void>;
}

const ONLINE_WINDOW_MS = 40_000;

export function LobbyView({
  state,
  me,
  busy,
  connected,
  onReady,
  onRounds,
  onStart,
  onAvatar,
  onLeave,
}: LobbyViewProps) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const [roundsDraft, setRoundsDraft] = useState(state.room.totalRounds);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [avatarDraft, setAvatarDraft] = useState(me.avatar);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  const previousPlayerIds = useRef<string[]>([]);

  const code = state.room.code;
  const url = roomUrl(code);
  const inviteMessage = t('lobby.inviteText', { name: me.name, code, url });
  const serverNow = Date.parse(state.serverNow) || Date.now();

  useEffect(() => {
    setRoundsDraft(state.room.totalRounds);
  }, [state.room.totalRounds]);

  useEffect(() => {
    setAvatarDraft(me.avatar);
  }, [me.avatar]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(null), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  // Audible lobby arrivals/departures, without replaying on every poll.
  useEffect(() => {
    const ids = state.players.map((player) => player.id);
    const previous = previousPlayerIds.current;
    if (previous.length > 0 && ids.length !== previous.length) {
      sound.play(ids.length > previous.length ? 'join' : 'flip');
    }
    previousPlayerIds.current = ids;
  }, [state.players]);

  const onlineById = new Map<string, boolean>();
  state.players.forEach((player) => {
    const lastSeen = Date.parse(player.lastSeenAt);
    const fresh = player.id === me.id || (player.isOnline && !Number.isNaN(lastSeen) && serverNow - lastSeen < ONLINE_WINDOW_MS);
    onlineById.set(player.id, fresh);
  });

  const readyCount = state.players.filter((player) => player.isReady).length;
  const allFilled = state.players.length === 4;
  const allReady = allFilled && readyCount === 4;
  const allOnline = allFilled && state.players.every((player) => onlineById.get(player.id));
  const canStart = me.isHost && allFilled && allReady && allOnline;
  const waitingNames = state.players
    .filter((player) => !player.isReady || !onlineById.get(player.id))
    .map((player) => player.name);

  let startHint = t('lobby.allReady');
  if (!allFilled) startHint = t('lobby.notEnough');
  else if (!allOnline) startHint = t('errors.PLAYERS_OFFLINE');
  else if (!allReady) startHint = t('lobby.notAllReady');

  function playClick() {
    sound.play('click');
    haptics.tap();
  }

  async function copyCode() {
    const ok = await copyText(code);
    if (ok) {
      setCopied('code');
      playClick();
    } else {
      sound.play('oops');
      haptics.error();
    }
    toast(ok ? t('invite.codeCopied') : t('invite.copyFailed'), ok ? 'success' : 'error');
  }

  async function copyLink() {
    const ok = await copyText(url);
    if (ok) {
      setCopied('link');
      playClick();
    } else {
      sound.play('oops');
      haptics.error();
    }
    toast(ok ? t('invite.linkCopied') : t('invite.copyFailed'), ok ? 'success' : 'error');
  }

  function openSocial(target: string) {
    playClick();
    window.open(target, '_blank', 'noopener,noreferrer');
  }

  async function shareEverywhere() {
    const outcome = await nativeShare({ title: t('invite.title'), text: inviteMessage });
    if (outcome === 'shared') {
      sound.play('join');
      toast(t('invite.shared'), 'success');
      return;
    }
    if (outcome === 'unsupported') {
      await copyLink();
    }
  }

  async function saveRounds(rounds: number) {
    setRoundsDraft(rounds);
    if (!Number.isInteger(rounds) || rounds < GAME_CONFIG.minRounds || rounds > GAME_CONFIG.maxRounds) return;
    if (rounds === state.room.totalRounds) return;
    const ok = await onRounds(rounds);
    if (ok) toast(t('lobby.roundsUpdated'), 'success');
  }

  function openAvatar() {
    setAvatarDraft(me.avatar);
    setAvatarOpen(true);
    playClick();
  }

  async function saveAvatar() {
    const ok = await onAvatar(avatarDraft);
    if (ok) {
      setAvatarOpen(false);
      toast(t('lobby.avatarSaved'), 'success');
    }
  }

  async function confirmLeave() {
    await onLeave();
    setLeaveOpen(false);
  }

  return (
    <div className="relative mx-auto w-full max-w-5xl px-4 pb-10 pt-5 sm:px-6 sm:pt-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 font-hand text-lg font-bold text-terracotta">
            <span
              className={cn(
                'inline-block h-2 w-2 rounded-full',
                connected ? 'bg-leaf' : 'bg-mustard',
              )}
              aria-hidden
            />
            {connected ? t('lobby.title') : t('room.reconnecting')}
          </p>
          <h1 className="mt-1 font-display text-[clamp(1.55rem,6vw,2.4rem)] font-bold leading-tight text-ink">
            {t('lobby.subtitle')}
          </h1>
        </div>

        <button
          type="button"
          onClick={() => void copyCode()}
          className="group flex shrink-0 items-center gap-2.5 rounded-[10px] border-2 border-ink/15 bg-paper-light px-3 py-1.5 text-left shadow-[0_3px_0_rgba(32,51,70,.1)] transition-all hover:-translate-y-0.5 hover:border-ink/30"
          aria-label={`${t('common.roomCode')}: ${code}`}
        >
          <span>
            <span className="block text-[9px] font-bold uppercase tracking-[0.15em] text-ink-faint">
              {t('common.roomCode')}
            </span>
            <span className="block font-mono text-xl font-bold tracking-[0.2em] text-ink">{code}</span>
          </span>
          {copied === 'code' ? (
            <Check className="h-4 w-4 text-leaf" aria-hidden />
          ) : (
            <Copy className="h-4 w-4 text-ink-faint transition-colors group-hover:text-terracotta" aria-hidden />
          )}
        </button>
      </header>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <section aria-labelledby="lobby-seats">
          <div className="mb-2 flex items-center justify-between gap-2 px-0.5">
            <h2 id="lobby-seats" className="font-hand text-xl font-bold text-ink">
              {t('common.seats')}
            </h2>
            <span className="rounded-full border border-ink/10 bg-paper-light px-2.5 py-0.5 text-[11px] font-semibold text-ink-soft">
              {t('lobby.seatsReady', { ready: localizeNumber(readyCount, language) })}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
            {[1, 2, 3, 4].map((seat) => {
              const player = state.players.find((entry) => entry.seat === seat);
              if (!player) {
                return (
                  <button
                    key={seat}
                    type="button"
                    onClick={() => {
                      setInviteOpen(true);
                      playClick();
                    }}
                    className="group relative flex min-h-[158px] w-full flex-col items-center justify-center gap-1 rounded-[12px] border-2 border-dashed border-ink/20 bg-paper-light/70 px-3 py-4 text-center transition-all hover:-translate-y-0.5 hover:border-ink/35 hover:bg-paper-light hover:shadow-paper"
                  >
                    <span className="absolute left-2.5 top-1.5 font-hand text-xs font-semibold text-ink-faint">
                      {localizeNumber(seat, language)}
                    </span>
                    <span className="grid h-12 w-12 place-items-center rounded-full border-2 border-dashed border-ink/25 text-ink-faint transition-colors group-hover:border-teal group-hover:text-teal">
                      <Plus className="h-5 w-5" aria-hidden />
                    </span>
                    <span className="font-display text-[15px] font-bold text-ink-soft">{t('lobby.emptySeat')}</span>
                    <span className="text-[11px] leading-tight text-ink-faint">{t('lobby.emptySeatSub')}</span>
                  </button>
                );
              }

              const isMe = player.id === me.id;
              const online = onlineById.get(player.id) ?? player.isOnline;
              return (
                <motion.div
                  key={player.id}
                  layout
                  initial={{ opacity: 0, y: 8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  whileHover={{ y: -3 }}
                  transition={{ duration: 0.22 }}
                  className={cn(
                    'relative flex min-h-[158px] flex-col items-center justify-center rounded-[12px] border-2 px-3 py-4 text-center shadow-paper transition-shadow hover:shadow-paper-lift',
                    isMe ? 'border-mustard/70 bg-[#fffaec]' : 'border-ink/10 bg-paper-light',
                    !online && 'bg-paper-deep/30',
                  )}
                >
                  <span className="absolute left-2.5 top-1.5 font-hand text-xs font-semibold text-ink-faint">
                    {localizeNumber(seat, language)}
                  </span>
                  {player.isHost && (
                    <span className="absolute right-2 top-1.5 text-mustard" title={t('common.host')}>
                      <Crown className="h-5 w-5 -rotate-6 drop-shadow-sm" aria-hidden />
                    </span>
                  )}

                  <button
                    type="button"
                    disabled={!isMe}
                    onClick={openAvatar}
                    aria-label={isMe ? t('lobby.changeAvatar') : player.name}
                    title={isMe ? t('lobby.changeAvatar') : undefined}
                    className={cn(
                      'group relative grid h-16 w-16 shrink-0 place-items-center rounded-full border-2 text-3xl transition-transform',
                      isMe
                        ? 'cursor-pointer border-ink/20 bg-paper-light shadow-[0_3px_0_rgba(32,51,70,.12)] hover:-translate-y-0.5'
                        : 'cursor-default border-ink/10 bg-paper',
                      !online && 'opacity-50 grayscale',
                    )}
                  >
                    <span aria-hidden>{player.avatar}</span>
                    {isMe && (
                      <span className="absolute -bottom-0.5 -right-0.5 grid h-5 w-5 place-items-center rounded-full border border-ink/20 bg-paper-light text-ink-soft shadow-sm">
                        <Pencil className="h-2.5 w-2.5" aria-hidden />
                      </span>
                    )}
                  </button>

                  <p className="mt-2 max-w-full truncate font-display text-[16px] font-bold leading-tight text-ink">
                    {player.name}
                  </p>

                  <div className="mt-1 flex flex-wrap items-center justify-center gap-1">
                    {isMe && (
                      <span className="rounded-sm bg-ink px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-paper-light">
                        {t('common.you')}
                      </span>
                    )}
                    {player.isHost && (
                      <span className="rounded-sm bg-mustard/40 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#6a4a0d]">
                        {t('common.host')}
                      </span>
                    )}
                  </div>

                  <div className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold">
                    {!online ? (
                      <span className="inline-flex items-center gap-1 text-terracotta">
                        <WifiOff className="h-3 w-3" aria-hidden />
                        {t('lobby.offlineSeat')}
                      </span>
                    ) : player.isReady ? (
                      <span className="inline-flex items-center gap-1 text-leaf">
                        <Check className="h-3 w-3" aria-hidden />
                        {t('common.ready')}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-ink-faint">
                        <Clock3 className="h-3 w-3" aria-hidden />
                        {t('common.notReady')}
                      </span>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink/10 bg-paper-light px-3 py-2 text-[11px] leading-snug text-ink-soft">
            <span className="inline-flex items-center gap-1.5">
              <UserPlus className="h-3.5 w-3.5 text-teal" aria-hidden />
              {allFilled ? t('lobby.full') : t('lobby.waitingForPlayers')}
            </span>
            {waitingNames.length > 0 && allFilled && (
              <span className="font-hand text-sm text-terracotta">
                {t('lobby.waitingFor', { names: waitingNames.slice(0, 3).join(', ') })}
              </span>
            )}
          </div>
        </section>

        <aside className="space-y-3">
          <section className="paper relative overflow-hidden rounded-[12px] border border-ink/10 p-4">
            <div className="tape -top-3 left-8 h-5 w-16 rotate-[-3deg]" aria-hidden />
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-hand text-lg font-bold leading-tight text-terracotta">
                  {me.isReady ? t('common.ready') : t('common.notReady')}
                </p>
                <p className="text-[11px] font-medium text-ink-soft">
                  {t('lobby.seatsReady', { ready: localizeNumber(readyCount, language) })}
                </p>
              </div>
              <div className="flex -space-x-1.5 pt-0.5" aria-hidden>
                {state.players.map((player) => (
                  <span
                    key={player.id}
                    className={cn(
                      'grid h-7 w-7 place-items-center rounded-full border-2 bg-paper-light text-xs',
                      player.isReady ? 'border-leaf/60' : 'border-ink/10 opacity-60',
                    )}
                  >
                    {player.avatar}
                  </span>
                ))}
              </div>
            </div>

            <Button
              fullWidth
              size="lg"
              variant={me.isReady ? 'secondary' : 'accent'}
              className="mt-3"
              loading={busy === 'ready'}
              disabled={busy !== null && busy !== 'ready'}
              leftIcon={me.isReady ? <Check className="h-4 w-4" aria-hidden /> : undefined}
              onClick={() => void onReady()}
            >
              {me.isReady ? t('lobby.unreadyButton') : t('lobby.readyButton')}
            </Button>
            <p className="mt-2 text-center text-[11px] leading-snug text-ink-soft">
              {me.isHost
                ? allReady
                  ? t('lobby.allReady')
                  : t('lobby.readyHint')
                : allReady
                  ? t('lobby.waitingHost')
                  : t('lobby.guestHint')}
            </p>
          </section>

          {me.isHost ? (
            <section className="relative overflow-hidden rounded-[12px] border-2 border-ink/15 bg-[#f7e7b9] p-4 shadow-paper">
              <div className="tape -top-2 right-5 h-5 w-14 rotate-[2deg]" aria-hidden />
              <div className="flex items-center gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-mustard/55 text-ink">
                  <Crown className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <p className="font-hand text-lg font-bold leading-none text-ink">{t('lobby.hostDesk')}</p>
                  <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-soft">
                    {t('lobby.youAreHost')}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-ink">{t('lobby.roundPicker')}</span>
                <span className="font-hand text-2xl font-bold leading-none text-ink">
                  {localizeNumber(roundsDraft, language)}
                </span>
              </div>

              <div className="mt-2 grid grid-cols-4 gap-1.5">
                {GAME_CONFIG.roundPresets.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    aria-pressed={roundsDraft === preset}
                    disabled={busy !== null}
                    onClick={() => void saveRounds(preset)}
                    className={cn(
                      'flex h-9 items-baseline justify-center gap-0.5 rounded-lg border-2 font-hand text-base font-bold transition-all',
                      roundsDraft === preset
                        ? 'border-ink bg-paper-light text-ink shadow-[0_2px_0_rgba(32,51,70,.18)]'
                        : 'border-ink/15 bg-paper-light/50 text-ink-soft hover:border-ink/30',
                    )}
                  >
                    {localizeNumber(preset, language)}
                    <span className="text-[9px] font-normal opacity-60">{language === 'bn' ? 'র' : 'R'}</span>
                  </button>
                ))}
              </div>

              <div className="mt-2 flex items-center gap-2">
                <div className="inline-flex h-9 shrink-0 items-center rounded-lg border border-ink/15 bg-paper-light/70">
                  <button
                    type="button"
                    aria-label={t('lobby.roundPicker')}
                    disabled={roundsDraft <= GAME_CONFIG.minRounds || busy !== null}
                    onClick={() => setRoundsDraft((value) => Math.max(GAME_CONFIG.minRounds, value - 1))}
                    className="grid h-full w-9 place-items-center rounded-l-lg text-ink-soft transition-colors hover:bg-ink/5 disabled:opacity-35"
                  >
                    <Minus className="h-3.5 w-3.5" aria-hidden />
                  </button>
                  <span className="min-w-7 text-center font-mono text-sm font-bold text-ink">
                    {localizeNumber(roundsDraft, language)}
                  </span>
                  <button
                    type="button"
                    aria-label={t('lobby.roundPicker')}
                    disabled={roundsDraft >= GAME_CONFIG.maxRounds || busy !== null}
                    onClick={() => setRoundsDraft((value) => Math.min(GAME_CONFIG.maxRounds, value + 1))}
                    className="grid h-full w-9 place-items-center rounded-r-lg text-ink-soft transition-colors hover:bg-ink/5 disabled:opacity-35"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
                <Button
                  size="sm"
                  variant="paper"
                  fullWidth
                  loading={busy === 'rounds'}
                  disabled={roundsDraft === state.room.totalRounds || busy !== null}
                  onClick={() => void saveRounds(roundsDraft)}
                >
                  {t('lobby.changeRounds')}
                </Button>
              </div>

              <div className="squiggle-divider my-3" aria-hidden />

              <Button
                fullWidth
                size="lg"
                variant="primary"
                loading={busy === 'start'}
                disabled={!canStart || (busy !== null && busy !== 'start')}
                onClick={() => void onStart()}
                leftIcon={<Crown className="h-4 w-4" aria-hidden />}
              >
                {t('lobby.startButton')}
              </Button>
              <p className="mt-2 text-center text-[11px] font-medium leading-snug text-ink-soft">{startHint}</p>
            </section>
          ) : (
            <section className="rounded-[12px] border border-ink/10 bg-paper-light/55 p-4">
              <p className="flex items-start gap-2 text-[13px] leading-relaxed text-ink-soft">
                <Crown className="mt-0.5 h-4 w-4 shrink-0 text-mustard" aria-hidden />
                <span>
                  <strong className="font-semibold text-ink">{t('lobby.waitingHost')}</strong>
                  <br />
                  {t('lobby.guestHint')}
                </span>
              </p>
            </section>
          )}

          <section className="paper relative overflow-hidden rounded-[12px] border border-ink/10 p-4">
            <div className="flex items-start gap-2.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-teal/10 text-teal">
                <UserPlus className="h-4.5 w-4.5" aria-hidden />
              </span>
              <div className="min-w-0">
                <h2 className="font-display text-[17px] font-bold leading-tight text-ink">
                  {t('lobby.inviteTitle')}
                </h2>
                <p className="mt-0.5 text-[11px] leading-snug text-ink-soft">{t('lobby.inviteSub')}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void copyCode()}
              className="mt-3 flex w-full items-center justify-between gap-3 rounded-lg border-2 border-dashed border-ink/20 bg-paper-light px-3 py-2 text-left transition-colors hover:border-teal/50"
            >
              <span>
                <span className="block text-[9px] font-bold uppercase tracking-[0.14em] text-ink-faint">
                  {t('common.roomCode')}
                </span>
                <span className="block font-mono text-lg font-bold tracking-[0.22em] text-ink">{code}</span>
              </span>
              {copied === 'code' ? (
                <Check className="h-4 w-4 shrink-0 text-leaf" aria-hidden />
              ) : (
                <Copy className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
              )}
            </button>

            <div className="mt-2 grid grid-cols-2 gap-2">
              <Button
                size="sm"
                variant="paper"
                onClick={() => void copyLink()}
                leftIcon={copied === 'link' ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Link2 className="h-3.5 w-3.5" aria-hidden />}
              >
                {copied === 'link' ? t('invite.linkCopied') : t('lobby.copyLink')}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setInviteOpen(true);
                  playClick();
                }}
                leftIcon={<Share2 className="h-3.5 w-3.5" aria-hidden />}
              >
                {t('lobby.inviteFriends')}
              </Button>
            </div>
          </section>

          <button
            type="button"
            onClick={() => {
              setLeaveOpen(true);
              playClick();
            }}
            className="mx-auto flex min-h-10 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-ink-faint transition-colors hover:bg-ink/5 hover:text-terracotta"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden />
            {t('common.leave')}
          </button>
        </aside>
      </div>

      <p className="mt-7 text-center font-hand text-sm text-ink-faint">{t('landing.privacy')}</p>

      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title={t('lobby.inviteTitle')}
        description={t('lobby.inviteSub')}
        closeLabel={t('common.close')}
      >
        <div className="space-y-3 pb-1">
          <div className="rounded-xl border border-ink/10 bg-paper-deep/25 p-4 text-center">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-faint">{t('common.roomCode')}</p>
            <p className="mt-1 font-mono text-3xl font-bold tracking-[0.28em] text-ink">{code}</p>
            <Button
              size="sm"
              variant="paper"
              className="mt-2"
              onClick={() => void copyCode()}
              leftIcon={copied === 'code' ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
            >
              {copied === 'code' ? t('invite.codeCopied') : t('lobby.copyCode')}
            </Button>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => openSocial(whatsappUrl(inviteMessage))}
              className="flex min-h-12 items-center gap-3 rounded-xl border-2 border-ink/10 bg-paper-light px-3 py-2 text-left text-sm font-semibold text-ink transition-all hover:-translate-y-0.5 hover:border-leaf/50"
            >
              <MessageCircle className="h-5 w-5 shrink-0 text-leaf" aria-hidden />
              {t('lobby.whatsapp')}
            </button>
            <button
              type="button"
              onClick={() => openSocial(messengerUrl(url))}
              className="flex min-h-12 items-center gap-3 rounded-xl border-2 border-ink/10 bg-paper-light px-3 py-2 text-left text-sm font-semibold text-ink transition-all hover:-translate-y-0.5 hover:border-sky/50"
            >
              <Facebook className="h-5 w-5 shrink-0 text-sky" aria-hidden />
              {t('lobby.messenger')}
            </button>
            <button
              type="button"
              onClick={() => openSocial(telegramUrl(inviteMessage, url))}
              className="flex min-h-12 items-center gap-3 rounded-xl border-2 border-ink/10 bg-paper-light px-3 py-2 text-left text-sm font-semibold text-ink transition-all hover:-translate-y-0.5 hover:border-sky/50"
            >
              <Send className="h-5 w-5 shrink-0 text-sky" aria-hidden />
              {t('lobby.telegram')}
            </button>
            <button
              type="button"
              onClick={() => void copyLink()}
              className="flex min-h-12 items-center gap-3 rounded-xl border-2 border-ink/10 bg-paper-light px-3 py-2 text-left text-sm font-semibold text-ink transition-all hover:-translate-y-0.5 hover:border-ink/30"
            >
              <Link2 className="h-5 w-5 shrink-0 text-ink-soft" aria-hidden />
              {t('invite.copyLink')}
            </button>
          </div>

          {canNativeShare() && (
            <Button
              fullWidth
              variant="secondary"
              onClick={() => void shareEverywhere()}
              leftIcon={<Share2 className="h-4 w-4" aria-hidden />}
            >
              {t('lobby.nativeShare')}
            </Button>
          )}

          <p className="text-center text-[11px] leading-snug text-ink-faint">{t('landing.privacy')}</p>
        </div>
      </Modal>

      <Modal
        open={avatarOpen}
        onClose={() => setAvatarOpen(false)}
        title={t('lobby.changeAvatar')}
        description={t('lobby.avatarSaved')}
        closeLabel={t('common.close')}
        size="sm"
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" fullWidth onClick={() => setAvatarOpen(false)} disabled={busy === 'avatar'}>
              {t('common.cancel')}
            </Button>
            <Button fullWidth onClick={() => void saveAvatar()} loading={busy === 'avatar'}>
              {t('common.save')}
            </Button>
          </div>
        }
      >
        <AvatarPicker value={avatarDraft} onChange={setAvatarDraft} disabled={busy === 'avatar'} />
      </Modal>

      <ConfirmDialog
        open={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        title={me.isHost ? t('lobby.leaveTitle') : t('lobby.leaveGuestTitle')}
        description={me.isHost ? t('lobby.leaveBody') : t('lobby.leaveGuestBody')}
        confirmLabel={me.isHost ? t('game.leaveConfirm') : t('lobby.leaveGuestConfirm')}
        cancelLabel={t('leave.stay')}
        onConfirm={() => void confirmLeave()}
        loading={busy === 'leave'}
        extra={
          me.isHost ? (
            <p className="rounded-lg border border-terracotta/20 bg-terracotta/[0.05] px-3 py-2 text-[12px] leading-snug text-terracotta">
              {t('lobby.hostLeaveExtra')}
            </p>
          ) : undefined
        }
      />
    </div>
  );
}
