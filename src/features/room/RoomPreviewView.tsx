import { useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, LockKeyhole, UsersRound } from 'lucide-react';
import { AvatarPicker } from '@/components/ui/AvatarPicker';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { RoleSlip } from '@/components/roles/RoleSlip';
import { GAME_CONFIG } from '@/config/game';
import { haptics } from '@/lib/haptics';
import { localizeNumber } from '@/lib/numbers';
import { sound } from '@/lib/sound';
import type { PeekRoom } from '@/types';
import type { JoinInput } from './useRoomSession';

interface RoomPreviewViewProps {
  peek: PeekRoom;
  initialName: string;
  initialAvatar: string;
  busy: string | null;
  actionError: string | null;
  onJoin: (input: JoinInput) => Promise<boolean>;
}

export function RoomPreviewView({
  peek,
  initialName,
  initialAvatar,
  busy,
  actionError,
  onJoin,
}: RoomPreviewViewProps) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const [name, setName] = useState(initialName);
  const [avatar, setAvatar] = useState(initialAvatar || GAME_CONFIG.avatars[0]);
  const [nameError, setNameError] = useState<string | null>(null);

  const seatsTaken = Math.max(peek.playerCount, 0);
  const seatsOpen = Math.max(peek.seatsOpen, 0);
  const available = peek.exists && peek.status === 'lobby' && seatsOpen > 0 && seatsTaken < GAME_CONFIG.maxPlayers;
  const joining = busy === 'join';

  let blockedTitle = '';
  let blockedBody = '';
  if (!peek.exists) {
    blockedTitle = t('room.notFoundTitle');
    blockedBody = t('room.notFoundBody');
  } else if (peek.status === 'playing') {
    blockedTitle = t('room.startedTitle');
    blockedBody = t('room.startedBody');
  } else if (peek.status === 'finished') {
    blockedTitle = t('room.finishedTitle');
    blockedBody = t('room.finishedBody');
  } else if (seatsOpen <= 0 || seatsTaken >= GAME_CONFIG.maxPlayers) {
    blockedTitle = t('room.fullTitle');
    blockedBody = t('room.fullBody');
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 1 || trimmed.length > 20) {
      setNameError(t('errors.INVALID_NAME'));
      haptics.error();
      return;
    }
    setNameError(null);
    haptics.tap();
    sound.play('flip');
    void onJoin({ name: trimmed, avatar });
  }

  return (
    <div className="relative mx-auto w-full max-w-xl px-4 pb-12 pt-6 sm:px-6 sm:pt-10">
      <div className="pointer-events-none absolute -left-8 top-10 hidden rotate-[-10deg] opacity-40 sm:block" aria-hidden>
        <RoleSlip role="CHOR" size="md" />
      </div>
      <div className="pointer-events-none absolute -right-10 bottom-20 hidden rotate-[8deg] opacity-40 sm:block" aria-hidden>
        <RoleSlip role="POLICE" size="md" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="paper relative rounded-[12px] border border-ink/10 px-5 pb-6 pt-7 shadow-paper-lift sm:px-7 sm:pb-7"
      >
        <div className="tape -top-3 left-1/2 h-6 w-24 -translate-x-1/2 rotate-[-1deg]" aria-hidden />

        <div className="text-center">
          <p className="font-hand text-base font-bold uppercase tracking-[0.15em] text-terracotta">
            {available ? t('room.previewEyebrow') : t('room.closedKicker')}
          </p>
          <h1 className="mt-1 font-display text-[clamp(1.55rem,7vw,2.1rem)] font-bold leading-tight text-ink">
            {available ? t('join.title') : blockedTitle}
          </h1>
          <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-ink-soft">
            {available ? t('join.sub') : blockedBody}
          </p>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-1.5 text-center">
          <div className="rounded-lg border border-ink/10 bg-paper-deep/20 px-2 py-2">
            <UsersRound className="mx-auto h-4 w-4 text-teal" aria-hidden />
            <p className="mt-1 font-hand text-[15px] font-bold leading-tight text-ink">
              {localizeNumber(seatsTaken, language)} / {localizeNumber(GAME_CONFIG.maxPlayers, language)}
            </p>
            <p className="text-[9px] font-semibold uppercase tracking-[0.06em] text-ink-faint">
              {t('common.players')}
            </p>
          </div>
          <div className="rounded-lg border border-ink/10 bg-paper-deep/20 px-2 py-2">
            <span className="text-base" aria-hidden>
              ✎
            </span>
            <p className="mt-1 font-hand text-[15px] font-bold leading-tight text-ink">
              {localizeNumber(peek.totalRounds ?? 0, language)}
            </p>
            <p className="text-[9px] font-semibold uppercase tracking-[0.06em] text-ink-faint">
              {t('common.round')}
            </p>
          </div>
          <div className="rounded-lg border border-ink/10 bg-paper-deep/20 px-2 py-2">
            <LockKeyhole className="mx-auto h-4 w-4 text-teal" aria-hidden />
            <p className="mt-1 font-mono text-[15px] font-bold leading-tight tracking-[0.12em] text-ink">{peek.code}</p>
            <p className="text-[9px] font-semibold uppercase tracking-[0.06em] text-ink-faint">
              {t('common.roomCode')}
            </p>
          </div>
        </div>

        {available ? (
          <form onSubmit={submit} className="mt-5 space-y-3.5" noValidate>
            <div className="flex items-center justify-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-leaf" aria-hidden />
              <p className="text-[12px] font-semibold text-ink-soft">
                {t('room.seatsTaken', { taken: Math.max(peek.playerCount, 0) })} ·{' '}
                {t('room.roundsPlanned', { count: peek.totalRounds ?? 0 })}
              </p>
            </div>

            <Field
              label={t('landing.nameLabel')}
              value={name}
              onChange={(event) => {
                setName(event.target.value.slice(0, 20));
                setNameError(null);
              }}
              placeholder={t('landing.namePlaceholder')}
              autoComplete="nickname"
              maxLength={20}
              leading={<span className="font-hand text-lg font-bold text-terracotta">Aa</span>}
              error={nameError}
              disabled={joining}
              data-autofocus
            />

            <AvatarPicker
              label={t('landing.avatarLabel')}
              value={avatar}
              onChange={setAvatar}
              disabled={joining}
            />

            {actionError && (
              <p
                role="alert"
                className="rounded-lg border border-terracotta/25 bg-terracotta/[0.06] px-3 py-2 text-[13px] font-medium leading-snug text-terracotta"
              >
                {actionError}
              </p>
            )}

            <Button
              type="submit"
              size="lg"
              fullWidth
              loading={joining}
              rightIcon={<ArrowRight className="h-4 w-4" aria-hidden />}
            >
              {joining ? t('join.joining') : t('landing.joinButton')}
            </Button>

            <p className="flex items-center justify-center gap-1.5 text-center text-[11px] leading-snug text-ink-faint">
              <LockKeyhole className="h-3 w-3" aria-hidden />
              {t('landing.privacy')}
            </p>
          </form>
        ) : (
          <div className="mt-5 flex flex-col items-center gap-3">
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span className="rounded-full border border-ink/10 bg-ink/5 px-2.5 py-1 text-[11px] font-semibold text-ink-soft">
                {t('room.seatsTaken', { taken: Math.max(peek.playerCount, 0) })}
              </span>
              <span className="rounded-full border border-ink/10 bg-ink/5 px-2.5 py-1 text-[11px] font-semibold text-ink-soft">
                {t('room.roundsPlanned', { count: peek.totalRounds ?? 0 })}
              </span>
            </div>
            <Button
              variant="secondary"
              fullWidth
              onClick={() => {
                haptics.tap();
                sound.play('click');
                window.location.assign('/');
              }}
              leftIcon={<ArrowLeft className="h-4 w-4" aria-hidden />}
            >
              {t('common.backHome')}
            </Button>
          </div>
        )}
      </motion.div>

      {available && (
        <p className="mt-4 text-center font-hand text-sm text-ink-faint">
          {i18n.language === 'bn' ? 'নাম দিলেই চেয়ারটা তোমার।' : 'Your name is enough to claim the chair.'}
        </p>
      )}
    </div>
  );
}
