import { describe, expect, it } from 'vitest';
import type { Phase, Role, RoundHistory } from '@/types';
import {
  ALLOWED_TRANSITIONS,
  computeFunStats,
  getDrawOrder,
  getShufflerForRound,
  getTargetForRound,
  isRoleVisibleTo,
  isTransitionAllowed,
  mergeRoundHistory,
  nextRoundDestination,
  nextTimedPhase,
  rankPlayers,
  scoreRound,
  topPlayerIds,
  totalScoresByPlayer,
  validateRoleAssignment,
  clockwiseAfter,
} from '@/features/engine/engine';
import { GAME_CONFIG } from '@/config/game';

const PLAYERS: { id: string; seat: number; totalScore: number; babuCount: number }[] = [
  { id: 'p1', seat: 1, totalScore: 0, babuCount: 0 },
  { id: 'p2', seat: 2, totalScore: 0, babuCount: 0 },
  { id: 'p3', seat: 3, totalScore: 0, babuCount: 0 },
  { id: 'p4', seat: 4, totalScore: 0, babuCount: 0 },
];

// Typed strictly to satisfy tsc -b: test data as Record<string, Role>.
const ROLES_CHOR: Record<string, Role> = {
  p1: 'BABU',
  p2: 'POLICE',
  p3: 'CHOR',
  p4: 'DAKAT',
};

const HISTORY_CAUGHT = [
  { number: 1, guessCorrect: true, results: [{ playerId: 'p1', role: 'BABU' as Role, points: 90 }, { playerId: 'p2', role: 'POLICE' as Role, points: 80 }, { playerId: 'p3', role: 'CHOR' as Role, points: 0 }, { playerId: 'p4', role: 'DAKAT' as Role, points: 70 }] },
  { number: 2, guessCorrect: true, results: [{ playerId: 'p1', role: 'POLICE' as Role, points: 80 }, { playerId: 'p2', role: 'CHOR' as Role, points: 60 }, { playerId: 'p3', role: 'DAKAT' as Role, points: 70 }, { playerId: 'p4', role: 'BABU' as Role, points: 90 }] },
];

describe('getTargetForRound', () => {
  it('returns CHOR for odd rounds', () => {
    expect(getTargetForRound(1)).toBe('CHOR');
    expect(getTargetForRound(3)).toBe('CHOR');
    expect(getTargetForRound(5)).toBe('CHOR');
  });
  it('returns DAKAT for even rounds', () => {
    expect(getTargetForRound(2)).toBe('DAKAT');
    expect(getTargetForRound(4)).toBe('DAKAT');
    expect(getTargetForRound(6)).toBe('DAKAT');
  });
  it('throws for invalid round numbers', () => {
    expect(() => getTargetForRound(0)).toThrow();
    expect(() => getTargetForRound(-1)).toThrow();
    expect(() => getTargetForRound(1.5)).toThrow();
  });
});

describe('clockwiseAfter', () => {
  it('lists players clockwise starting after the given player', () => {
    expect(clockwiseAfter(PLAYERS, 'p1')).toEqual(['p2', 'p3', 'p4']);
    expect(clockwiseAfter(PLAYERS, 'p2')).toEqual(['p3', 'p4', 'p1']);
    expect(clockwiseAfter(PLAYERS, 'p4')).toEqual(['p1', 'p2', 'p3']);
  });
  it('throws for unknown player', () => {
    expect(() => clockwiseAfter(PLAYERS, 'nope')).toThrow();
  });
});

describe('getShufflerForRound', () => {
  it('rotates the shuffler clockwise from host', () => {
    expect(getShufflerForRound(PLAYERS, 'p1', 1)).toBe('p1');
    expect(getShufflerForRound(PLAYERS, 'p1', 2)).toBe('p2');
    expect(getShufflerForRound(PLAYERS, 'p1', 3)).toBe('p3');
    expect(getShufflerForRound(PLAYERS, 'p1', 4)).toBe('p4');
    expect(getShufflerForRound(PLAYERS, 'p1', 5)).toBe('p1');
  });
  it('works from any host seat', () => {
    expect(getShufflerForRound(PLAYERS, 'p3', 1)).toBe('p3');
    expect(getShufflerForRound(PLAYERS, 'p3', 2)).toBe('p4');
    expect(getShufflerForRound(PLAYERS, 'p3', 3)).toBe('p1');
    expect(getShufflerForRound(PLAYERS, 'p3', 4)).toBe('p2');
  });
  it('requires exactly four players', () => {
    expect(() => getShufflerForRound(PLAYERS.slice(0, 3), 'p1', 1)).toThrow();
    expect(() => getShufflerForRound(PLAYERS.slice(0, 2), 'p1', 1)).toThrow();
  });
});

