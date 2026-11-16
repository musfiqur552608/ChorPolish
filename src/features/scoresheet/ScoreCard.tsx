import { useTranslation } from 'react-i18next';
import { Bot, Crown, ShieldCheck, Sparkles, Trophy } from 'lucide-react';
import { cn } from '@/lib/cn';
import { localizeNumber } from '@/lib/numbers';
import { formatDate } from '@/lib/time';
import { ROLE_EMOJI } from '@/components/roles/RoleSlip';
import { pointsFor } from '@/config/game';
import { rankPlayers } from '@/features/engine/engine';
import type { Role, RoundHistory } from '@/types';
import type { SheetPlayer } from './ScoreSheet';

export type ScoreCardVariant = 'image' | 'pdf';

interface ScoreCardProps {
  players: SheetPlayer[];
  history: RoundHistory[];
  totalRounds: number;
  variant: ScoreCardVariant;
}

const variants = {
  image: {
    frame: 'h-[1620px] w-[1080px] p-[52px]',
    kicker: 'text-[11px]',
    title: 'text-[62px]',
    subtitle: 'text-[19px]',
    emblem: 'h-[86px] w-[86px]',
    emblemIcon: 'h-9 w-9',
    winnerPanel: 'p-6',
    winnerAvatar: 'h-[76px] w-[76px] text-[40px]',
    winnerName: 'text-[40px]',
    sectionTitle: 'text-[24px]',
    row: 'h-[50px] px-4',
    rowName: 'text-[18px]',
    rank: 'text-[17px]',
    avatar: 'h-[30px] w-[30px] text-[19px]',
    total: 'text-[26px]',
    statValue: 'text-[24px]',
    statLabel: 'text-[10px]',
    tableHead: 'h-[38px]',
    tableName: 'text-[14px]',
    tableAvatar: 'text-[17px]',
    tableRoundLabel: 'text-[10px]',
    tableCell: 'text-[16px]',
    roundNumber: 'text-[13px]',
    legendTitle: 'text-[10px]',
    legendHint: 'text-[9px]',
    legendIcon: 'text-[14px]',
    legendName: 'text-[12px]',
    legendPoints: 'text-[9px]',
    notesTitle: 'text-[10px]',
    notesValue: 'text-[22px]',
    notesLabel: 'text-[9px]',
    notesSub: 'text-[10px]',
    footer: 'text-[18px]',
  },
  pdf: {
    frame: 'h-[1754px] w-[1240px] p-[58px]',
    kicker: 'text-[12px]',
    title: 'text-[72px]',
    subtitle: 'text-[21px]',
    emblem: 'h-[96px] w-[96px]',
    emblemIcon: 'h-10 w-10',
    winnerPanel: 'p-7',
    winnerAvatar: 'h-[86px] w-[86px] text-[46px]',
    winnerName: 'text-[46px]',
    sectionTitle: 'text-[28px]',
    row: 'h-[56px] px-5',
    rowName: 'text-[20px]',
    rank: 'text-[19px]',
    avatar: 'h-[34px] w-[34px] text-[21px]',
    total: 'text-[28px]',
    statValue: 'text-[28px]',
    statLabel: 'text-[11px]',
    tableHead: 'h-[42px]',
    tableName: 'text-[15px]',
    tableAvatar: 'text-[19px]',
    tableRoundLabel: 'text-[11px]',
    tableCell: 'text-[17px]',
    roundNumber: 'text-[14px]',
    legendTitle: 'text-[11px]',
    legendHint: 'text-[10px]',
    legendIcon: 'text-[16px]',
    legendName: 'text-[14px]',
    legendPoints: 'text-[10px]',
    notesTitle: 'text-[11px]',
    notesValue: 'text-[24px]',
    notesLabel: 'text-[10px]',
    notesSub: 'text-[11px]',
    footer: 'text-[20px]',
  },
} as const;

const ROLE_ORDER: Role[] = ['BABU', 'POLICE', 'CHOR', 'DAKAT'];

