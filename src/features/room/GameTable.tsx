import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Check,
  Clock,
  Crown,
  Eye,
  Play,
  SkipForward,
  UserRound,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Modal } from '@/components/ui/Modal';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { RoleBadge, RoleSlip } from '@/components/roles/RoleSlip';
import { AvatarPicker } from '@/components/ui/AvatarPicker';
import { GAME_CONFIG } from '@/config/game';
import { toast } from '@/hooks/useToastStore';
import { cn } from '@/lib/cn';
import { localizeNumber } from '@/lib/numbers';
import { haptics } from '@/lib/haptics';
import { sound } from '@/lib/sound';
import { ScoreSheet } from '@/features/scoresheet/ScoreSheet';
import { ExportScoreSheet } from '@/features/scoresheet/ExportScoreSheet';
import type { RoomSession } from './useRoomSession';
import type { Role } from '@/types';

const REACTIONS = GAME_CONFIG.reactions;

interface GameTableProps {
  session: RoomSession;
}

export function GameTable({ session }: GameTableProps) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;

  const {
    status,
    state,
    busy,
    connected,
    pick,
    guess,
    babuRise,
    askPolice,
    policeRise,
    advance,
    react,
    updateAvatar,
    leave,
    retry,
  } = session;

  const room = state?.room;
  const round = state?.round ?? null;
  const players = state?.players ?? [];
  const me = state?.me;
  const mePlayer = players.find((player) => player.id === me?.id) ?? null;
  const history = state?.history ?? [];
  const reactions = state?.reactions ?? [];

  const isPlaying = room?.status === 'playing';
  const isPaused = Boolean(room?.pausedAt);
  const currentRoundNumber = room?.currentRound ?? 0;
  const totalRounds = room?.totalRounds ?? 0;

  // Deadline countdown
  const deadlineRef = useRef<number>(0);
  const [guessConfirmOpen, setGuessConfirmOpen] = useState(false);
  const [guessTargetId, setGuessTargetId] = useState<string | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [avatarDraft, setAvatarDraft] = useState(mePlayer?.avatar ?? GAME_CONFIG.avatars[0]);
  // Private own-slip peek. Never fed from publicRoles — only from me.role.
  const [slipOpen, setSlipOpen] = useState(false);
  const [slipHidden, setSlipHidden] = useState(false);

  useEffect(() => {
    if (round?.phaseDeadline) {
      deadlineRef.current = Date.parse(round.phaseDeadline);
    } else {
      deadlineRef.current = 0;
    }
  }, [round?.phaseDeadline]);

  // Every new round starts with a fresh, face-up private slip.
  useEffect(() => {
    setSlipHidden(false);
    setSlipOpen(false);
  }, [round?.id]);

  const secondsLeft = () => {
    const target = deadlineRef.current;
    if (!target) return 0;
    return Math.max(0, Math.ceil((target - Date.now()) / 1000));
  };

  // Grace countdown for paused player
  const pausedPlayer = players.find(
    (player) => !player.isOnline && player.disconnectedAt,
  );
  const graceSecondsLeft = () => {
    if (!pausedPlayer?.disconnectedAt) return GAME_CONFIG.graceSeconds;
    const target = Date.parse(pausedPlayer.disconnectedAt) + GAME_CONFIG.graceSeconds * 1000;
    return Math.max(0, Math.ceil((target - Date.now()) / 1000));
  };

  const isMyTurnToPick =
    me?.id &&
    round?.phase === 'DRAW' &&
    round.activePickerId === me.id &&
    !round.pickedPlayerIds.includes(me.id);

  const isMyTurnToGuess =
    round?.phase === 'POLICE_GUESS' &&
    me?.role === 'POLICE' &&
    round.guessPlayerId === null;

  const availableSlots = round?.availableSlots ?? [];

  const publicRoles = round?.publicRoles ?? {};
  const revealedRoleFor = (playerId: string): Role | undefined =>
    (publicRoles[playerId] as Role | undefined) ?? undefined;

  const myRole = me?.role ?? null;
  const isBabu = myRole === 'BABU';
  const isPolice = myRole === 'POLICE';
  // me.role is only populated by the server once this player has actually
  // picked a slip (the shuffler receives the last slip automatically). It is
  // never derived from publicRoles, so this can only ever show your own role.
  const canViewOwnSlip = Boolean(
    myRole &&
    round &&
    !['FINAL_REVEAL', 'ROUND_RESULT', 'MATCH_END'].includes(round.phase),
  );
  const babuRisen = Boolean(round?.babuRisenAt);
  const policeCalled = Boolean(round?.policeCalledAt);
  const policeRisen = Boolean(round?.policeRisenAt);
  // Rounds dealt before the manual-flow migration have no timestamps at all.
  // In that case we keep the old automatic presentation until the migration
  // is applied, instead of leaving every table stuck on a dead button.
  const manualFlowSupported = Boolean(round && 'babuRisenAt' in round);

  const shuffler = players.find((p) => p.id === round?.shufflerId);
  const policePlayer = players.find((p) => revealedRoleFor(p.id) === 'POLICE');
  const babuPlayer = players.find((p) => revealedRoleFor(p.id) === 'BABU');

  // Everyone knows Babu and Police by this point; the two remaining players
  // are the only possible Chor/Dakat slips.
  const hiddenPlayers = players.filter(
    (p) => revealedRoleFor(p.id) !== 'BABU' && revealedRoleFor(p.id) !== 'POLICE',
  );
  const guessPickedPlayer = players.find((p) => p.id === round?.guessPlayerId) ?? null;

  const allFilled = players.length === GAME_CONFIG.seats;

  const targetLabel = round?.targetRole
    ? t(`game.target${round.targetRole === 'CHOR' ? 'Chor' : 'Dakat'}`)
    : '';

  // ── Sound / haptics helpers ──
  const playClick = () => {
    sound.play('click');
    haptics.tap();
  };

  // ── Actions ──
  const handlePick = useCallback(
    async (slot: number) => {
      playClick();
      await pick(slot);
    },
    [pick],
  );

  const handleGuess = useCallback(
    async (playerId: string) => {
      playClick();
      setGuessTargetId(playerId);
      setGuessConfirmOpen(true);
    },
    [],
  );

  const confirmGuess = useCallback(async () => {
    if (!guessTargetId) return;
    const ok = await guess(guessTargetId);
    setGuessConfirmOpen(false);
    setGuessTargetId(null);
    if (ok) sound.play('gavel');
  }, [guess, guessTargetId]);

  const handleAdvance = useCallback(async () => {
    if (!round?.phase) return;
    playClick();
    await advance();
    sound.play('write');
  }, [advance, round?.phase]);

  // ── Manual reveal steps ──
  const handleBabuRise = useCallback(async () => {
    playClick();
    await babuRise();
  }, [babuRise]);

  const handleAskPolice = useCallback(async () => {
    playClick();
    await askPolice();
  }, [askPolice]);

  const handlePoliceRise = useCallback(async () => {
    playClick();
    await policeRise();
  }, [policeRise]);

  const handleReact = useCallback(
    async (emoji: string) => {
      playClick();
      await react(emoji);
    },
    [react],
  );

  const handleLeave = useCallback(() => {
    setLeaveOpen(true);
    playClick();
  }, []);

  const confirmLeave = useCallback(async () => {
    await leave();
    setLeaveOpen(false);
  }, [leave]);

  const handleSaveAvatar = useCallback(async () => {
    const ok = await updateAvatar(avatarDraft);
    if (ok) {
      setAvatarOpen(false);
      toast(t('lobby.avatarSaved'), 'success');
    }
  }, [updateAvatar, avatarDraft, t]);

  // ── Computed display data ──
  const phaseTitle = (): string => {
    switch (round?.phase) {
      case 'SHUFFLE': return t('game.shuffler');
      case 'DRAW': return t('game.drawTitle');
      case 'HIDDEN_ROLES': return t('game.hiddenTitle');
      case 'BABU_REVEAL': return !manualFlowSupported
        ? t('game.babuRevealTitle')
        : babuRisen ? t('game.babuRisenTitle') : t('game.babuRiseTitle');
      case 'POLICE_REVEAL': return t('game.policeQuestionTitle');
      case 'BABU_ORDER': return t('game.orderTitle');
      case 'POLICE_GUESS': return t('game.policePickTitle');
      case 'FINAL_REVEAL': return t('game.revealTitle');
      case 'ROUND_RESULT': return t('game.roundResultTitle', { round: currentRoundNumber });
      case 'MATCH_END': return t('result.title');
      default: return t('game.table');
    }
  };

  const phaseSubtitle = (): string => {
    switch (round?.phase) {
      case 'SHUFFLE': return t('game.shufflingSub');
      case 'DRAW': return isMyTurnToPick ? t('game.drawYourTurn') : t('game.drawHint');
      case 'HIDDEN_ROLES': return t('game.hiddenSub');
      case 'BABU_REVEAL': return !manualFlowSupported
        ? t('game.babuSpeech')
        : babuRisen ? t('game.babuAskSub') : t('game.babuRiseSub');
      case 'POLICE_REVEAL': return t('game.policeQuestionSub');
      case 'BABU_ORDER': return t('game.orderSub');
      case 'POLICE_GUESS': return t('game.policePickSub', { target: targetLabel });
      case 'FINAL_REVEAL': return t('game.finalRevealSub');
      case 'ROUND_RESULT': return t('game.roundResultSub');
      case 'MATCH_END': return t('result.subtitle');
      default: return '';
    }
  };

  // ── Renderers per phase ──
  const renderPhaseHeader = () => (
    <header className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-ink/10 bg-paper-light text-ink font-bold text-xs">
            {localizeNumber(currentRoundNumber, language)}
          </span>
          <span className="font-display text-[18px] font-bold leading-none text-ink">{t('common.round')} {localizeNumber(currentRoundNumber, language)}</span>
        </div>
        <div className="flex items-end gap-1.5 text-right">
          {round?.phaseDeadline ? (
            <>
              <span className="font-mono text-[20px] font-bold text-terracotta">{secondsLeft()}</span>
              <span className="text-[11px] font-semibold text-ink-soft">{t('common.seconds', { count: secondsLeft() })}</span>
            </>
          ) : (
            <span className="rounded-full border border-ink/10 bg-paper-light px-2.5 py-0.5 text-[10px] font-semibold text-ink-soft">
              {t('game.noClock')}
            </span>
          )}
        </div>
      </div>
      <div className="paper rounded-[10px] border border-ink/10 p-4 sm:p-5 shadow-sm">
        <h2 className="font-display text-lg font-bold leading-snug text-ink sm:text-xl">{phaseTitle()}</h2>
        <p className="mt-1 text-sm leading-relaxed text-ink-soft">{phaseSubtitle()}</p>
      </div>
    </header>
  );

  // ── Private own slip ────────────────────────────────────────────────────────
  // Fed exclusively by me.role. Other players' slips stay face-down on this
  // screen until the server reveals them at the proper phase.
  const renderMySlipCard = () => {
    if (!myRole) return null;
    return (
      <div className="paper mx-auto flex w-full max-w-sm flex-col items-center gap-2 rounded-[12px] border border-mustard/40 bg-mustard/[0.06] p-5 text-center shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-faint">
          {t('game.yourSlip')}
        </p>
        <RoleSlip
          role={slipHidden ? null : myRole}
          faceDown={slipHidden}
          size="lg"
          animateIn
          interactive
          onClick={() => {
            playClick();
            setSlipHidden((hidden) => !hidden);
          }}
          ariaLabel={slipHidden ? t('game.peek') : t('game.hide')}
        />
        <p className="text-[11px] leading-snug text-ink-soft">{t('game.keepSecret')}</p>
        <button
          type="button"
          onClick={() => {
            playClick();
            setSlipHidden((hidden) => !hidden);
          }}
          className="text-[12px] font-semibold text-terracotta underline-offset-2 hover:underline"
        >
          {slipHidden ? t('game.peek') : t('game.hide')}
        </button>
      </div>
    );
  };

  const renderSlipGrid = () => (
    <div className="grid grid-cols-4 gap-2 sm:gap-3">
      {[1, 2, 3, 4].map((slot) => {
        const available = availableSlots.includes(slot);
        const taken = !available;
        return (
          <motion.div
            key={slot}
            whileHover={isMyTurnToPick && available ? { scale: 1.03 } : undefined}
            whileTap={isMyTurnToPick && available ? { scale: 0.96 } : undefined}
            className={cn(
              'group relative aspect-square rounded-[8px] border-2 shadow-sm flex flex-col items-center justify-center transition-all',
              taken
                ? 'border-terracotta/20 bg-terracotta/[0.05]'
                : available
                  ? isMyTurnToPick
                    ? 'border-mustard bg-mustard/[0.08]'
                    : 'border-ink/10 bg-paper-light'
                  : 'border-ink/5 bg-paper-deep/20',
            )}
          >
            <RoleSlip
              size="md"
              faceDown
              interactive={Boolean(isMyTurnToPick && available)}
              onClick={() => void handlePick(slot)}
              showBrand={false}
              animateIn
              aria-label={t('game.tapToPeek')}
            />
            {taken && (
              <span className="absolute inset-0 flex items-center justify-center rounded-[8px] bg-ink/25 backdrop-blur text-[10px] font-bold text-ink/60">
                ✔
              </span>
            )}
            {isMyTurnToPick && available && (
              <span className="absolute top-1 left-1/2 -translate-x-1/2 flex h-5 w-5 items-center justify-center rounded-full border border-mustard bg-mustard text-[9px] font-bold text-ink shadow-sm">
                {localizeNumber(slot, language)}
              </span>
            )}
          </motion.div>
        );
      })}
    </div>
  );

  const renderPauseOverlay = () => {
    if (!isPaused || !pausedPlayer) return null;
    const seconds = graceSecondsLeft();
    const expired = seconds <= 0;

    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/40 backdrop-blur-sm">
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="paper rounded-[14px] border border-ink/10 p-6 sm:p-8 shadow-paper-lift max-w-md w-full mx-4 text-center"
        >
          <Clock className="mx-auto h-10 w-10 text-terracotta" aria-hidden />
          <h2 className="mt-3 font-display text-lg font-bold text-ink sm:text-xl">
            {t('game.pausedTitle', { name: pausedPlayer.name })}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            {t('game.pausedBody')}
          </p>
          <div className="mt-5">
            <span className="font-mono text-[28px] font-bold text-ink">{seconds}</span>
            <span className="ml-1 text-sm font-semibold text-ink-soft">{t('game.pausedGrace', { seconds })}</span>
          </div>
          {expired && (
            <p className="mt-3 text-sm font-medium text-terracotta">{t('errors.GRACE_EXPIRED')}</p>
          )}
          {!mePlayer?.isHost && (
            <p className="mt-3 text-[12px] text-ink-soft">{t('game.pausedHost')}</p>
          )}
        </motion.div>
      </div>
    );
  };

  // ── Manual-flow screens ────────────────────────────────────────────────────

  const renderBabuReveal = () => {
    // Before the rise, only Babu's own screen may show the Babu slip. Everyone
    // else sees a closed slip — exactly like eyes-closed at a real table.
    const showFace = isBabu || babuRisen;
    const publicBabu = babuPlayer ?? (isBabu ? mePlayer : null);
    const asking = babuRisen && !policeCalled;

    return (
      <section className="space-y-4">
        <div className="paper relative overflow-hidden rounded-[12px] border border-ink/10 p-6 text-center shadow-paper-lift sm:p-8">
          <div className="tape -top-3 left-1/2 h-6 w-24 -translate-x-1/2 rotate-[-1deg]" aria-hidden />
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-faint">
            {t('game.babuSeat')}
          </p>

          <div className="mt-4 flex flex-col items-center gap-3">
            <RoleSlip
              role={showFace ? 'BABU' : null}
              faceDown={!showFace}
              size="hero"
              animateIn
            />
            <h2 className="font-display text-xl font-bold text-ink sm:text-2xl">
              {!babuRisen
                ? t('game.babuRiseTitle')
                : asking
                  ? t('game.babuRisenTitle')
                  : t('game.babuAskDoneTitle')}
            </h2>
            <p className="max-w-sm text-sm leading-relaxed text-ink-soft">
              {!babuRisen
                ? isBabu
                  ? t('game.youAreBabuBody')
                  : t('game.babuRiseSub')
                : asking
                  ? isBabu
                    ? t('game.babuAskBody')
                    : t('game.babuRisenBody', { name: publicBabu?.name ?? '' })
                  : t('game.policeQuestionSub')}
            </p>
          </div>

          {!babuRisen && isBabu && (
            <div className="mt-6">
              <Button
                fullWidth
                size="lg"
                variant="primary"
                loading={busy === 'babu_rise'}
                disabled={Boolean(busy) && busy !== 'babu_rise'}
                onClick={() => void handleBabuRise()}
                leftIcon={<Crown className="h-4 w-4" aria-hidden />}
              >
                {t('game.babuRiseButton')}
              </Button>
              <p className="mt-2 text-[12px] text-ink-soft">{t('game.keepSecret')}</p>
            </div>
          )}

          {!babuRisen && !isBabu && (
            <p className="mt-6 rounded-lg border border-ink/10 bg-paper-deep/20 px-4 py-3 text-sm text-ink-soft">
              {t('game.babuWaitOthers')}
            </p>
          )}

          {babuRisen && isBabu && asking && (
            <div className="mt-6">
              <Button
                fullWidth
                size="lg"
                variant="primary"
                loading={busy === 'ask_police'}
                disabled={Boolean(busy) && busy !== 'ask_police'}
                onClick={() => void handleAskPolice()}
                leftIcon={<UserRound className="h-4 w-4" aria-hidden />}
              >
                {t('game.babuAskButton')}
              </Button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-4 gap-2">
          {players.map((player) => {
            const role = revealedRoleFor(player.id);
            return (
              <div
                key={player.id}
                className={cn(
                  'flex min-w-0 flex-col items-center gap-1 rounded-lg border px-2 py-2 text-center',
                  role === 'BABU'
                    ? 'border-mustard bg-mustard/[0.10]'
                    : 'border-ink/10 bg-paper-light/60',
                )}
              >
                <span className="text-xl" aria-hidden>{player.avatar}</span>
                <span className="w-full truncate text-[10px] font-semibold text-ink">{player.name}</span>
                {role === 'BABU' && <RoleBadge role="BABU" size="sm" className="scale-90" />}
              </div>
            );
          })}
        </div>
      </section>
    );
  };

  const renderPoliceReveal = () => {
    const showFace = isPolice || policeRisen;
    return (
      <section className="space-y-4">
        <div className="paper relative overflow-hidden rounded-[12px] border border-ink/10 p-6 text-center shadow-paper-lift sm:p-8">
          <div className="tape -top-3 left-1/2 h-6 w-24 -translate-x-1/2 rotate-[-1deg]" aria-hidden />

          <div className="flex items-center justify-center gap-2">
            <RoleBadge role="BABU" size="sm" />
            <span className="text-xs text-ink-soft">→</span>
            <RoleBadge role="POLICE" size="sm" showName={false} />
          </div>

          <h2 className="mt-3 font-display text-xl font-bold text-ink sm:text-2xl">
            {t('game.policeQuestionTitle')}
          </h2>
          <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-ink-soft">
            {t('game.policeQuestionLine', { name: babuPlayer?.name ?? '' })}
          </p>

          <div className="mt-5 flex flex-col items-center gap-3">
            <RoleSlip
              role={showFace ? 'POLICE' : null}
              faceDown={!showFace}
              size="hero"
              animateIn
            />
            <p className="font-display text-lg font-bold text-ink">
              {isPolice ? t('game.youArePolice') : t('game.policeRising')}
            </p>
            <p className="max-w-sm text-sm leading-relaxed text-ink-soft">
              {isPolice ? t('game.policeRiseSub') : t('game.policeRiseOtherSub')}
            </p>
          </div>

          {isPolice && (
            <div className="mt-6">
              <Button
                fullWidth
                size="lg"
                variant="primary"
                loading={busy === 'police_rise'}
                disabled={Boolean(busy) && busy !== 'police_rise'}
                onClick={() => void handlePoliceRise()}
                leftIcon={<Check className="h-4 w-4" aria-hidden />}
              >
                {t('game.policeRiseButton')}
              </Button>
              <p className="mt-2 text-[12px] text-ink-soft">{t('game.keepSecret')}</p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-4 gap-2">
          {players.map((player) => {
            const role = revealedRoleFor(player.id);
            return (
              <div
                key={player.id}
                className={cn(
                  'flex min-w-0 flex-col items-center gap-1 rounded-lg border px-2 py-2 text-center',
                  role === 'POLICE'
                    ? 'border-teal bg-teal/[0.08]'
                    : 'border-ink/10 bg-paper-light/60',
                )}
              >
                <span className="text-xl" aria-hidden>{player.avatar}</span>
                <span className="w-full truncate text-[10px] font-semibold text-ink">{player.name}</span>
                {role === 'POLICE' && <RoleBadge role="POLICE" size="sm" className="scale-90" />}
              </div>
            );
          })}
        </div>
      </section>
    );
  };

  const renderPoliceGuess = () => {
    const picked = guessPickedPlayer;
    const canPick = isMyTurnToGuess;

    return (
      <section className="space-y-4">
        <div className={cn(
          'paper flex items-center gap-3 rounded-[12px] border p-4 shadow-sm',
          policePlayer ? 'border-teal/40 bg-teal/[0.04]' : 'border-ink/10',
        )}>
          <RoleSlip role="POLICE" size="sm" showBrand={false} />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
              {t('game.policeRisenTag')}
            </p>
            <p className="truncate font-display text-lg font-bold text-ink">
              {policePlayer?.name ?? t('game.spectator')}
            </p>
            <p className="text-sm leading-snug text-ink-soft">
              {picked
                ? t('game.policePicked', { name: picked.name })
                : isPolice
                  ? t('game.policeChooseSub', { target: targetLabel })
                  : t('game.policeChoosing', { name: policePlayer?.name ?? '' })}
            </p>
          </div>
          {picked && <Check className="h-6 w-6 shrink-0 text-leaf" aria-hidden />}
        </div>

        <div className="grid grid-cols-2 gap-3">
          {hiddenPlayers.map((player) => {
            const pickedThis = picked?.id === player.id;
            const disabled = !canPick || busy === 'guess';
            return (
              <button
                key={player.id}
                type="button"
                disabled={disabled}
                onClick={() => void handleGuess(player.id)}
                className={cn(
                  'relative flex flex-col items-center gap-2 rounded-[12px] border-2 p-5 shadow-sm transition-all',
                  pickedThis
                    ? 'border-leaf bg-leaf/[0.08]'
                    : canPick
                      ? 'border-ink/10 bg-paper-light hover:-translate-y-0.5 hover:border-mustard'
                      : 'border-ink/10 bg-paper-light/70',
                  !canPick && !pickedThis && 'opacity-70',
                )}
              >
                <span className="text-4xl" aria-hidden>{player.avatar}</span>
                <span className="max-w-full truncate font-display text-sm font-bold text-ink">
                  {player.name}
                </span>
                {pickedThis && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-leaf/30 bg-leaf/10 px-2 py-0.5 text-[10px] font-bold text-leaf">
                    <Check className="h-3 w-3" aria-hidden />
                    {t('game.policePickTag')}
                  </span>
                )}
                {canPick && !pickedThis && (
                  <span className="text-[10px] font-semibold text-ink-soft">
                    {t('game.guessTapSeat')}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <p className="text-center text-sm text-ink-soft">
          {picked
            ? t('game.policePickedWait')
            : isPolice
              ? t('game.guessYourTurn')
              : t('game.policeChoosing', { name: policePlayer?.name ?? '' })}
        </p>
      </section>
    );
  };

  const renderFinalReveal = () => {
    const caught = round?.guessCorrect ?? false;
    return (
      <section className="space-y-4">
        <div className={cn(
          'rounded-[12px] border-2 p-5 text-center shadow-sm',
          caught ? 'border-leaf bg-leaf/[0.06]' : 'border-terracotta bg-terracotta/[0.06]',
        )}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
            {t('game.policePickTag')}
          </p>
          <h2 className="mt-1 font-display text-xl font-bold text-ink sm:text-2xl">
            {guessPickedPlayer
              ? t('game.policePicked', { name: guessPickedPlayer.name })
              : t('game.revealTitle')}
          </h2>
          <p className="mt-1 text-sm font-semibold text-ink-soft">
            {caught ? t('game.verdictCaught') : t('game.verdictEscaped')}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {players.map((player) => {
            const role = revealedRoleFor(player.id);
            const picked = player.id === round?.guessPlayerId;
            return (
              <div
                key={player.id}
                className={cn(
                  'relative flex flex-col items-center gap-1.5 rounded-[12px] border-2 p-4 text-center shadow-sm',
                  picked ? 'border-mustard bg-mustard/[0.08]' : 'border-ink/10 bg-paper-light',
                )}
              >
                <span className="text-4xl" aria-hidden>{player.avatar}</span>
                <span className="max-w-full truncate font-display text-sm font-bold text-ink">
                  {player.name}
                </span>
                {role && <RoleBadge role={role} size="sm" />}
                {picked && (
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#6a4a0d]">
                    {t('game.policePickTag')}
                  </span>
                )}
                {player.id === me?.id && (
                  <span className="text-[10px] font-semibold text-ink-faint">{t('sheet.meMark')}</span>
                )}
              </div>
            );
          })}
        </div>
      </section>
    );
  };

  const renderLegacyReveal = () => (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 space-y-6">
      {round?.phase === 'BABU_REVEAL' && babuPlayer && (
        <div className="flex flex-col items-center justify-center min-h-[240px]">
          <RoleSlip size="hero" role="BABU" animateIn />
          <p className="mt-4 text-sm font-semibold text-ink">
            {babuPlayer.avatar} {babuPlayer.name} — {t('game.babuSpeech')}
          </p>
        </div>
      )}
      {round?.phase === 'POLICE_REVEAL' && policePlayer && (
        <div className="flex flex-col items-center justify-center min-h-[240px]">
          <RoleSlip size="hero" role="POLICE" animateIn />
          <p className="mt-4 text-sm font-semibold text-ink">
            {policePlayer.avatar} {policePlayer.name} — {t('game.policeSpeech')}
          </p>
        </div>
      )}
      {round?.phase === 'BABU_ORDER' && babuPlayer && (
        <div className="flex flex-col items-center justify-center min-h-[240px]">
          <span className="text-4xl mb-2">{babuPlayer.avatar}</span>
          <p className="font-display text-lg font-bold text-ink">{t('game.orderFind', { role: targetLabel })}</p>
          <p className="mt-1 text-sm text-ink-soft">{t('game.orderSub')}</p>
        </div>
      )}
    </div>
  );

  const renderRoundResult = () => {
    const roundResults = round?.results ?? [];
    const caught = round?.guessCorrect ?? false;
    const targetPlayer = players.find((p) => p.id === round?.guessPlayerId);

    return (
      <section className="space-y-4">
        <div className={cn(
          'rounded-[10px] border-2 p-5 text-center shadow-sm flex flex-col items-center justify-center min-h-[220px]',
          caught ? 'border-leaf bg-leaf/[0.05]' : 'border-terracotta bg-terracotta/[0.05]',
        )}>
          <span className="text-4xl mb-2">{caught ? '🪢' : '💨'}</span>
          <h3 className="font-display text-lg font-bold text-ink">
            {caught ? t('game.caughtTitle') : t('game.escapedTitle')}
          </h3>
          <p className="mt-1 text-sm text-ink-soft">
            {caught
              ? t('game.caughtSub', { target: targetPlayer?.name ?? '' })
              : t('game.escapedSub', { target: targetPlayer?.name ?? '' })}
          </p>
        </div>

        <ScoreSheet
          players={players.map((p) => ({
            id: p.id,
            name: p.name,
            avatar: p.avatar,
            isMe: p.id === me?.id,
            isHost: p.isHost,
            totalScore: p.totalScore,
            babuCount: p.babuCount,
          }))}
          history={history.concat(
            roundResults.length > 0
              ? [{
                  id: round?.id ?? '',
                  number: currentRoundNumber,
                  shufflerId: round?.shufflerId ?? '',
                  targetRole: round?.targetRole ?? 'CHOR',
                  guessPlayerId: round?.guessPlayerId ?? null,
                  guessCorrect: round?.guessCorrect ?? null,
                  results: roundResults,
                  finishedAt: new Date().toISOString(),
                }]
              : [],
          )}
          totalRounds={totalRounds}
          currentRound={currentRoundNumber}
          live={false}
          compact
        />

        <div className="flex items-center justify-between gap-2 text-sm">
          {players.map((player) => {
            const result = roundResults.find((r) => r.playerId === player.id);
            return (
              <span key={player.id} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-ink/10 bg-paper-light/50 text-center min-w-[70px]">
                <span className="text-[10px]">{result?.points ?? '–'}</span>
                <span className="text-[11px] font-semibold text-ink-soft truncate">{player.name}</span>
              </span>
            );
          })}
        </div>

        {currentRoundNumber < totalRounds ? (
          <div className="mt-4">
            <p className="text-center text-sm text-ink-soft mb-3">
              {currentRoundNumber === totalRounds - 1 ? t('game.finalRound') : t('game.nextRound')}
            </p>
            <Button
              fullWidth
              size="lg"
              variant="primary"
              disabled={busy === 'advance' || (!mePlayer?.isHost && allFilled)}
              loading={busy === 'advance'}
              onClick={() => void handleAdvance()}
              leftIcon={<SkipForward className="h-4 w-4" aria-hidden />}
            >
              {mePlayer?.isHost ? t('game.nextRound') : t('game.waitingHostNext')}
            </Button>
            {!mePlayer?.isHost && (
              <p className="mt-2 text-center text-[11px] text-ink-soft">{t('game.nextRoundHint')}</p>
            )}
          </div>
        ) : (
          <Button
            fullWidth
            size="lg"
            variant="primary"
            disabled={busy === 'advance'}
            loading={busy === 'advance'}
            onClick={() => void handleAdvance()}
            leftIcon={<Play className="h-4 w-4" aria-hidden />}
          >
            {t('result.title')}
          </Button>
        )}
      </section>
    );
  };

  const renderMatchEnd = () => {
    const ranked = [...players]
      .sort((a, b) => b.totalScore - a.totalScore || b.babuCount - a.babuCount || a.seat - b.seat)
      .map((player, index) => ({ ...player, rank: index + 1 }));
    const topScore = ranked[0]?.totalScore ?? 0;
    const topBabu = ranked.filter((p) => p.totalScore === topScore).reduce((max, p) => Math.max(max, p.babuCount), 0);
    const winners = ranked.filter((p) => p.totalScore === topScore && p.babuCount === topBabu);
    const isShared = winners.length > 1;

    return (
      <section className="space-y-5">
        <div className="rounded-[12px] border-2 border-mustard bg-mustard/[0.08] p-6 text-center shadow-sm">
          {isShared ? (
            <>
              <h2 className="font-display text-2xl font-bold text-ink">{t('result.sharedTitle')}</h2>
              <p className="mt-1 text-sm text-ink-soft">{t('result.sharedSub')}</p>
            </>
          ) : (
            <>
              <h2 className="font-display text-2xl font-bold text-ink">{t('result.winnerTitle', { name: winners[0]?.name ?? '' })}</h2>
              <p className="mt-1 text-sm text-ink-soft">{t('result.winnerSub')}</p>
            </>
          )}
          {winners.map((player) => (
            <span key={player.id} className="mt-3 inline-flex items-center gap-2 rounded-full border border-mustard bg-mustard px-3 py-1 text-xs font-bold text-[#6a4a0d]">
              <Crown className="h-3.5 w-3.5" aria-hidden />
              {t('result.winnerTag')}
            </span>
          ))}
        </div>

        <ScoreSheet
          players={players.map((p) => ({
            id: p.id,
            name: p.name,
            avatar: p.avatar,
            isMe: p.id === me?.id,
            isHost: p.isHost,
            totalScore: p.totalScore,
            babuCount: p.babuCount,
          }))}
          history={history}
          totalRounds={totalRounds}
          live={false}
        />

        <ExportScoreSheet
          players={players.map((p) => ({
            id: p.id,
            name: p.name,
            avatar: p.avatar,
            isMe: p.id === me?.id,
            isHost: p.isHost,
            totalScore: p.totalScore,
            babuCount: p.babuCount,
          }))}
          history={history}
          totalRounds={totalRounds}
        />

        <div className="space-y-2">
          <h3 className="font-display text-sm font-bold text-ink uppercase tracking-wider">{t('result.ranking')}</h3>
          {ranked.map((player, index) => {
            const place = index + 1;
            const isWinner = winners.includes(player);
            const isLast = place === players.length;
            return (
              <motion.div
                key={player.id}
                whileHover={{ x: 4 }}
                className={cn(
                  'flex items-center justify-between gap-3 px-3 py-2 rounded-lg border transition-colors',
                  isWinner
                    ? 'border-mustard bg-mustard/[0.06]'
                    : isLast
                      ? 'border-terracotta/20 bg-terracotta/[0.04]'
                      : 'border-ink/10 bg-paper-light',
                )}
              >
                <span className="flex items-center gap-2 text-[13px] font-bold">
                  {place === 1 ? '🥇' : place === 2 ? '🥈' : place === 3 ? '🥉' : localizeNumber(place, language)}
                  {isWinner && <span className="text-xs text-mustard">{t('result.winnerTag')}</span>}
                  {isLast && place > 1 && <span className="text-xs text-terracotta">{t('result.loser')}</span>}
                </span>
                <div className="flex items-center gap-2 text-right">
                  <span className="font-mono text-[15px] font-bold text-ink">{player.totalScore}</span>
                  <span className="text-[11px] text-ink-faint">{t('common.points')} · {t('sheet.babuMark', { count: player.babuCount })}</span>
                </div>
              </motion.div>
            );
          })}
        </div>

        <div className="mt-5 flex gap-2">
          <Button fullWidth variant="secondary" onClick={() => void window.location.assign('/')} leftIcon={<ArrowLeft className="h-4 w-4" aria-hidden />}>
            {t('result.newGame') ?? t('common.backHome')}
          </Button>
          <Button fullWidth variant="primary" onClick={handleLeave} leftIcon={<UserRound className="h-4 w-4" aria-hidden />}>
            {t('result.leaveRoom') ?? t('game.leaveConfirm')}
          </Button>
        </div>
      </section>
    );
  };

  // ── Main body ──
  let bodyContent;
  if (isPaused) {
    bodyContent = <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">{renderSlipGrid()}</div>;
  } else if (round?.phase === 'ROUND_RESULT') {
    bodyContent = renderRoundResult();
  } else if (round?.phase === 'MATCH_END') {
    bodyContent = renderMatchEnd();
  } else if (round?.phase === 'SHUFFLE' || round?.phase === 'DRAW') {
    bodyContent = (
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 space-y-6">
        {round?.phase === 'SHUFFLE' && (
          <div className="flex flex-col items-center justify-center min-h-[300px]">
            <div className="relative mb-4">
              <RoleSlip size="hero" faceDown animateIn className="animate-paper-float" />
              {shuffler && (
                <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-ink/10 bg-paper-light px-3 py-1 text-xs font-semibold text-ink shadow-sm">
                  {shuffler.avatar} {shuffler.name}
                </span>
              )}
            </div>
            <p className="text-sm text-ink-soft">{t('game.shuffling')}</p>
          </div>
        )}
        {round?.phase === 'DRAW' && (
          <div className="space-y-5">
            {renderSlipGrid()}
            {renderMySlipCard()}
          </div>
        )}
      </div>
    );
  } else if (round?.phase === 'HIDDEN_ROLES') {
    bodyContent = (
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 flex flex-col items-center justify-center min-h-[300px] gap-5">
        {renderMySlipCard()}
        <div className="grid grid-cols-4 gap-2 opacity-60" aria-hidden>
          {[1, 2, 3, 4].map((slot) => (
            <RoleSlip key={slot} size="sm" faceDown animateIn />
          ))}
        </div>
      </div>
    );
  } else if (round?.phase === 'BABU_REVEAL') {
    bodyContent = manualFlowSupported ? (
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 space-y-4">
        {renderBabuReveal()}
        {!isBabu && renderMySlipCard()}
      </div>
    ) : renderLegacyReveal();
  } else if (round?.phase === 'POLICE_REVEAL') {
    bodyContent = manualFlowSupported ? (
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 space-y-4">
        {renderPoliceReveal()}
        {!isPolice && renderMySlipCard()}
      </div>
    ) : renderLegacyReveal();
  } else if (round?.phase === 'BABU_ORDER') {
    bodyContent = renderLegacyReveal();
  } else if (round?.phase === 'POLICE_GUESS') {
    bodyContent = (
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        {renderPoliceGuess()}
      </div>
    );
  } else if (round?.phase === 'FINAL_REVEAL') {
    bodyContent = (
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        {renderFinalReveal()}
      </div>
    );
  } else {
    bodyContent = null;
  }

  return (
    <main className="game-desk fullscreen-fallback relative min-h-screen">
      <header className="relative z-20 sticky top-0 z-[40] border-b border-ink/10 bg-paper-light/80 backdrop-blur-[4px] px-4 py-3 sm:px-6">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleLeave}
            className="inline-flex items-center gap-1 text-sm font-semibold text-ink-soft hover:text-terracotta transition-colors"
            disabled={busy === 'leave'}
          >
            <UserRound className="h-3.5 w-3.5" aria-hidden />
            {t('common.leave')}
          </button>
          <div className="flex items-center gap-2 text-right">
            {canViewOwnSlip && (
              <button
                type="button"
                onClick={() => {
                  playClick();
                  setSlipOpen(true);
                }}
                aria-label={t('game.yourSlip')}
                className="inline-flex items-center gap-1 rounded-full border border-ink/10 bg-paper-light px-2 py-0.5 text-[10px] font-bold text-ink-soft transition-colors hover:border-ink/30 hover:text-ink"
              >
                <Eye className="h-3.5 w-3.5" aria-hidden />
                <span className="hidden sm:inline">{t('game.yourSlip')}</span>
              </button>
            )}
            <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold', connected ? 'bg-leaf/[0.1] text-leaf' : 'bg-terracotta/[0.1] text-terracotta')}>
              <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
              {connected ? t('common.online') : t('common.offline')}
            </span>
            {!connected && (
              <button
                type="button"
                onClick={() => { retry(); playClick(); }}
                className="ml-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-ink text-paper-light text-[10px] font-bold"
                disabled={busy === 'leave'}
              >
                {t('common.refresh')}
              </button>
            )}
          </div>
        </div>
      </header>

      {status === 'loading' ? (
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 pt-20 pb-16">
          <LoadingScreen title={t('room.loadingTitle')} subtitle={t('room.loadingBody')} fullScreen={false} />
        </div>
      ) : (
        <>
          {renderPhaseHeader()}
          {bodyContent}

          {/* Reactions bar (only during active play, not result) */}
          {isPlaying && round?.phase && !['ROUND_RESULT', 'MATCH_END'].includes(round.phase) && (
            <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 mt-4">
              <div className="flex items-center justify-between gap-3 rounded-lg border border-ink/10 bg-paper-light/60 p-3 shadow-sm">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">{t('game.reactionTitle')}</span>
                <div className="flex gap-1">
                  {REACTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      aria-label={t('game.reactAria', { emoji })}
                      disabled={busy === 'react'}
                      onClick={() => void handleReact(emoji)}
                      className="h-9 w-9 shrink-0 rounded-full border border-ink/10 bg-paper-light text-2xl transition-all hover:border-ink/30 disabled:opacity-50"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Recent reactions ticker */}
          {reactions.length > 0 && (
            <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 mt-2">
              <div className="flex gap-1 overflow-hidden px-1">
                {reactions.slice(0, 6).map((reaction) => {
                  const player = players.find((p) => p.id === reaction.playerId);
                  return (
                    <span key={reaction.id} className="flex items-center gap-1.5 rounded-full border border-ink/10 bg-paper-light px-2 py-1 text-xs animate-paper-float">
                      <span className="text-[12px]">{reaction.emoji}</span>
                      <span className="text-[10px] font-semibold text-ink-soft truncate max-w-[120px]">
                        {player?.name ?? t('common.players')}
                      </span>
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {renderPauseOverlay()}

      {/* Guess confirmation modal */}
      <Modal
        open={guessConfirmOpen}
        onClose={() => setGuessConfirmOpen(false)}
        title={t('game.guessConfirmTitle', { name: players.find((p) => p.id === guessTargetId)?.name ?? '' })}
        description={t('game.guessConfirmBody')}
        closeLabel={t('game.guessChanging')}
      >
        <div className="space-y-3">
          <p className="text-sm text-ink-soft">{t('game.guessConfirmBody')}</p>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button variant="secondary" onClick={() => setGuessConfirmOpen(false)}>
              {t('game.guessChanging')}
            </Button>
            <Button variant="danger" onClick={() => void confirmGuess()} loading={busy === 'guess'}>
              {t('game.guessConfirm')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Private own-slip peek — only ever renders me.role */}
      <Modal
        open={slipOpen}
        onClose={() => setSlipOpen(false)}
        title={t('game.yourSlip')}
        description={t('game.keepSecret')}
        size="sm"
        closeLabel={t('common.close')}
      >
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          {myRole && <RoleSlip role={myRole} size="hero" animateIn />}
          <p className="font-display text-lg font-bold text-ink">
            {myRole ? t('game.myRole', { role: t(`roles.${myRole}.name`) }) : ''}
          </p>
        </div>
      </Modal>

      {/* Leave confirmation */}
      <ConfirmDialog
        open={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        title={t('game.leaveGameTitle')}
        description={t('game.leaveGameBody')}
        confirmLabel={t('game.leaveConfirm')}
        cancelLabel={t('common.cancel')}
        onConfirm={() => void confirmLeave()}
        loading={busy === 'leave'}
        extra={
          <p className="rounded-lg border border-terracotta/20 bg-terracotta/[0.05] px-3 py-2 text-[12px] leading-snug text-terracotta">
            {t('game.leaveWarning')}
          </p>
        }
      />

      {/* Avatar changer */}
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
            <Button fullWidth onClick={() => void handleSaveAvatar()} loading={busy === 'avatar'}>
              {t('common.save')}
            </Button>
          </div>
        }
      >
        <div className="pb-1">
          <p className="mb-3 text-sm text-ink-soft">{t('common.roomCode')}: {room?.code}</p>
          <AvatarPicker value={avatarDraft} onChange={setAvatarDraft} disabled={busy === 'avatar'} />
        </div>
      </Modal>
    </main>
  );
}