describe('getDrawOrder', () => {
  it('returns the three non-shufflers in clockwise order', () => {
    expect(getDrawOrder(PLAYERS, 'p1')).toEqual(['p2', 'p3', 'p4']);
    expect(getDrawOrder(PLAYERS, 'p4')).toEqual(['p1', 'p2', 'p3']);
  });
});

describe('validateRoleAssignment', () => {
  it('accepts a valid one-of-each assignment', () => {
    expect(() => validateRoleAssignment(ROLES_CHOR)).not.toThrow();
  });
  it('rejects wrong count', () => {
    expect(() => validateRoleAssignment({ p1: 'BABU', p2: 'POLICE' as Role })).toThrow();
  });
  it('rejects duplicate roles', () => {
    expect(() => validateRoleAssignment({ p1: 'BABU', p2: 'BABU' as Role, p3: 'POLICE' as Role, p4: 'CHOR' as Role })).toThrow();
  });
  it('rejects missing roles', () => {
    expect(() => validateRoleAssignment({ p1: 'BABU', p2: 'POLICE' as Role, p3: 'CHOR' as Role, p4: 'CHOR' as Role })).toThrow();
  });
});

describe('scoreRound', () => {
  it('awards Babu 90 always', () => {
    const result = scoreRound({ roles: ROLES_CHOR, targetRole: 'CHOR', policeGuessPlayerId: 'p3' });
    const babu = result.scores.find((s) => s.role === 'BABU');
    expect(babu?.points).toBe(GAME_CONFIG.points.BABU);
  });
  it('awards Police 80 on catch, 0 on escape', () => {
    const caught = scoreRound({ roles: ROLES_CHOR, targetRole: 'CHOR', policeGuessPlayerId: 'p3' });
    expect(caught.caught).toBe(true);
    expect(caught.scores.find((s) => s.role === 'POLICE')?.points).toBe(GAME_CONFIG.points.POLICE);

    const escaped = scoreRound({ roles: ROLES_CHOR, targetRole: 'CHOR', policeGuessPlayerId: 'p4' });
    expect(escaped.caught).toBe(false);
    expect(escaped.scores.find((s) => s.role === 'POLICE')?.points).toBe(0);
  });
  it('awards the right target points on escape, zero on catch', () => {
    const caught = scoreRound({ roles: ROLES_CHOR, targetRole: 'CHOR', policeGuessPlayerId: 'p3' });
    expect(caught.scores.find((s) => s.role === 'CHOR')?.points).toBe(0);

    const escaped = scoreRound({ roles: ROLES_CHOR, targetRole: 'CHOR', policeGuessPlayerId: 'p4' });
    expect(escaped.scores.find((s) => s.role === 'CHOR')?.points).toBe(GAME_CONFIG.points.CHOR);
  });
  it('awards Dakat 70 when not hunted', () => {
    const result = scoreRound({ roles: ROLES_CHOR, targetRole: 'CHOR', policeGuessPlayerId: 'p4' });
    const dakat = result.scores.find((s) => s.role === 'DAKAT');
    expect(dakat?.points).toBe(GAME_CONFIG.points.DAKAT);
  });
  it('throws when Police accuses Babu or itself', () => {
    expect(() => scoreRound({ roles: ROLES_CHOR, targetRole: 'CHOR', policeGuessPlayerId: 'p1' })).toThrow();
    expect(() => scoreRound({ roles: ROLES_CHOR, targetRole: 'CHOR', policeGuessPlayerId: 'p2' })).toThrow();
  });
  it('scores even-round Dakat hunts correctly', () => {
    const roles: Record<string, Role> = { p1: 'BABU', p2: 'POLICE', p3: 'CHOR', p4: 'DAKAT' };
    const caught = scoreRound({ roles, targetRole: 'DAKAT', policeGuessPlayerId: 'p4' });
    expect(caught.caught).toBe(true);
    expect(caught.scores.find((s) => s.role === 'DAKAT')?.points).toBe(0);
    expect(caught.scores.find((s) => s.role === 'CHOR')?.points).toBe(GAME_CONFIG.points.CHOR);

    const escaped = scoreRound({ roles, targetRole: 'DAKAT', policeGuessPlayerId: 'p3' });
    expect(escaped.caught).toBe(false);
    expect(escaped.scores.find((s) => s.role === 'DAKAT')?.points).toBe(GAME_CONFIG.points.DAKAT);
    expect(escaped.scores.find((s) => s.role === 'CHOR')?.points).toBe(GAME_CONFIG.points.CHOR);
  });
  it('throws for an accused player who is not at the table', () => {
    expect(() =>
      scoreRound({ roles: ROLES_CHOR, targetRole: 'CHOR', policeGuessPlayerId: 'ghost' }),
    ).toThrow();
  });
});