function rankSheetPlayers(players: SheetPlayer[]) {
  return rankPlayers(
    players.map((player, index) => ({
      ...player,
      seat: player.seat ?? index + 1,
    })),
  );
}

export function ScoreCard({ players, history, totalRounds, variant }: ScoreCardProps) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const styles = variants[variant];
  const date = formatDate(language);
  const ranked = rankSheetPlayers(players);
  const leaders = ranked.filter((player) => player.rank === 1);
  const lastRank = ranked.length > 0 ? Math.max(...ranked.map((player) => player.rank)) : 0;
  const historyByRound = new Map(history.map((round) => [round.number, round]));
  const rounds = Array.from({ length: totalRounds }, (_, index) => index + 1);
  const totalPoints = players.reduce((sum, player) => sum + player.totalScore, 0);
  const totalBabu = players.reduce((sum, player) => sum + player.babuCount, 0);
  const topScore = players.reduce((best, player) => Math.max(best, player.totalScore), 0);
  const topScoreNames = ranked
    .filter((player) => player.totalScore === topScore)
    .map((player) => player.name)
    .join(', ');
  const caughtCount = history.filter((round) => round.guessCorrect === true).length;
  const showNotes = totalRounds <= 12;
  const showRoleLegend = totalRounds <= 12;
  const compactTable = totalRounds > 22;
  const roomyTable = totalRounds <= 5;
  const veryRoomyTable = totalRounds <= 2;
  const isShort = totalRounds <= 5;
  const shortRowHeight =
    totalRounds === 1
      ? 220
      : totalRounds === 2
        ? 150
        : totalRounds === 3
          ? 100
          : totalRounds === 4
            ? 80
            : 60;

  let bestRound: { player: SheetPlayer; points: number; round: number } | null = null;
  for (const round of history) {
    for (const result of round.results) {
      if (bestRound && result.points <= bestRound.points) continue;
      const player = players.find((candidate) => candidate.id === result.playerId);
      if (player) {
        bestRound = { player, points: result.points, round: round.number };
      }
    }
  }

  return (
    <article
      className={cn(
        'relative flex flex-col overflow-hidden bg-[#08111a] text-[#fff8e6]',
        styles.frame,
      )}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(ellipse at 12% 0%, rgba(240,195,90,0.24), transparent 42%), radial-gradient(ellipse at 88% 12%, rgba(110,192,180,0.16), transparent 40%), radial-gradient(ellipse at 50% 100%, rgba(240,140,110,0.10), transparent 55%), linear-gradient(180deg, #0b1622 0%, #08111a 55%, #060c13 100%)',
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,248,230,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,248,230,0.5) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />
      <div className="pointer-events-none absolute inset-[18px] rounded-[30px] border border-[#f0c35a]/20" />
      <div className="pointer-events-none absolute inset-[26px] rounded-[24px] border border-white/5" />

      <div className="relative flex h-full flex-col">
        <header className="flex shrink-0 items-start justify-between gap-8">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <span className="h-[2px] w-12 bg-[#f0c35a]" />
              <span
                className={cn(
                  'font-mono font-bold uppercase tracking-[0.34em] text-[#f0c35a]',
                  styles.kicker,
                )}
              >
                {t('scorecard.brand')}
                <span className="mx-2 text-white/25">/</span>
                {t('sheet.finalScore')}
              </span>
            </div>
            <h1
              className={cn(
                'mt-4 font-display font-bold leading-[0.95] text-[#fff8e6]',
                styles.title,
              )}
            >
              {t('sheet.cardTitle')}
            </h1>
            <p
              className={cn(
                'mt-4 max-w-[650px] leading-snug text-[#a9b8c8]',
                styles.subtitle,
              )}
            >
              {t('sheet.cardSubtitle')}
            </p>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-2">
            <div
              className={cn(
                'grid place-items-center rounded-full border border-[#f0c35a]/35 bg-[#f0c35a]/10 text-[#f0c35a] shadow-[0_0_44px_rgba(240,195,90,0.14)]',
                styles.emblem,
              )}
            >
              <Crown className={styles.emblemIcon} aria-hidden />
            </div>
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#f0c35a]/80">
              {t('scorecard.generated', { date })}
            </span>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 font-mono text-[9px] uppercase tracking-[0.18em] text-[#a9b8c8]">
              {t('scorecard.rounds', { count: totalRounds })}
            </span>
          </div>
        </header>

        {leaders.length > 0 && (
          <section
            className={cn(
              'relative mt-7 shrink-0 overflow-hidden rounded-[26px] border border-[#f0c35a]/35',
              styles.winnerPanel,
            )}
            style={{
              backgroundImage:
                'linear-gradient(120deg, rgba(240,195,90,0.18), rgba(240,195,90,0.045) 48%, rgba(110,192,180,0.10))',
            }}
          >
            <div
              className="pointer-events-none absolute -right-6 -top-12 font-display text-[190px] leading-none text-[#f0c35a]/10"
              aria-hidden
            >
              ♛
            </div>
            <div className="relative flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-[#f0c35a] text-[#08111a] shadow-[0_0_24px_rgba(240,195,90,0.25)]">
                <Trophy className="h-4 w-4" aria-hidden />
              </span>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.3em] text-[#f0c35a]">
                {leaders.length > 1 ? t('sheet.jointWinners') : t('scorecard.winner')}
              </p>
            </div>

            <div className="relative mt-4 flex flex-wrap items-center gap-x-8 gap-y-4">
              {leaders.map((player) => (
                <div key={player.id} className="flex min-w-[260px] flex-1 items-center gap-4">
                  <span
                    className={cn(
                      'grid shrink-0 place-items-center rounded-full border-2 border-[#f0c35a] bg-[#f0c35a]/15 shadow-[0_0_0_7px_rgba(240,195,90,0.08)]',
                      styles.winnerAvatar,
                    )}
                  >
                    {player.avatar}
                  </span>
                  <div className="min-w-0">
                    <p
                      className={cn(
                        'truncate font-bangla font-bold leading-tight text-[#fff8e6]',
                        styles.winnerName,
                      )}
                    >
                      {player.name}
                    </p>
                    <p className="mt-1 font-mono text-[12px] text-[#f0c35a]">
                      {localizeNumber(player.totalScore, language)} {t('common.points')}
                      <span className="mx-2 text-white/20">·</span>
                      {t('sheet.babuMarkText', {
                        value: localizeNumber(player.babuCount, language),
                      })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="mt-5 shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[#f0c35a]" aria-hidden />
            <p className="font-mono text-[9px] font-bold uppercase tracking-[0.26em] text-[#8fa2b5]">
              {t('scorecard.stats')}
            </p>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {[
              {
                label: t('sheet.statsRounds'),
                value: `${localizeNumber(history.length, language)} / ${localizeNumber(totalRounds, language)}`,
              },
              { label: t('sheet.statsPoints'), value: localizeNumber(totalPoints, language) },
              { label: t('sheet.statsBabu'), value: localizeNumber(totalBabu, language) },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2"
              >
                <p
                  className={cn(
                    'font-mono font-bold leading-none text-[#f0c35a]',
                    styles.statValue,
                  )}
                >
                  {stat.value}
                </p>
                <p
                  className={cn(
                    'mt-1 truncate font-mono uppercase tracking-[0.14em] text-[#8fa2b5]',
                    styles.statLabel,
                  )}
                >
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-5 shrink-0">
          <div className="flex items-end justify-between gap-3">
            <h2
              className={cn(
                'font-display font-bold leading-none text-[#fff8e6]',
                styles.sectionTitle,
              )}
            >
              {t('sheet.standings')}
            </h2>
            <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#8fa2b5]">
              {t('scorecard.total')}
            </span>
          </div>

          <div className="mt-2 space-y-1.5">
            {ranked.map((player) => {
              const isWinner = player.rank === 1;
              const isLast = lastRank > 1 && player.rank === lastRank;
              return (
                <div
                  key={player.id}
                  className={cn(
                    'flex items-center gap-3 rounded-xl border',
                    isWinner
                      ? 'border-[#f0c35a]/40 bg-[#f0c35a]/10'
                      : isLast
                        ? 'border-[#f08c6e]/25 bg-[#f08c6e]/[0.06]'
                        : 'border-white/10 bg-white/[0.035]',
                    styles.row,
                  )}
                >
                  <span
                    className={cn(
                      'w-7 shrink-0 text-center font-mono font-bold',
                      isWinner ? 'text-[#f0c35a]' : 'text-[#8fa2b5]',
                      styles.rank,
                    )}
                  >
                    {player.rank === 1
                      ? '🥇'
                      : player.rank === 2
                        ? '🥈'
                        : player.rank === 3
                          ? '🥉'
                          : localizeNumber(player.rank, language)}
                  </span>
                  <span
                    className={cn(
                      'grid shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.06]',
                      styles.avatar,
                    )}
                  >
                    {player.avatar}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        'flex min-w-0 items-center gap-1.5 truncate font-bangla font-bold text-[#fff8e6]',
                        styles.rowName,
                      )}
                    >
                      <span className="truncate">{player.name}</span>
                      {player.isHost && (
                        <Crown className="h-3 w-3 shrink-0 text-[#f0c35a]" aria-hidden />
                      )}
                      {player.isMe && (
                        <span className="shrink-0 rounded-sm bg-[#6ec0b4]/15 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider text-[#6ec0b4]">
                          {t('sheet.meMark')}
                        </span>
                      )}
                      {player.isBot && (
                        <span className="inline-flex shrink-0 items-center gap-0.5 rounded-sm bg-[#6ec0b4]/15 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider text-[#6ec0b4]">
                          <Bot className="h-2.5 w-2.5" aria-hidden />
                          {t('common.computer')}
                        </span>
                      )}
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-[10px] text-[#8fa2b5]">
                    {t('sheet.babuMarkText', {
                      value: localizeNumber(player.babuCount, language),
                    })}
                  </span>
                  <span
                    className={cn(
                      'w-[64px] shrink-0 text-right font-mono font-bold text-[#f0c35a]',
                      styles.total,
                    )}
                  >
                    {localizeNumber(player.totalScore, language)}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mt-5 flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 items-end justify-between gap-3">
            <h2
              className={cn(
                'font-display font-bold leading-none text-[#fff8e6]',
                styles.sectionTitle,
              )}
            >
              {t('sheet.roundByRound')}
            </h2>
            {!showRoleLegend && (
              <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 font-mono text-[9px] uppercase tracking-[0.14em] text-[#8fa2b5]">
                {ROLE_ORDER.map((role) => (
                  <span key={role} className="inline-flex items-center gap-1">
                    <span className="text-[12px]" aria-hidden>
                      {ROLE_EMOJI[role]}
                    </span>
                    {t(`roles.${role}.name`)}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div
            className={cn(
              'mt-2 flex min-h-0 flex-col overflow-hidden rounded-xl border border-white/10 bg-[#0b1622]/70',
              isShort ? 'shrink-0' : 'flex-1',
            )}
          >
            <table
              className={cn(
                'w-full table-fixed border-collapse',
                !isShort && 'h-full',
              )}
            >
              <colgroup>
                <col className="w-[64px]" />
                {players.map((player) => (
                  <col key={player.id} />
                ))}
              </colgroup>
              <thead>
                <tr className={cn('border-b border-white/10 bg-white/[0.04]', styles.tableHead)}>
                  <th
                    className={cn(
                      'px-2 text-left align-middle font-mono uppercase tracking-[0.18em] text-[#8fa2b5]',
                      styles.tableRoundLabel,
                    )}
                  >
                    {t('sheet.round')}
                  </th>
                  {players.map((player) => (
                    <th key={player.id} className="px-1 text-center align-middle">
                      <div className="flex items-center justify-center gap-1.5">
                        <span className={styles.tableAvatar}>{player.avatar}</span>
                        <span
                          className={cn(
                            'truncate font-bangla font-bold text-[#dbe6ef]',
                            styles.tableName,
                            compactTable && 'text-[12px]',
                          )}
                        >
                          {player.name}
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rounds.map((roundNumber) => {
                  const round = historyByRound.get(roundNumber);
                  return (
                    <tr
                      key={roundNumber}
                      className={cn(
                        'border-b border-white/[0.06] leading-none last:border-0',
                        !round && 'opacity-35',
                      )}
                      style={isShort ? { height: shortRowHeight } : undefined}
                    >
                      <th
                        className={cn(
                          'px-2 text-left align-middle font-mono font-semibold text-[#8fa2b5]',
                          styles.roundNumber,
                          compactTable && 'text-[12px]',
                          roomyTable && 'text-[16px]',
                          veryRoomyTable && 'text-[20px]',
                        )}
                      >
                        {localizeNumber(roundNumber, language)}
                      </th>
                      {players.map((player) => {
                        const cell = round?.results.find(
                          (result) => result.playerId === player.id,
                        );
                        return (
                          <td key={player.id} className="px-1 text-center align-middle">
                            {cell ? (
                              <span className="inline-flex items-center gap-1">
                                <span
                                  className={cn(
                                    'opacity-75',
                                    compactTable
                                      ? 'text-[12px]'
                                      : veryRoomyTable
                                        ? 'text-[28px]'
                                        : roomyTable
                                          ? 'text-[20px]'
                                          : 'text-[16px]',
                                  )}
                                  aria-hidden
                                >
                                  {ROLE_EMOJI[cell.role]}
                                </span>
                                <span
                                  className={cn(
                                    'font-mono font-bold text-[#fff8e6]',
                                    styles.tableCell,
                                    compactTable && 'text-[14px]',
                                    roomyTable && 'text-[18px]',
                                    veryRoomyTable && 'text-[24px]',
                                  )}
                                >
                                  {localizeNumber(cell.points, language)}
                                </span>
                              </span>
                            ) : (
                              <span className="text-white/15">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {showRoleLegend && (
            <div className="mt-2 shrink-0">
              <div className="flex items-center justify-between gap-3">
                <p
                  className={cn(
                    'font-mono font-bold uppercase tracking-[0.22em] text-[#8fa2b5]',
                    styles.legendTitle,
                  )}
                >
                  {t('sheet.roleLegend')}
                </p>
                <p
                  className={cn(
                    'font-mono uppercase tracking-[0.14em] text-[#8fa2b5]/70',
                    styles.legendHint,
                  )}
                >
                  {t('sheet.roleLegendHint')}
                </p>
              </div>
              <div className="mt-1.5 grid grid-cols-4 gap-2">
                {ROLE_ORDER.map((role) => (
                  <div
                    key={role}
                    className="flex min-w-0 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-2.5 py-2"
                  >
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/[0.06]">
                      <span className={styles.legendIcon} aria-hidden>
                        {ROLE_EMOJI[role]}
                      </span>
                    </span>
                    <div className="min-w-0">
                      <p
                        className={cn(
                          'truncate font-bangla font-bold text-[#dbe6ef]',
                          styles.legendName,
                        )}
                      >
                        {t(`roles.${role}.name`)}
                      </p>
                      <p className={cn('font-mono text-[#8fa2b5]', styles.legendPoints)}>
                        {localizeNumber(pointsFor(role), language)} {t('common.points')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {showNotes && (
            <div className="mt-3 shrink-0">
              <div className="flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-[#f0c35a]" aria-hidden />
                <p
                  className={cn(
                    'font-mono font-bold uppercase tracking-[0.24em] text-[#8fa2b5]',
                    styles.notesTitle,
                  )}
                >
                  {t('sheet.matchNotes')}
                </p>
              </div>
              <div
                className={cn(
                  'mt-1.5 grid gap-2',
                  isShort ? 'grid-cols-2' : 'grid-cols-3',
                )}
              >
                <div className="rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2.5">
                  <p
                    className={cn(
                      'font-mono font-bold leading-none text-[#f0c35a]',
                      styles.notesValue,
                    )}
                  >
                    {localizeNumber(topScore, language)}
                  </p>
                  <p
                    className={cn(
                      'mt-1 truncate font-mono uppercase tracking-[0.14em] text-[#8fa2b5]',
                      styles.notesLabel,
                    )}
                  >
                    {t('sheet.topScore')}
                  </p>
                  <p className={cn('mt-0.5 truncate text-[#8fa2b5]', styles.notesSub)}>
                    {topScoreNames}
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2.5">
                  <p
                    className={cn(
                      'font-mono font-bold leading-none text-[#f0c35a]',
                      styles.notesValue,
                    )}
                  >
                    {bestRound ? localizeNumber(bestRound.points, language) : '—'}
                  </p>
                  <p
                    className={cn(
                      'mt-1 truncate font-mono uppercase tracking-[0.14em] text-[#8fa2b5]',
                      styles.notesLabel,
                    )}
                  >
                    {t('sheet.biggestRound')}
                  </p>
                  <p className={cn('mt-0.5 truncate text-[#8fa2b5]', styles.notesSub)}>
                    {bestRound
                      ? `${bestRound.player.name} · ${t('sheet.round')} ${localizeNumber(
                          bestRound.round,
                          language,
                        )}`
                      : '—'}
                  </p>
                </div>
                <div
                  className={cn(
                    'rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2.5',
                    isShort && 'col-span-2',
                  )}
                >
                  <p
                    className={cn(
                      'font-mono font-bold leading-none text-[#f0c35a]',
                      styles.notesValue,
                    )}
                  >
                    {localizeNumber(caughtCount, language)} /{' '}
                    {localizeNumber(history.length, language)}
                  </p>
                  <p
                    className={cn(
                      'mt-1 truncate font-mono uppercase tracking-[0.14em] text-[#8fa2b5]',
                      styles.notesLabel,
                    )}
                  >
                    {t('sheet.policeCaught')}
                  </p>
                  <p className={cn('mt-0.5 truncate text-[#8fa2b5]', styles.notesSub)}>
                    {t('sheet.statsRounds')}
                  </p>
                </div>
              </div>
            </div>
          )}

          {isShort && (
            <div className="mt-3 flex min-h-0 flex-1 items-center justify-center rounded-xl border border-[#f0c35a]/10 bg-[#f0c35a]/[0.03] px-6 py-2 text-center">
              <p className="font-hand text-[18px] leading-snug text-[#f0c35a]/75">
                {t('sheet.shortGameQuote')}
              </p>
            </div>
          )}
        </section>

        <footer className="mt-4 flex shrink-0 items-center justify-between gap-4 border-t border-white/10 pt-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-[#f0c35a]/30 bg-[#f0c35a]/10 text-[#f0c35a]">
              <Crown className="h-3.5 w-3.5" aria-hidden />
            </span>
            <div className="min-w-0">
              <p
                className={cn(
                  'truncate font-hand font-bold leading-tight text-[#f0c35a]',
                  styles.footer,
                )}
              >
                {t('scorecard.footer')}
              </p>
              <p className="mt-0.5 flex items-center gap-1 font-mono text-[8px] uppercase tracking-[0.16em] text-[#8fa2b5]">
                <ShieldCheck className="h-2.5 w-2.5" aria-hidden />
                {t('sheet.privacy')}
              </p>
            </div>
          </div>
          <p className="shrink-0 font-mono text-[9px] uppercase tracking-[0.24em] text-[#8fa2b5]">
            {t('scorecard.brand')}
          </p>
        </footer>
      </div>
    </article>
  );
}
