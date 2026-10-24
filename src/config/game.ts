/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE RULE BOOK
 * Change point values and timings here. The matching server constants live at
 * the top of supabase/migrations/002_game_rpcs.sql — keep those in sync.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const GAME_CONFIG = {
  seats: 4,
  minPlayers: 4,
  maxPlayers: 4,
  /** Zero-based slip slots, matching round_roles.slot / pick_slip(). */
  slots: [0, 1, 2, 3] as const,
  minRounds: 1,
  maxRounds: 30,
  roundPresets: [4, 8, 12, 16] as const,
  recommendedMultiple: 4,

  points: {
    BABU: 90,
    POLICE: 80,
    CHOR: 60,
    DAKAT: 70,
  },

  /** Odd rounds: find the Chor. Even rounds: find the Dakat. */
  targetByParity: {
    odd: 'CHOR',
    even: 'DAKAT',
  },

  /** Seconds a player has to choose a slip before the server chooses for them. */
  drawSeconds: 40,
  /** Optional timer for the Police's accusation. */
  guessSeconds: 30,
  /** How long a disconnected player's seat is held mid-game. */
  graceSeconds: 90,
  /** Download window before an abandoned room is erased. */
  abandonedCleanupSeconds: 120,
  /** Safety net: any room untouched for this long is deleted by cron. */
  inactiveRoomMinutes: 30,

  reactionCooldownMs: 1500,
  reactions: ['😂', '😱', '👏'] as const,
  avatars: ['🕵️', '🥷', '🤴', '🦹', '🐯', '🦊', '🐼', '🐸', '🦉', '🐙'] as const,

  /** Milliseconds used to pace automatic phases. */
  phaseDurations: {
    SHUFFLE: 3200,
    HIDDEN_ROLES: 1800,
    BABU_REVEAL: 3400,
    POLICE_REVEAL: 3000,
    BABU_ORDER: 2600,
    POLICE_SUSPENSE: 1800,
    FINAL_REVEAL: 3800,
  },
} as const;

export type GameConfig = typeof GAME_CONFIG;
export type PointRole = keyof typeof GAME_CONFIG.points;

/** Server & client share these values; useful for display and tests. */
export function pointsFor(role: PointRole): number {
  return GAME_CONFIG.points[role];
}