describe('rankPlayers', () => {
  it('uses competition ranking 1, 2, 2, 4', () => {
    const players = [
      { id: 'p1', seat: 1, totalScore: 200, babuCount: 2 },
      { id: 'p2', seat: 2, totalScore: 180, babuCount: 1 },
      { id: 'p3', seat: 3, totalScore: 180, babuCount: 1 },
      { id: 'p4', seat: 4, totalScore: 100, babuCount: 0 },
    ];
    const ranked = rankPlayers(players);
    expect(ranked.find((p) => p.id === 'p1')?.rank).toBe(1);
    expect(ranked.find((p) => p.id === 'p2')?.rank).toBe(2);
    expect(ranked.find((p) => p.id === 'p3')?.rank).toBe(2);
    expect(ranked.find((p) => p.id === 'p4')?.rank).toBe(4);
  });
  it('breaks total-score ties by Babu count', () => {
    const players = [
      { id: 'p1', seat: 1, totalScore: 200, babuCount: 2 },
      { id: 'p2', seat: 2, totalScore: 200, babuCount: 3 },
    ];
    const ranked = rankPlayers(players);
    expect(ranked.find((p) => p.id === 'p1')?.rank).toBe(2);
    expect(ranked.find((p) => p.id === 'p2')?.rank).toBe(1);
  });
  it('shares rank when both score and Babu count tie', () => {
    const players = [
      { id: 'p1', seat: 1, totalScore: 200, babuCount: 2 },
      { id: 'p2', seat: 2, totalScore: 200, babuCount: 2 },
    ];
    const ranked = rankPlayers(players);
    expect(ranked.find((p) => p.id === 'p1')?.rank).toBe(1);
    expect(ranked.find((p) => p.id === 'p2')?.rank).toBe(1);
  });
  it('preserves additional player fields', () => {
    const ranked = rankPlayers([
      { id: 'p1', seat: 1, totalScore: 10, babuCount: 0, name: 'Rafi', avatar: '🦊' },
    ]);
    expect(ranked[0]).toMatchObject({ id: 'p1', name: 'Rafi', avatar: '🦊', rank: 1 });
  });
});

describe('topPlayerIds', () => {
  it('returns the clear leader', () => {
    expect(
      topPlayerIds([
        { id: 'p1', totalScore: 200, babuCount: 1 },
        { id: 'p2', totalScore: 180, babuCount: 3 },
      ]),
    ).toEqual(['p1']);
  });

  it('breaks a score tie with the Babu count', () => {
    expect(
      topPlayerIds([
        { id: 'p1', totalScore: 200, babuCount: 1 },
        { id: 'p2', totalScore: 200, babuCount: 2 },
      ]),
    ).toEqual(['p2']);
  });

  it('returns every joint leader when both score and Babu count tie', () => {
    expect(
      topPlayerIds([
        { id: 'p1', totalScore: 200, babuCount: 2 },
        { id: 'p2', totalScore: 200, babuCount: 2 },
        { id: 'p3', totalScore: 100, babuCount: 4 },
      ]),
    ).toEqual(['p1', 'p2']);
  });

  it('returns an empty list with no players', () => {
    expect(topPlayerIds([])).toEqual([]);
  });
});

