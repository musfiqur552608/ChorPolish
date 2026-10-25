import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Crown } from 'lucide-react';
import { cn } from '@/lib/cn';
import { localizeNumber } from '@/lib/numbers';
import { ROLE_EMOJI } from '@/components/roles/RoleSlip';
import { topPlayerIds, totalScoresByPlayer } from '@/features/engine/engine';
import type { RoundHistory, Role } from '@/types';

export interface SheetPlayer {
  id: string;
  name: string;
  avatar: string;
  isMe?: boolean;
  isHost?: boolean;
  totalScore: number;
  babuCount: number;
}

interface ScoreSheetProps {
  players: SheetPlayer[];
  history: RoundHistory[];
  totalRounds: number;
  currentRound?: number;
  live?: boolean;
  compact?: boolean;
  className?: string;
  captureMode?: boolean;
  roomCode?: string | null;
}

const seatRotation = ['-1.4deg', '1deg', '-0.6deg', '1.5deg'];
const inkRotation = ['-2deg', '1.3deg', '-1deg', '2.2deg'];

function makeRowMap(round: RoundHistory | undefined): Map<string, { role: Role; points: number }> {
  const map = new Map<string, { role: Role; points: number }>();
  if (!round) return map;
  for (const result of round.results) {
    map.set(result.playerId, { role: result.role, points: result.points });
  }
  return map;
}

