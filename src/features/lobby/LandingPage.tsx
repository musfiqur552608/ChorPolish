import { useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight,
  BookOpen,
  KeyRound,
  Link2,
  LockKeyhole,
  QrCode,
  Sparkles,
  UserPlus,
  UsersRound,
} from 'lucide-react';
import { AvatarPicker } from '@/components/ui/AvatarPicker';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { HowToPlayModal } from '@/components/ui/HowToPlayModal';
import { Logo } from '@/components/ui/Logo';
import { PreferenceButtons } from '@/components/ui/PreferenceButtons';
import { CircleScribble, LoopyArrow, MagnifierDoodle, Sparkle, TinyStarCrown } from '@/components/decor/Doodles';
import { RoleSlip } from '@/components/roles/RoleSlip';
import { ScoreSheet } from '@/features/scoresheet/ScoreSheet';
import { mockHistory, mockPlayers } from '@/features/scoresheet/mockData';
import { GAME_CONFIG } from '@/config/game';
import { useToastStore } from '@/hooks/useToastStore';
import { cn } from '@/lib/cn';
import { userErrorMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { localizeNumber } from '@/lib/numbers';
import { loadProfileDraft, saveProfileDraft, saveRecentRoom } from '@/lib/profileDraft';
import { sound } from '@/lib/sound';
import { createRequestId } from '@/lib/requestId';
import { createRoom, joinRoom } from '@/lib/supabase/api';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import type { Role } from '@/types';

type Tab = 'create' | 'join';
type RoundChoice = number | 'custom';

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const draft = loadProfileDraft();

function sanitizeCode(value: string): string {
  return value
    .toUpperCase()
    .split('')
    .filter((character) => CODE_ALPHABET.includes(character))
    .join('')
    .slice(0, 6);
}

export function LandingPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const pushToast = useToastStore((state) => state.push);
  const [tab, setTab] = useState<Tab>('create');
  const [name, setName] = useState(draft?.name ?? '');
  const [avatar, setAvatar] = useState(draft?.avatar ?? GAME_CONFIG.avatars[0]);
  const [roundChoice, setRoundChoice] = useState<RoundChoice>(8);
  const [customRounds, setCustomRounds] = useState('6');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [howToOpen, setHowToOpen] = useState(false);
  const requestId = useRef<string>(createRequestId());

  const rounds = roundChoice === 'custom' ? Number(customRounds) : roundChoice;
  const roundsValid =
    Number.isInteger(rounds) && rounds >= GAME_CONFIG.minRounds && rounds <= GAME_CONFIG.maxRounds;
  const nameValid = name.trim().length >= 1 && name.trim().length <= 20;
  const codeValid = code.length === 6;

  function resetError() {
    setError(null);
  }

  function switchTab(next: Tab) {
    if (next === tab) return;
    setTab(next);
    setError(null);
    sound.play('click');
    haptics.tap();
  }

  function validate(): string | null {
    if (!nameValid) return t('landing.nameRequired');
    if (tab === 'create' && !roundsValid) return t('landing.roundsRequired');
    if (tab === 'join' && !codeValid) return t('landing.invalidCode');
    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    resetError();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      haptics.error();
      return;
    }
    if (!isSupabaseConfigured) {
      setError(t('landing.setupBody'));
      return;
    }

    setLoading(true);
    try {
      const result =
        tab === 'create'
          ? await createRoom({
              name: name.trim(),
              avatar,
              rounds,
              requestId: requestId.current,
            })
          : await joinRoom({ code, name: name.trim(), avatar });
      saveProfileDraft({ name: name.trim(), avatar });
      saveRecentRoom(result.code);
      sound.play(tab === 'create' ? 'join' : 'flip');
      haptics.caught();
      navigate(`/room/${result.code}`);
    } catch (cause) {
      setError(userErrorMessage(cause, t));
      pushToast(userErrorMessage(cause, t), 'error');
      haptics.error();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-paper">
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        aria-hidden
        style={{
          backgroundImage:
            'radial-gradient(ellipse at 8% 4%, rgba(223,169,63,.15), transparent 34%), radial-gradient(ellipse at 92% 10%, rgba(51,121,111,.1), transparent 33%), repeating-linear-gradient(90deg, transparent 0, transparent 79px, rgba(184,75,61,.055) 79px, rgba(184,75,61,.055) 80px)',
        }}
      />

      <header className="relative z-20 mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 pt-safe sm:px-7 sm:py-6">
        <Logo />
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setHowToOpen(true);
              sound.play('flip');
            }}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-ink/10 px-3 text-xs font-semibold text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink sm:px-3.5 sm:text-sm"
          >
            <BookOpen className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">{t('common.howToPlay')}</span>
          </button>
          <PreferenceButtons />
        </div>
      </header>

      <main className="relative z-10">
        <section className="relative mx-auto grid max-w-6xl gap-12 px-5 pb-16 pt-8 sm:px-7 sm:pt-12 lg:grid-cols-[1.05fr_.95fr] lg:gap-10 lg:pb-24 lg:pt-10">
          <div className="relative flex flex-col justify-center text-center lg:text-left">
            <div className="mb-5 flex justify-center lg:justify-start">
              <span className="relative inline-flex rotate-[-1deg] items-center gap-2 border border-ink/10 bg-paper-light/75 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.13em] text-ink-soft shadow-[0_2px_0_rgba(32,51,70,.07)] sm:text-xs">
                <Sparkle className="h-3.5 w-3.5 text-mustard" />
                {t('landing.eyebrow')}
                <span className="absolute -right-1.5 -top-1.5 h-3 w-3 rotate-12 bg-mustard/50" aria-hidden />
              </span>
            </div>

            <div className="relative">
              <div className="pointer-events-none absolute -left-10 -top-7 hidden h-12 w-12 rotate-[-16deg] text-mustard/80 lg:block">
                <Sparkle className="h-full w-full" />
              </div>
              <div className="pointer-events-none absolute -right-2 top-5 hidden h-8 w-8 rotate-12 text-terracotta/60 lg:block">
                <Sparkle className="h-full w-full" />
              </div>
              <h1
                aria-label={t('common.appName')}
                className="relative inline-block max-w-full font-bangla text-[clamp(3.45rem,15.5vw,8.2rem)] font-bold leading-[0.84] tracking-[-0.055em] text-ink"
              >
                <span className="relative inline-block -rotate-2">
                  {t('landing.headlineA')}
                  <span className="absolute -bottom-1 left-1 h-3 w-16 -rotate-2 rounded-full bg-terracotta/25 blur-[1px] sm:h-4 sm:w-24" />
                </span>{' '}
                <span className="relative inline-block rotate-1 text-[#284b5b]">
                  {t('landing.headlineB')}
                  <CircleScribble className="absolute -bottom-8 left-1/2 h-20 w-52 -translate-x-1/2 rotate-[-2deg] text-terracotta/45 sm:-bottom-10 sm:w-64" />
                </span>
              </h1>
              <p className="mt-3 pl-1 font-hand text-xl font-semibold tracking-[0.18em] text-ink-soft sm:text-2xl">
                CHOR · POLICE
              </p>
            </div>

            <p className="mx-auto mt-6 max-w-[31rem] text-base leading-8 text-ink-soft lg:mx-0 lg:text-lg lg:leading-8">
              {t('landing.lede')}
            </p>
            <p className="mx-auto mt-2 max-w-[30rem] rotate-[-0.6deg] font-hand text-lg leading-snug text-terracotta/90 lg:mx-0">
              {t('landing.introNote')}
            </p>

            <div className="mt-6 flex flex-wrap justify-center gap-2 lg:justify-start">
              {[
                { icon: UsersRound, label: t('landing.ruleChips.0') },
                { icon: LockKeyhole, label: t('landing.ruleChips.1') },
                { icon: KeyRound, label: t('landing.ruleChips.2') },
              ].map(({ icon: Icon, label }, index) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-paper-light/65 px-3 py-1.5 text-xs font-medium text-ink-soft"
                  style={{ transform: `rotate(${index === 1 ? 0.7 : -0.4}deg)` }}
                >
                  <Icon className="h-3.5 w-3.5 text-teal" aria-hidden />
                  {label}
                </span>
              ))}
            </div>

            <div className="pointer-events-none absolute -bottom-11 right-4 hidden text-mustard/80 lg:block">
              <LoopyArrow className="h-20 w-28 rotate-[155deg] scale-x-[-1]" />
            </div>

            <div className="mt-10 hidden items-center gap-4 lg:flex">
              <div className="flex -space-x-2">
                {GAME_CONFIG.avatars.slice(0, 4).map((emoji, index) => (
                  <span
                    key={emoji}
                    className="grid h-9 w-9 place-items-center rounded-full border-2 border-paper bg-paper-light text-base shadow-sm"
                    style={{ transform: `rotate(${(index - 1.5) * 4}deg)` }}
                    aria-hidden
                  >
                    {emoji}
                  </span>
                ))}
              </div>
              <p className="font-hand text-base leading-tight text-ink-soft">
                {i18n.language === 'bn'
                  ? 'চারটা চেয়ার খালি পড়ে আছে।'
                  : 'Four chairs are waiting.'}
              </p>
            </div>
          </div>

          <div className="relative mx-auto min-w-0 w-full max-w-[430px] lg:mx-0 lg:justify-self-end">
            <div className="pointer-events-none absolute -right-5 -top-16 hidden h-48 w-44 sm:block" aria-hidden>
              <div className="absolute right-0 top-3 rotate-[13deg]">
                <RoleSlip role="DAKAT" size="sm" className="shadow-paper" />
              </div>
              <div className="absolute right-12 top-0 rotate-[-5deg]">
                <RoleSlip role="CHOR" size="sm" className="shadow-paper" />
              </div>
              <div className="absolute right-24 top-5 rotate-[-14deg]">
                <RoleSlip role="POLICE" size="sm" className="shadow-paper" />
              </div>
              <div className="absolute right-7 top-16 rotate-[4deg]">
                <RoleSlip role="BABU" size="sm" className="shadow-paper" />
              </div>
              <Sparkle className="absolute -left-2 top-24 h-5 w-5 text-terracotta/60" />
            </div>

            <div className="paper relative rounded-[10px] border border-ink/10 p-1 shadow-paper-lift sm:mt-10">
              <div className="tape -top-3 left-1/2 -translate-x-1/2 rotate-[-1.5deg]" aria-hidden />
              <div className="rounded-[7px] border border-ink/5 px-4 pb-5 pt-4 sm:px-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-hand text-sm font-semibold uppercase tracking-[0.15em] text-terracotta/80">
                      {tab === 'create' ? t('landing.createTitle') : t('landing.joinTitle')}
                    </p>
                    <h2 className="mt-0.5 font-display text-xl font-bold leading-snug text-ink">
                      {tab === 'create' ? t('landing.createSub') : t('landing.joinSub')}
                    </h2>
                  </div>
                  <span className="grid h-8 w-8 shrink-0 rotate-6 place-items-center rounded-full bg-mustard/25 text-[15px]" aria-hidden>
                    ✎
                  </span>
                </div>

                <div role="tablist" aria-label={t('common.appName')} className="relative mt-4 flex border-b-2 border-ink/10">
                  {(['create', 'join'] as Tab[]).map((value) => {
                    const selected = tab === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        role="tab"
                        id={`landing-tab-${value}`}
                        aria-selected={selected}
                        aria-controls={`landing-panel-${value}`}
                        onClick={() => switchTab(value)}
                        className={cn(
                          'relative flex min-h-10 flex-1 items-center justify-center gap-1.5 px-2 pb-2.5 text-sm font-bold transition-colors',
                          selected ? 'text-ink' : 'text-ink-faint hover:text-ink-soft',
                        )}
                      >
                        {value === 'create' ? (
                          <UserPlus className="h-4 w-4" aria-hidden />
                        ) : (
                          <QrCode className="h-4 w-4" aria-hidden />
                        )}
                        {t(value === 'create' ? 'landing.createTab' : 'landing.joinTab')}
                        {selected && (
                          <motion.span
                            layoutId="landing-tab-underline"
                            className="absolute inset-x-1 -bottom-0.5 h-[3px] rounded-full bg-terracotta"
                            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>

                <form onSubmit={handleSubmit} className="mt-4" noValidate>
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      key={tab}
                      id={`landing-panel-${tab}`}
                      role="tabpanel"
                      aria-labelledby={`landing-tab-${tab}`}
                      initial={{ opacity: 0, y: 7 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                      transition={{ duration: 0.18 }}
                      className="space-y-4"
                    >
                      {tab === 'join' && (
                        <Field
                          label={t('landing.codeLabel')}
                          value={code}
                          onChange={(event) => {
                            setCode(sanitizeCode(event.target.value));
                            resetError();
                          }}
                          placeholder={t('landing.codePlaceholder')}
                          autoCapitalize="characters"
                          autoComplete="off"
                          spellCheck={false}
                          maxLength={6}
                          inputMode="text"
                          leading={<Link2 className="h-4 w-4" aria-hidden />}
                          className="h-14 text-center font-mono text-2xl font-bold uppercase tracking-[0.35em] placeholder:tracking-[0.2em] placeholder:text-base"
                          hint={
                            i18n.language === 'bn'
                              ? 'বন্ধুর পাঠানো লিংকেও সরাসরি ঢুকতে পারো।'
                              : 'The invite link also works—just tap it.'
                          }
                        />
                      )}

                      <Field
                        label={t('landing.nameLabel')}
                        value={name}
                        onChange={(event) => {
                          setName(event.target.value.slice(0, 20));
                          resetError();
                        }}
                        placeholder={t('landing.namePlaceholder')}
                        autoComplete="nickname"
                        maxLength={20}
                        leading={<span className="font-hand text-lg font-bold text-terracotta">Aa</span>}
                        disabled={loading}
                      />

                      <AvatarPicker
                        label={t('landing.avatarLabel')}
                        value={avatar}
                        onChange={(value) => {
                          setAvatar(value);
                          resetError();
                        }}
                        disabled={loading}
                      />

                      {tab === 'create' && (
                        <div>
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-ink">{t('landing.roundsLabel')}</span>
                            {roundsValid && rounds % GAME_CONFIG.recommendedMultiple !== 0 && (
                              <span className="text-right font-hand text-[13px] leading-tight text-terracotta/80">
                                {t('landing.roundsWarning')}
                              </span>
                            )}
                          </div>
                          <div className="grid grid-cols-4 gap-1.5">
                            {GAME_CONFIG.roundPresets.map((preset) => {
                              const selected = roundChoice === preset;
                              return (
                                <button
                                  key={preset}
                                  type="button"
                                  aria-pressed={selected}
                                  onClick={() => {
                                    setRoundChoice(preset);
                                    resetError();
                                    sound.play('click');
                                  }}
                                  className={cn(
                                    'relative flex h-11 items-baseline justify-center gap-0.5 rounded-lg border-2 font-hand text-lg font-bold transition-all',
                                    selected
                                      ? 'border-ink bg-mustard/45 text-ink shadow-[0_2px_0_rgba(32,51,70,.2)]'
                                      : 'border-ink/10 bg-paper-light text-ink-soft hover:border-ink/25',
                                  )}
                                >
                                  {localizeNumber(preset, i18n.language)}
                                  <span className="text-[10px] font-normal opacity-65">
                                    {i18n.language === 'bn' ? 'র' : 'R'}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                            <p className="text-[12px] leading-snug text-ink-soft">{t('landing.roundsHint')}</p>
                            <button
                              type="button"
                              aria-pressed={roundChoice === 'custom'}
                              onClick={() => {
                                setRoundChoice(roundChoice === 'custom' ? 8 : 'custom');
                                resetError();
                                sound.play('click');
                              }}
                              className={cn(
                                'inline-flex h-8 items-center gap-1 rounded-full border px-2.5 text-[11px] font-semibold transition-colors',
                                roundChoice === 'custom'
                                  ? 'border-ink/25 bg-mustard/35 text-ink'
                                  : 'border-ink/10 bg-paper-light text-ink-soft hover:border-ink/25',
                              )}
                            >
                              <span className="font-hand text-base font-bold leading-none">+</span>
                              {t('landing.customRounds')}
                            </button>
                          </div>
                          <AnimatePresence initial={false}>
                            {roundChoice === 'custom' && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden"
                              >
                                <div className="pt-2">
                                  <Field
                                    type="number"
                                    inputMode="numeric"
                                    min={GAME_CONFIG.minRounds}
                                    max={GAME_CONFIG.maxRounds}
                                    value={customRounds}
                                    onChange={(event) => {
                                      setCustomRounds(event.target.value);
                                      resetError();
                                    }}
                                    aria-label={t('landing.customRounds')}
                                    hint={t('landing.roundsHint')}
                                  />
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>

                        </div>
                      )}
                    </motion.div>
                  </AnimatePresence>

                  {error && (
                    <p
                      role="alert"
                      className="mt-3 rounded-lg border border-terracotta/25 bg-terracotta/[0.06] px-3 py-2 text-[13px] font-medium leading-snug text-terracotta"
                    >
                      {error}
                    </p>
                  )}

                  {!isSupabaseConfigured && (
                    <p className="mt-3 break-words rounded-lg border border-dashed border-mustard/60 bg-mustard/[0.08] px-3 py-2 text-[12px] leading-snug text-[#795713] [overflow-wrap:anywhere]">
                      {t('landing.setupTitle')} — {t('landing.setupBody')}
                    </p>
                  )}

                  <Button
                    type="submit"
                    size="lg"
                    fullWidth
                    loading={loading}
                    disabled={!isSupabaseConfigured}
                    className="mt-4"
                    rightIcon={<ArrowRight className="h-4 w-4" aria-hidden />}
                  >
                    {tab === 'create' ? t('landing.createButton') : t('landing.joinButton')}
                  </Button>

                  <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-ink-faint">
                    <span className="inline-flex items-center gap-1">
                      <LockKeyhole className="h-3 w-3" aria-hidden />
                      {t('landing.privacy')}
                    </span>
                    <span className="font-hand text-sm text-terracotta/70">৪ / ৪</span>
                  </div>
                </form>
              </div>
            </div>

            <p className="mt-4 text-center font-hand text-base text-ink-faint">
              {i18n.language === 'bn' ? 'বন্ধু ছাড়া খেলা জমে না।' : 'A game is no fun without friends.'}
            </p>
          </div>
        </section>

        <div className="relative border-y border-ink/10 bg-paper-light/45">
          <div className="mx-auto grid max-w-6xl gap-8 px-5 py-12 sm:px-7 sm:py-16 lg:grid-cols-[.8fr_1.2fr] lg:items-center lg:gap-14">
            <div className="relative">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="font-hand text-xl font-bold text-terracotta">Chapter one</p>
                  <h2 className="mt-1 font-display text-3xl font-bold leading-tight text-ink sm:text-4xl">
                    {t('landing.nostalgiaTitle')}
                  </h2>
                </div>
                <div className="mb-1 hidden h-12 w-12 rotate-6 text-mustard sm:block">
                  <MagnifierDoodle className="h-full w-full" />
                </div>
              </div>
              <p className="mt-4 max-w-md text-[15px] leading-7 text-ink-soft">{t('landing.nostalgiaBody')}</p>
              <p className="mt-4 rotate-[-1.2deg] font-hand text-lg text-ink">— {t('landing.nostalgiaSign')}</p>

              <div className="relative mt-8 flex max-w-[330px] items-center justify-between px-1">
                <div className="absolute inset-x-2 bottom-2 h-px bg-ink/10" aria-hidden />
                {([
                  ['CHOR', '-9deg'],
                  ['POLICE', '3deg'],
                  ['BABU', '-2deg'],
                  ['DAKAT', '11deg'],
                ] as Array<[Role, string]>).map(([role, rotation], index) => (
                  <div key={role} className="relative z-10" style={{ transform: `rotate(${rotation})` }}>
                    <RoleSlip role={role} size="sm" className="shadow-paper" />
                    {index === 3 && (
                      <span className="absolute -right-3 -top-3 stamp font-bangla text-[7px]">ভাগ্য</span>
                    )}
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setHowToOpen(true)}
                className="mt-7 inline-flex items-center gap-1.5 font-hand text-lg font-semibold text-teal underline decoration-teal/30 decoration-2 underline-offset-4 transition-colors hover:text-ink"
              >
                <BookOpen className="h-4 w-4" aria-hidden />
                {t('landing.openHowTo')}
              </button>
            </div>

            <div className="relative">
              <div className="absolute -left-3 -top-5 z-10 rotate-[-4deg] rounded-sm border border-ink/10 bg-mustard/80 px-2.5 py-1 font-hand text-sm font-bold text-ink shadow-sm sm:-left-5">
                {i18n.language === 'bn' ? 'নমুনা খাতা ✎' : 'A sample sheet ✎'}
              </div>
              <ScoreSheet
                players={mockPlayers}
                history={mockHistory}
                totalRounds={8}
                currentRound={5}
                live
                compact
                className="rotate-[0.4deg]"
              />
              <div className="absolute -bottom-3 -right-2 rotate-[3deg] rounded-sm border border-ink/10 bg-paper-light px-2.5 py-1 font-hand text-sm text-ink-soft shadow-sm">
                {t('landing.sampleCaption')}
              </div>
            </div>
          </div>
        </div>

        <section className="mx-auto max-w-6xl px-5 py-14 sm:px-7 sm:py-20">
          <div className="mb-8 flex items-end justify-between gap-4">
            <div>
              <p className="font-hand text-lg font-semibold text-terracotta">তিনটি ছোট প্রতিশ্রুতি</p>
              <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
                {i18n.language === 'bn' ? 'পুরনো খেলা, নতুন টেবিল' : 'Old game, new table'}
              </h2>
            </div>
            <div className="hidden items-center gap-1 text-mustard sm:flex" aria-hidden>
              <Sparkle className="h-4 w-4" />
              <Sparkle className="h-6 w-6" />
              <Sparkle className="h-3 w-3" />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
            {[
              {
                icon: UsersRound,
                title: t('landing.featureSeats'),
                body: t('landing.featureSeatsSub'),
                rotate: '-.6deg',
                tint: 'bg-[#f3ead4]',
              },
              {
                icon: Sparkles,
                title: t('landing.featureLive'),
                body: t('landing.featureLiveSub'),
                rotate: '.5deg',
                tint: 'bg-[#e9f1ec]',
              },
              {
                icon: LockKeyhole,
                title: t('landing.featureSecret'),
                body: t('landing.featureSecretSub'),
                rotate: '-.3deg',
                tint: 'bg-[#f6e6e1]',
              },
            ].map(({ icon: Icon, title, body, tint }, index) => (
              <article
                key={title}
                className={cn(
                  'paper relative rounded-[6px] border border-ink/10 p-5',
                  tint,
                )}
                style={{ transform: `rotate(${index === 1 ? 0.6 : index === 2 ? -0.4 : 0.2}deg)` }}
              >
                <span className="absolute right-4 top-3 font-hand text-3xl text-ink/10">0{index + 1}</span>
                <Icon className="h-6 w-6 text-teal" aria-hidden />
                <h3 className="mt-4 font-display text-lg font-bold text-ink">{title}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">{body}</p>
                {index === 0 && <TinyStarCrown className="absolute -bottom-3 -right-2 h-7 w-10 rotate-12 text-mustard/60" />}
              </article>
            ))}
          </div>

          {isSupabaseConfigured && (
            <div className="mt-10 flex flex-col items-center justify-center gap-2 text-center">
              <span className="font-hand text-lg text-ink-soft">{t('landing.demoHint')}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/demo')}
                rightIcon={<ArrowRight className="h-3.5 w-3.5" aria-hidden />}
              >
                {t('landing.demoButton')}
              </Button>
            </div>
          )}

          <div className="mt-14 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-t border-ink/10 pt-6 text-center text-[12px] text-ink-faint">
            <span className="font-hand text-base text-ink-soft">{t('landing.footer')}</span>
            <span aria-hidden>·</span>
            <span>{t('landing.privacy')}</span>
          </div>
        </section>
      </main>

      <HowToPlayModal open={howToOpen} onClose={() => setHowToOpen(false)} />
    </div>
  );
}