describe('isTransitionAllowed', () => {
  it('allows timed phase progressions', () => {
    expect(isTransitionAllowed('SHUFFLE', 'DRAW')).toBe(true);
    expect(isTransitionAllowed('DRAW', 'HIDDEN_ROLES')).toBe(true);
    expect(isTransitionAllowed('HIDDEN_ROLES', 'BABU_REVEAL')).toBe(true);
  });
  it('allows the manual Police jump and the legacy loop', () => {
    expect(isTransitionAllowed('POLICE_REVEAL', 'POLICE_GUESS')).toBe(true);
    expect(isTransitionAllowed('POLICE_REVEAL', 'BABU_ORDER')).toBe(true);
    expect(isTransitionAllowed('BABU_ORDER', 'POLICE_GUESS')).toBe(true);
  });
  it('disallows backwards transitions', () => {
    expect(isTransitionAllowed('DRAW', 'SHUFFLE')).toBe(false);
    expect(isTransitionAllowed('BABU_REVEAL', 'HIDDEN_ROLES')).toBe(false);
    expect(isTransitionAllowed('POLICE_GUESS', 'POLICE_REVEAL')).toBe(false);
  });
  it('allows ROUND_RESULT to go to next round or MATCH_END', () => {
    expect(isTransitionAllowed('ROUND_RESULT', 'SHUFFLE')).toBe(true);
    expect(isTransitionAllowed('ROUND_RESULT', 'MATCH_END')).toBe(true);
  });
});

describe('nextTimedPhase', () => {
  it('advances automatic phases', () => {
    expect(nextTimedPhase('SHUFFLE')).toBe('DRAW');
    expect(nextTimedPhase('HIDDEN_ROLES')).toBe('BABU_REVEAL');
    expect(nextTimedPhase('FINAL_REVEAL')).toBe('ROUND_RESULT');
  });
  it('returns null for manual or terminal phases', () => {
    expect(nextTimedPhase('DRAW')).toBe(null);
    expect(nextTimedPhase('BABU_REVEAL')).toBe(null);
    expect(nextTimedPhase('POLICE_REVEAL')).toBe(null);
    expect(nextTimedPhase('POLICE_GUESS')).toBe(null);
    expect(nextTimedPhase('ROUND_RESULT')).toBe(null);
    expect(nextTimedPhase('MATCH_END')).toBe(null);
  });
  it('still advances the legacy BABU_ORDER phase', () => {
    expect(nextTimedPhase('BABU_ORDER')).toBe('POLICE_GUESS');
  });
  it('never yields a transition the table forbids', () => {
    for (const phase of Object.keys(ALLOWED_TRANSITIONS) as Phase[]) {
      const next = nextTimedPhase(phase);
      if (next) expect(isTransitionAllowed(phase, next), `${phase} -> ${next}`).toBe(true);
    }
  });
});

describe('nextRoundDestination', () => {
  it('returns NEXT_ROUND when rounds remain', () => {
    expect(nextRoundDestination(1, 4)).toEqual({ kind: 'NEXT_ROUND', round: 2 });
    expect(nextRoundDestination(3, 4)).toEqual({ kind: 'NEXT_ROUND', round: 4 });
  });
  it('returns MATCH_END at the final round', () => {
    expect(nextRoundDestination(4, 4)).toEqual({ kind: 'MATCH_END' });
    expect(nextRoundDestination(1, 1)).toEqual({ kind: 'MATCH_END' });
  });
  it('throws on invalid progression', () => {
    expect(() => nextRoundDestination(0, 4)).toThrow();
    expect(() => nextRoundDestination(5, 4)).toThrow();
  });
});

