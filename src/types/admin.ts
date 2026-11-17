import type { NoticeTone } from './site';

export interface AdminSession {
  userId: string;
  email: string | null;
  displayName: string;
  createdAt: string;
}

export interface AdminPeriodStats {
  players: number;
  newPlayers: number;
  matches: number;
  rounds: number;
  playerSeconds: number;
  tableSeconds: number;
  avgMatchSeconds: number;
}

export interface AdminPeriodComparison {
  players: number;
  playerSeconds: number;
  matches: number;
}

export interface AdminPeriod extends AdminPeriodStats {
  previous: AdminPeriodStats;
  comparison: AdminPeriodComparison;
}

export type AdminPeriodKey = 'today' | 'week' | 'month' | 'year';

export interface AdminDailyPoint {
  date: string;
  players: number;
  newPlayers: number;
  matches: number;
  playerSeconds: number;
  tableSeconds: number;
}

export interface AdminMonthlyPoint {
  month: string;
  players: number;
  newPlayers: number;
  matches: number;
  playerSeconds: number;
  tableSeconds: number;
}

export interface AdminLiveRoom {
  id: string;
  code: string;
  status: 'lobby' | 'playing';
  phase: string | null;
  currentRound: number;
  totalRounds: number;
  humanPlayers: number;
  onlinePlayers: number;
  bots: number;
  createdAt: string;
  startedAt: string | null;
  elapsedSeconds: number;
}

export interface AdminLiveStats {
  rooms: number;
  lobbyRooms: number;
  playingRooms: number;
  activeMatches: number;
  onlineHumans: number;
  seatedHumans: number;
  bots: number;
}

export interface AdminOverview {
  generatedAt: string;
  timezone: string;
  analyticsSince: string | null;
  live: AdminLiveStats;
  periods: Record<AdminPeriodKey, AdminPeriod>;
  series: AdminDailyPoint[];
  monthly: AdminMonthlyPoint[];
  liveRooms: AdminLiveRoom[];
}

export interface AdminNotice {
  id: string;
  titleEn: string;
  titleBn: string;
  bodyEn: string;
  bodyBn: string;
  tone: NoticeTone;
  linkUrl: string | null;
  linkLabelEn: string | null;
  linkLabelBn: string | null;
  isActive: boolean;
  isDismissible: boolean;
  isLive: boolean;
  startsAt: string;
  endsAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminNoticeDraft {
  id: string | null;
  titleEn: string;
  titleBn: string;
  bodyEn: string;
  bodyBn: string;
  tone: NoticeTone;
  linkUrl: string;
  linkLabelEn: string;
  linkLabelBn: string;
  isActive: boolean;
  isDismissible: boolean;
  startsAt: string;
  endsAt: string;
}

export interface AdminSeo {
  title: string;
  description: string;
  keywords: string;
  canonicalUrl: string;
  ogImageUrl: string;
  twitterHandle: string;
  noindex: boolean;
  updatedAt: string;
}
