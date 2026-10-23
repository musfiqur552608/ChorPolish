import { GAME_CONFIG } from '@/config/game';
import type {
  Phase,
  RankingEntry,
  Role,
  RoundHistory,
  RoundResultRow,
  TargetRole,
} from '@/types';

/**
 * The game engine is deliberately pure and independent from React and Supabase.
 * The SQL functions implement the same rules for the authoritative server; these
 * helpers power the UI, previews and tests.
 */

export interface EnginePlayer {
  id: string;
  seat: number;
  totalScore: number;
  babuCount: number;
}

export interface RoundScoreInput {
  roles: Record<string, Role>;
  targetRole: TargetRole;
  policeGuessPlayerId: string;
}

export interface RoundScore {
  caught: boolean;
  policePlayerId: string;
  babuPlayerId: string;
  targetPlayerId: string;
  guessedPlayerId: string;
  verdict: 'CAUGHT' | 'ESCAPED';
  scores: RoundResultRow[];
}

export function getTargetForRound(roundNumber: number): TargetRole {
  if (!Number.isInteger(roundNumber) || roundNumber < 1) {
    throw new Error('Round number must be a positive integer');
  }
  return roundNumber % 2 === 1
    ? GAME_CONFIG.targetByParity.odd
    : GAME_CONFIG.targetByParity.even;
}

/** Clockwise seat order starting immediately after the given player. */
export function clockwiseAfter(players: readonly Pick<EnginePlayer, 'id' | 'seat'>[], playerId: string): string[] {
  const ordered = [...players].sort((a, b) => a.seat - b.seat);
  const index = ordered.findIndex((player) => player.id === playerId);
  if (index === -1) throw new Error('Unknown player for clockwise order');
  return Array.from({ length: Math.max(ordered.length - 1, 0) }, (_, offset) => {
    const player = ordered[(index + offset + 1) % ordered.length];
    if (!player) throw new Error('Invalid seat layout');
    return player.id;
  });
}

/**
 * Round one is shuffled by the host, then the job rotates clockwise through
 * seats 1 → 2 → 3 → 4 → 1, regardless of who originally joined when.
 */
export function getShufflerForRound(
  players: readonly Pick<EnginePlayer, 'id' | 'seat'>[],
  hostPlayerId: string,
  roundNumber: number,
): string {
  if (roundNumber < 1) throw new Error('Round number must be positive');
  if (players.length !== GAME_CONFIG.seats) throw new Error('Exactly four players are required');
  const ordered = [...players].sort((a, b) => a.seat - b.seat);
  const hostIndex = ordered.findIndex((player) => player.id === hostPlayerId);
  if (hostIndex === -1) throw new Error('Host is not seated');
  const shuffler = ordered[(hostIndex + roundNumber - 1) % ordered.length];
  if (!shuffler) throw new Error('Invalid seat layout');
  return shuffler.id;
}

/** Three non-shufflers draw in clockwise order; the shuffler takes the last slip. */
export function getDrawOrder(
  players: readonly Pick<EnginePlayer, 'id' | 'seat'>[],
  shufflerId: string,
): string[] {
  return clockwiseAfter(players, shufflerId);
}

export function validateRoleAssignment(roles: Record<string, Role>): void {
  const values = Object.values(roles);
  if (values.length !== GAME_CONFIG.seats) {
    throw new Error('There must be exactly four assigned roles');
  }
  const unique = new Set(values);
  if (unique.size !== GAME_CONFIG.seats) {
    throw new Error('Every role must appear exactly once');
  }
  for (const role of ['BABU', 'POLICE', 'CHOR', 'DAKAT'] as Role[]) {
    if (!unique.has(role)) throw new Error(`Missing role: ${role}`);
  }
}

/**
 * Scoring:
 * - Babu always gets 90.
 * - Police gets 80 for the right accusation, otherwise zero.
 * - A caught target gets zero.
 * - A wrong accusation lets the target, and the other hidden player, keep their
 *   own Chor/Dakat points.
 */