describe('isRoleVisibleTo', () => {
  it('lets a player see their own role only after picking', () => {
    expect(isRoleVisibleTo('BABU', 'p1', 'p1', 'DRAW')).toBe(true);
    expect(isRoleVisibleTo('POLICE', 'p2', 'p2', 'HIDDEN_ROLES')).toBe(true);
    expect(isRoleVisibleTo('CHOR', 'p3', 'p3', 'POLICE_GUESS')).toBe(true);
    expect(isRoleVisibleTo('BABU', 'p1', 'p1', 'SHUFFLE')).toBe(false);
    expect(isRoleVisibleTo('BABU', 'p1', 'p1', 'DRAW', false)).toBe(false);
  });
  it('never leaks hidden roles before FINAL_REVEAL', () => {
    expect(isRoleVisibleTo('CHOR', 'p3', 'p1', 'SHUFFLE')).toBe(false);
    expect(isRoleVisibleTo('DAKAT', 'p4', 'p1', 'DRAW')).toBe(false);
    expect(isRoleVisibleTo('BABU', 'p1', 'p2', 'SHUFFLE')).toBe(false);
    expect(isRoleVisibleTo('BABU', 'p1', 'p2', 'DRAW')).toBe(false);
    expect(isRoleVisibleTo('BABU', 'p1', 'p2', 'HIDDEN_ROLES')).toBe(false);
    expect(isRoleVisibleTo('POLICE', 'p2', 'p1', 'SHUFFLE')).toBe(false);
    expect(isRoleVisibleTo('POLICE', 'p2', 'p1', 'HIDDEN_ROLES')).toBe(false);
  });
  it('reveals Babu at BABU_REVEAL and Police at POLICE_REVEAL', () => {
    expect(isRoleVisibleTo('BABU', 'p1', 'p2', 'BABU_REVEAL')).toBe(true);
    expect(isRoleVisibleTo('POLICE', 'p2', 'p1', 'POLICE_REVEAL')).toBe(true);
    expect(isRoleVisibleTo('POLICE', 'p2', 'p1', 'POLICE_GUESS')).toBe(true);
  });
  it('reveals everything at FINAL_REVEAL and later', () => {
    expect(isRoleVisibleTo('CHOR', 'p3', 'p1', 'FINAL_REVEAL')).toBe(true);
    expect(isRoleVisibleTo('DAKAT', 'p4', 'p1', 'ROUND_RESULT')).toBe(true);
    expect(isRoleVisibleTo('BABU', 'p1', 'p2', 'MATCH_END')).toBe(true);
  });
});

describe('mergeRoundHistory', () => {
  const serverRound: RoundHistory = {
    id: 'round-1',
    number: 1,
    shufflerId: 'p1',
    targetRole: 'CHOR',
    guessPlayerId: 'p3',
    guessCorrect: true,
    results: [
      { playerId: 'p1', role: 'BABU', points: 90 },
      { playerId: 'p2', role: 'POLICE', points: 80 },
      { playerId: 'p3', role: 'CHOR', points: 0 },
      { playerId: 'p4', role: 'DAKAT', points: 70 },
    ],
    finishedAt: '2026-10-24T12:00:00.000Z',
  };

  it('appends a round the client has not seen yet', () => {
    expect(mergeRoundHistory([], serverRound)).toEqual([serverRound]);
  });

  it('does not duplicate a round already present by id', () => {
    const merged = mergeRoundHistory([serverRound], {
      ...serverRound,
      finishedAt: '2026-10-24T12:01:00.000Z',
    });
    expect(merged).toHaveLength(1);
    expect(merged[0]?.finishedAt).toBe(serverRound.finishedAt);
  });

  it('does not duplicate a round with the same number but a different id', () => {
    const merged = mergeRoundHistory([serverRound], { ...serverRound, id: 'client-round' });
    expect(merged).toHaveLength(1);
  });
});

describe('totalScoresByPlayer', () => {
  it('aggregates points across rounds', () => {
    const totals = totalScoresByPlayer(HISTORY_CAUGHT as never);
    expect(totals.p1).toBe(170);
    expect(totals.p2).toBe(140);
    expect(totals.p3).toBe(70);
    expect(totals.p4).toBe(160);
  });

  it('returns an empty map with no history', () => {
    expect(totalScoresByPlayer([])).toEqual({});
  });
});

describe('computeFunStats', () => {
  it('derives superlatives from public results', () => {
    const stats = computeFunStats(
      PLAYERS.map((p) => ({ ...p })),
      HISTORY_CAUGHT as never,
    );
    expect(stats.bestDetectiveIds).toContain('p1');
    expect(stats.bestDetectiveIds).toContain('p2');
    expect(stats.mostBabuIds.length).toBeGreaterThan(0);
  });

  it('returns empty superlatives for an unfinished match', () => {
    const stats = computeFunStats(PLAYERS.map((p) => ({ ...p })), []);
    expect(stats.bestDetectiveIds).toEqual([]);
    expect(stats.mostBabuIds).toEqual([]);
    expect(stats.mostFooledIds).toEqual([]);
    expect(stats.comebackIds).toEqual([]);
    expect(stats.maxCatches).toBe(0);
    expect(stats.maxBabus).toBe(0);
    expect(stats.maxFooled).toBe(0);
    expect(stats.maxComeback).toBe(0);
  });
});
