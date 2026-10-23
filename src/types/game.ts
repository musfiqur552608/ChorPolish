export const ROLES = ['BABU', 'POLICE', 'CHOR', 'DAKAT'] as const;
export type Role = (typeof ROLES)[number];

export const PHASES = [
  'SHUFFLE',
  'DRAW',
  'HIDDEN_ROLES',
  'BABU_REVEAL',
  'POLICE_REVEAL',
  'BABU_ORDER',
  'POLICE_GUESS',
  'FINAL_REVEAL',
  'ROUND_RESULT',
  'MATCH_END',
] as const;
export type Phase = (typeof PHASES)[number];

export type RoomStatus = 'lobby' | 'playing' | 'finished';
export type FinishedReason = 'completed' | 'abandoned' | 'left' | null;
export type TargetRole = 'CHOR' | 'DAKAT';

export interface RoomSummary {
  id: string;
  code: string;
  status: RoomStatus;
  totalRounds: number;
  currentRound: number;
  phase: Phase | null;
  hostPlayerId: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  finishedReason: FinishedReason;
  cleanupAt: string | null;
  pausedAt: string | null;
  serverNow: string;
}

export interface PlayerPublic {
  id: string;
  name: string;
  avatar: string;
  seat: number;
  isHost: boolean;
  isReady: boolean;
  isOnline: boolean;
  totalScore: number;
  babuCount: number;
  finalRank: number | null;
  disconnectedAt: string | null;
  lastSeenAt: string;
}

export interface MeInfo {
  id: string;
  isHost: boolean;
  role: Role | null;
}

export interface RoundResultRow {
  playerId: string;
  role: Role;
  points: number;
}

export interface RoundLive {
  id: string;
  number: number;
  shufflerId: string;
  targetRole: TargetRole;
  phase: Phase;
  activePickerId: string | null;
  phaseStartedAt: string;
  phaseDeadline: string | null;
  pickedPlayerIds: string[];
  availableSlots: number[];
  drawOrder: string[];
  guessPlayerId: string | null;
  guessCorrect: boolean | null;
  publicRoles: Partial<Record<string, Role>>;
  results: RoundResultRow[];
}

export interface RoundHistory {
  id: string;
  number: number;
  shufflerId: string;
  targetRole: TargetRole;
  guessPlayerId: string | null;
  guessCorrect: boolean | null;
  results: RoundResultRow[];
  finishedAt: string;
}

export interface Reaction {
  id: string;
  playerId: string;
  emoji: string;
  createdAt: string;
}

export interface RoomState {
  serverNow: string;
  room: RoomSummary;
  me: MeInfo;
  players: PlayerPublic[];
  round: RoundLive | null;
  history: RoundHistory[];
  reactions: Reaction[];
  version: number;
}

export interface PeekRoom {
  exists: boolean;
  code: string;
  status: RoomStatus | null;
  playerCount: number;
  totalRounds: number | null;
  isMember: boolean;
  seatsOpen: number;
}

export type GameAction =
  | 'ready'
  | 'start'
  | 'set_rounds'
  | 'pick_slip'
  | 'guess'
  | 'advance'
  | 'react'
  | 'leave'
  | 'change_avatar';

export interface ApiErrorShape {
  code: string;
  message: string;
}

export interface RankingEntry {
  playerId: string;
  totalScore: number;
  babuCount: number;
  rank: number;
}