export function scoreRound(input: RoundScoreInput): RoundScore {
  const { roles, targetRole, policeGuessPlayerId } = input;
  validateRoleAssignment(roles);

  const policeEntry = Object.entries(roles).find(([, role]) => role === 'POLICE');
  const babuEntry = Object.entries(roles).find(([, role]) => role === 'BABU');
  const targetEntry = Object.entries(roles).find(([, role]) => role === targetRole);
  if (!policeEntry || !babuEntry || !targetEntry) throw new Error('Invalid role layout');

  const guessedEntry = Object.entries(roles).find(([id]) => id === policeGuessPlayerId);
  if (!guessedEntry) throw new Error('The accused player is not at the table');
  if (guessedEntry[1] === 'POLICE' || guessedEntry[1] === 'BABU') {
    throw new Error('Police must accuse one of the two hidden players');
  }

  const [policePlayerId] = policeEntry;
  const [babuPlayerId] = babuEntry;
  const [targetPlayerId] = targetEntry;
  const caught = policeGuessPlayerId === targetPlayerId;

  const scores: RoundResultRow[] = Object.entries(roles).map(([playerId, role]) => {
    if (role === 'BABU') {
      return { playerId, role, points: GAME_CONFIG.points.BABU };
    }
    if (role === 'POLICE') {
      return { playerId, role, points: caught ? GAME_CONFIG.points.POLICE : 0 };
    }
    if (role === targetRole) {
      return {
        playerId,
        role,
        points: caught ? 0 : GAME_CONFIG.points[targetRole],
      };
    }
    return { playerId, role, points: GAME_CONFIG.points[role === 'CHOR' ? 'CHOR' : 'DAKAT'] };
  });

  return {
    caught,
    policePlayerId,
    babuPlayerId,
    targetPlayerId,
    guessedPlayerId: policeGuessPlayerId,
    verdict: caught ? 'CAUGHT' : 'ESCAPED',
    scores,
  };
}

/**
 * Competition ranking. Equal totals and equal Babu counts share a rank.
 * Example: 1, 2, 2, 4.
 */
export function rankPlayers<T extends EnginePlayer>(players: readonly T[]): Array<T & { rank: number }> {
  return [...players]
    .sort((a, b) => b.totalScore - a.totalScore || b.babuCount - a.babuCount || a.seat - b.seat)
    .map((player) => {
      const better = players.filter(
        (other) =>
          other.totalScore > player.totalScore ||
          (other.totalScore === player.totalScore && other.babuCount > player.babuCount),
      ).length;
      return { ...player, rank: better + 1 };
    });
}

export function toRankingEntries<T extends EnginePlayer>(
  players: readonly T[],
): RankingEntry[] {
  return rankPlayers(players).map(({ id, totalScore, babuCount, rank }) => ({
    playerId: id,
    totalScore,
    babuCount,
    rank,
  }));
}

export const ALLOWED_TRANSITIONS: Readonly<Record<Phase, readonly Phase[]>> = {
  SHUFFLE: ['DRAW'],
  DRAW: ['HIDDEN_ROLES'],
  HIDDEN_ROLES: ['BABU_REVEAL'],
  BABU_REVEAL: ['POLICE_REVEAL'],
  POLICE_REVEAL: ['BABU_ORDER'],
  BABU_ORDER: ['POLICE_GUESS'],
  POLICE_GUESS: ['FINAL_REVEAL'],
  FINAL_REVEAL: ['ROUND_RESULT'],
  ROUND_RESULT: ['SHUFFLE', 'MATCH_END'],
  MATCH_END: [],
};

export function isTransitionAllowed(from: Phase, to: Phase): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/** Phase that follows once a timed phase's server deadline passes. */
export function nextTimedPhase(from: Phase): Phase | null {
  switch (from) {
    case 'SHUFFLE':
      return 'DRAW';
    case 'HIDDEN_ROLES':
      return 'BABU_REVEAL';
    case 'BABU_REVEAL':
      return 'POLICE_REVEAL';
    case 'POLICE_REVEAL':
      return 'BABU_ORDER';
    case 'BABU_ORDER':
      return 'POLICE_GUESS';
    case 'FINAL_REVEAL':
      return 'ROUND_RESULT';
    case 'DRAW':
    case 'POLICE_GUESS':
    case 'ROUND_RESULT':
    case 'MATCH_END':
      return null;
  }
}

export function nextRoundDestination(currentRound: number, totalRounds: number):
  | { kind: 'NEXT_ROUND'; round: number }
  | { kind: 'MATCH_END' } {
  if (currentRound < 1 || totalRounds < 1 || currentRound > totalRounds) {
    throw new Error('Invalid round progression');
  }
  return currentRound >= totalRounds
    ? { kind: 'MATCH_END' }
    : { kind: 'NEXT_ROUND', round: currentRound + 1 };
}

/**
 * Which secrets may a specific viewer see? The server mirrors this policy.
 * Babu becomes public at BABU_REVEAL, Police at POLICE_REVEAL, and the hidden
 * pair only at FINAL_REVEAL.
 */