export function ScoreSheet({
  players,
  history,
  totalRounds,
  currentRound,
  live = false,
  compact = false,
  className,
  captureMode = false,
  roomCode,
}: ScoreSheetProps) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const leaders = topPlayerIds(players);
  const totals = totalScoresByPlayer(history);
  const historyByRound = new Map(history.map((round) => [round.number, round]));
  const rows = Array.from({ length: totalRounds }, (_, index) => index + 1);
  const completed = history.length;
  const showCurrent = Boolean(
    live &&
      currentRound &&
      currentRound > 0 &&
      currentRound <= totalRounds &&
      !historyByRound.has(currentRound),
  );
  const leaderNames = players.filter((player) => leaders.includes(player.id)).map((p) => p.name);
  const dense = totalRounds > 10;

  return (
    <section
      className={cn(
        'notebook relative overflow-hidden rounded-[3px] border border-ink/10 shadow-paper',
        captureMode ? 'w-[780px]' : 'w-full',
        className,
      )}
      aria-label={t('sheet.title')}
    >
      <div className="tape -left-4 -top-2 rotate-[-8deg]" aria-hidden />
      <div className="tape -right-5 -top-2 rotate-[7deg]" aria-hidden />
      <div
        className={cn(
          'relative pl-[calc(2.5rem+1px)] pr-3 sm:pr-5',
          compact ? 'pt-4' : 'pt-5 sm:pt-6',
        )}
      >
        <header className="flex items-start justify-between gap-3 pb-3">
          <div className="min-w-0">
            <h2
              className={cn(
                'font-display font-bold leading-none text-ink',
                compact ? 'text-lg' : 'text-2xl sm:text-[28px]',
              )}
            >
              {t('sheet.title')}
              <span className="ml-2 inline-block font-hand text-sm font-semibold text-terracotta sm:text-base">
                ✎ {t('sheet.finalScore')}
              </span>
            </h2>
            {!compact && (
              <p className="mt-2 font-hand text-lg leading-none text-ink-soft">{t('sheet.subtitle')}</p>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span className="rounded border border-ink/15 bg-paper-light/70 px-2 py-1 font-mono text-[10px] font-bold tracking-wider text-ink-soft">
              {localizeNumber(completed, language)} / {localizeNumber(totalRounds, language)}
            </span>
            {leaders.length > 0 && (
              <span className="inline-flex max-w-[155px] items-center gap-1 truncate font-hand text-base font-bold leading-tight text-[#86600d]">
                <Crown className="h-3.5 w-3.5 shrink-0 text-mustard" aria-hidden />
                <span className="truncate">{language === 'bn' ? 'এগিয়ে: ' : 'Leading: '}{leaderNames.join(' & ')}</span>
              </span>
            )}
            {roomCode && (
              <span className="font-mono text-[9px] uppercase tracking-widest text-ink-faint">{roomCode}</span>
            )}
          </div>
        </header>

        <div className="scrollbar-paper overflow-x-auto pb-1">
          <table
            className={cn(
              'w-full table-fixed border-collapse',
              captureMode ? 'min-w-[680px]' : 'min-w-[300px]',
            )}
          >
            <caption className="sr-only">{t('sheet.title')} — {t('sheet.subtitle')}</caption>
            <colgroup>
              <col className="w-8 sm:w-10" />
              {players.map((player) => (
                <col key={player.id} />
              ))}
            </colgroup>
            <thead>
              <tr className="align-bottom">
                <th className="border-b-2 border-ink/20 pb-1.5" scope="col">
                  <span className="sr-only">{t('sheet.round')}</span>
                </th>
                {players.map((player, index) => (
                  <th
                    key={player.id}
                    scope="col"
                    className="relative border-b-2 border-ink/20 px-0.5 pb-1.5 align-bottom"
                  >
                    <div className="flex flex-col items-center gap-1">
                      <span
                        className="grid h-6 w-6 place-items-center rounded-full border border-ink/10 bg-paper-deep/60 text-sm sm:h-7 sm:w-7"
                        aria-hidden
                      >
                        {player.avatar}
                      </span>
                      <span
                        className={cn(
                          'block max-w-full truncate px-0.5 font-bangla text-[11px] font-bold leading-tight text-ink sm:text-[13px]',
                          player.isMe && 'text-teal',
                        )}
                        style={{ transform: `rotate(${seatRotation[index % 4]})` }}
                        title={player.name}
                      >
                        {player.name}
                      </span>
                      <span className="font-hand text-[10px] leading-none text-ink-soft">
                        {language === 'bn' ? 'বাবু' : 'Babu'} {localizeNumber(player.babuCount, language)}×
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((roundNumber) => {
                const round = historyByRound.get(roundNumber);
                const roleMap = makeRowMap(round);
                const isCurrent = showCurrent && roundNumber === currentRound;
                return (
                  <tr
                    key={roundNumber}
                    className={cn(
                      'group transition-colors hover:bg-mustard/[0.04]',
                      isCurrent && 'bg-mustard/[0.09]',
                      !round && !isCurrent && 'opacity-55',
                      dense ? 'h-[29px]' : 'h-[34px]',
                    )}
                  >
                    <th
                      scope="row"
                      className="relative border-b border-blue-900/10 py-0 text-left align-middle font-hand text-[11px] font-semibold text-ink-faint sm:text-xs"
                    >
                      <span className="absolute -left-1 top-1/2 -translate-y-1/2">
                        {localizeNumber(roundNumber, language)}
                      </span>
                      {isCurrent && (
                        <span className="absolute left-[18px] top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-terracotta motion-safe:animate-pulse" />
                      )}
                    </th>
                    {players.map((player, index) => {
                      const cell = roleMap.get(player.id);
                      return (
                        <td
                          key={player.id}
                          className={cn(
                            'border-b border-blue-900/10 px-0.5 text-center align-middle',
                            index === 0 && 'border-l border-l-red-800/20',
                          )}
                        >
                          {cell ? (
                            <motion.span
                              key={`${roundNumber}-${player.id}-${round?.id ?? ''}`}
                              initial={captureMode ? false : { clipPath: 'inset(0 100% 0 0)', opacity: 0.2 }}
                              animate={{ clipPath: 'inset(0 0 0 0)', opacity: 1 }}
                              transition={{
                                duration: 0.5,
                                delay: captureMode ? 0 : 0.18 + index * 0.12 + (roundNumber % 4) * 0.025,
                                ease: [0.22, 1, 0.36, 1],
                              }}
                              className="inline-flex items-baseline justify-center gap-0.5 whitespace-nowrap"
                              title={`${t(`roles.${cell.role}.name`)} · ${t('sheet.pointsLabel', {
                                points: cell.points,
                              })}`}
                            >
                              <span
                                aria-hidden
                                className="translate-y-[-1px] text-[9px] opacity-75 sm:text-[10px]"
                              >
                                {ROLE_EMOJI[cell.role]}
                              </span>
                              <span
                                className={cn(
                                  'font-hand font-bold leading-none tracking-wide text-[#203a58]',
                                  dense ? 'text-[15px]' : 'text-[18px] sm:text-[20px]',
                                )}
                                style={{
                                  transform: `rotate(${inkRotation[(index + roundNumber) % 4]})`,
                                }}
                              >
                                {localizeNumber(cell.points, language)}
                              </span>
                            </motion.span>
                          ) : isCurrent ? (
                            <span
                              className="inline-block -rotate-2 font-hand text-lg leading-none text-terracotta/80"
                              aria-label={t('sheet.current')}
                            >
                              {player.isMe ? '✎' : '· · ·'}
                            </span>
                          ) : (
                            <span className="sr-only">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="h-[38px]">
                <th
                  scope="row"
                  className="border-t-2 border-ink/35 pt-1 text-left align-middle font-bangla text-[10px] font-bold text-ink sm:text-xs"
                >
                  {t('sheet.total')}
                </th>
                {players.map((player, index) => {
                  const total = totals[player.id] ?? 0;
                  return (
                    <td
                      key={player.id}
                      className={cn(
                        'border-t-2 border-ink/35 pt-1 text-center align-middle',
                        index === 0 && 'border-l border-l-red-800/20',
                      )}
                    >
                      <span
                        className={cn(
                          'relative inline-block min-w-[38px] rounded-sm px-1 font-hand text-[21px] font-bold leading-none text-terracotta',
                          leaders.includes(player.id) && 'bg-mustard/25',
                        )}
                        style={{ transform: `rotate(${inkRotation[(index + 1) % 4]})` }}
                      >
                        {leaders.includes(player.id) && (
                          <Crown
                            className="absolute -right-2.5 -top-2 h-3 w-3 rotate-[-15deg] text-mustard"
                            aria-hidden
                          />
                        )}
                        {localizeNumber(total, language)}
                      </span>
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="flex items-center justify-between gap-3 pb-3 pt-2">
          <p className="min-w-0 flex-1 truncate font-hand text-[13px] leading-tight text-ink-faint sm:text-sm">
            {completed === 0 ? t('sheet.noRounds') : t('sheet.legend')}
          </p>
          <span className="stamp shrink-0 font-bangla text-[8px] opacity-45 sm:text-[9px]">
            {t('common.appName')}
          </span>
        </div>
      </div>
    </section>
  );
}