export function isRoleVisibleTo(
  role: Role,
  playerId: string,
  viewerPlayerId: string,
  phase: Phase,
): boolean {
  if (playerId === viewerPlayerId) return true;
  if (phase === 'FINAL_REVEAL' || phase === 'ROUND_RESULT' || phase === 'MATCH_END') return true;
  if (role === 'BABU') return phase !== 'SHUFFLE' && phase !== 'DRAW' && phase !== 'HIDDEN_ROLES';
  if (role === 'POLICE') {
    return (
      phase === 'POLICE_REVEAL' ||
      phase === 'BABU_ORDER' ||
      phase === 'POLICE_GUESS'
    );
  }
  return false;
}

export function totalScoresByPlayer(
  history: readonly Pick<RoundHistory, 'results'>[],
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const round of history) {
    for (const result of round.results) {
      totals[result.playerId] = (totals[result.playerId] ?? 0) + result.points;
    }
  }
  return totals;
}

export interface FunStats {
  bestDetectiveIds: string[];
  mostBabuIds: string[];
  mostFooledIds: string[];
  comebackIds: string[];
  maxCatches: number;
  maxBabus: number;
  maxFooled: number;
  maxComeback: number;
}

/**
 * Lightweight end-of-game superlatives, derived from public round results only.
 * "Biggest comeback" = the largest improvement between a player's worst
 * cumulative rank and their final rank.
 */
export function computeFunStats(
  players: readonly EnginePlayer[],
  history: readonly RoundHistory[],
): FunStats {
  const catches: Record<string, number> = {};
  const fooled: Record<string, number> = {};
  const babus: Record<string, number> = {};
  for (const player of players) {
    catches[player.id] = 0;
    fooled[player.id] = 0;
    babus[player.id] = 0;
  }

  const sortedHistory = [...history].sort((a, b) => a.number - b.number);
  const runningTotals: Record<string, number> = {};
  const runningBabus: Record<string, number> = {};
  const worstRank: Record<string, number> = {};
  for (const player of players) {
    runningTotals[player.id] = 0;
    runningBabus[player.id] = 0;
    worstRank[player.id] = 1;
  }

  for (const round of sortedHistory) {
    for (const result of round.results) {
      if (!(result.playerId in catches)) continue;
      runningTotals[result.playerId] = (runningTotals[result.playerId] ?? 0) + result.points;
      if (result.role === 'BABU') {
        babus[result.playerId] = (babus[result.playerId] ?? 0) + 1;
        runningBabus[result.playerId] = (runningBabus[result.playerId] ?? 0) + 1;
      }
      if (result.role === 'POLICE') {
        if (round.guessCorrect === true) catches[result.playerId] = (catches[result.playerId] ?? 0) + 1;
        if (round.guessCorrect === false) fooled[result.playerId] = (fooled[result.playerId] ?? 0) + 1;
      }
    }
    const stageRanks = rankPlayers(
      players.map((player) => ({
        ...player,
        totalScore: runningTotals[player.id] ?? 0,
        babuCount: runningBabus[player.id] ?? 0,
      })),
    );
    for (const staged of stageRanks) {
      worstRank[staged.id] = Math.max(worstRank[staged.id] ?? 1, staged.rank);
    }
  }

  const finalRanks = rankPlayers(
    players.map((player) => ({
      ...player,
      totalScore: runningTotals[player.id] ?? 0,
      babuCount: runningBabus[player.id] ?? 0,
    })),
  );

  let comebackImprovement = 0;
  const comebackCandidates: string[] = [];
  for (const player of finalRanks) {
    const improvement = (worstRank[player.id] ?? player.rank) - player.rank;
    if (improvement <= 0) continue;
    if (improvement > comebackImprovement) {
      comebackImprovement = improvement;
      comebackCandidates.length = 0;
      comebackCandidates.push(player.id);
    } else if (improvement === comebackImprovement) {
      comebackCandidates.push(player.id);
    }
  }

  const idsWhereMax = (counts: Record<string, number>, minimum = 1): { ids: string[]; max: number } => {
    const max = Math.max(0, ...Object.values(counts));
    if (max < minimum) return { ids: [], max };
    return {
      ids: players.filter((player) => counts[player.id] === max).map((player) => player.id),
      max,
    };
  };

  const detective = idsWhereMax(catches);
  const babuStat = idsWhereMax(babus);
  const fooledStat = idsWhereMax(fooled);

  return {
    bestDetectiveIds: detective.ids,
    mostBabuIds: babuStat.ids,
    mostFooledIds: fooledStat.ids,
    comebackIds: comebackCandidates,
    maxCatches: detective.max,
    maxBabus: babuStat.max,
    maxFooled: fooledStat.max,
    maxComeback: comebackImprovement,
  };
}
