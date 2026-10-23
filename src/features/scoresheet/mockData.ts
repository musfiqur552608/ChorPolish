import type { Role, RoundHistory } from '@/types';
import type { SheetPlayer } from './ScoreSheet';

const playerA = 'player-rafi';
const playerB = 'player-nabila';
const playerC = 'player-tanvir';
const playerD = 'player-mira';

const results = (
  rafi: [Role, number],
  nabila: [Role, number],
  tanvir: [Role, number],
  mira: [Role, number],
) => [
  { playerId: playerA, role: rafi[0], points: rafi[1] },
  { playerId: playerB, role: nabila[0], points: nabila[1] },
  { playerId: playerC, role: tanvir[0], points: tanvir[1] },
  { playerId: playerD, role: mira[0], points: mira[1] },
];

export const mockPlayers: SheetPlayer[] = [
  {
    id: playerA,
    name: 'রাফি',
    avatar: '🦊',
    totalScore: 160,
    babuCount: 1,
    isMe: true,
    isHost: true,
  },
  { id: playerB, name: 'নাবিলা', avatar: '🐼', totalScore: 300, babuCount: 1 },
  { id: playerC, name: 'তানভীর', avatar: '🐯', totalScore: 150, babuCount: 1 },
  { id: playerD, name: 'মীরা', avatar: '🦉', totalScore: 310, babuCount: 1 },
];

export const mockHistory: RoundHistory[] = [
  {
    id: 'mock-round-1',
    number: 1,
    shufflerId: playerA,
    targetRole: 'CHOR',
    guessPlayerId: playerC,
    guessCorrect: true,
    results: results(['BABU', 90], ['POLICE', 80], ['CHOR', 0], ['DAKAT', 70]),
    finishedAt: '2026-10-12T18:01:00.000Z',
  },
  {
    id: 'mock-round-2',
    number: 2,
    shufflerId: playerB,
    targetRole: 'DAKAT',
    guessPlayerId: playerC,
    guessCorrect: false,
    results: results(['POLICE', 0], ['BABU', 90], ['CHOR', 60], ['DAKAT', 70]),
    finishedAt: '2026-10-12T18:03:00.000Z',
  },
  {
    id: 'mock-round-3',
    number: 3,
    shufflerId: playerC,
    targetRole: 'CHOR',
    guessPlayerId: playerA,
    guessCorrect: true,
    results: results(['CHOR', 0], ['DAKAT', 70], ['BABU', 90], ['POLICE', 80]),
    finishedAt: '2026-10-12T18:05:00.000Z',
  },
  {
    id: 'mock-round-4',
    number: 4,
    shufflerId: playerD,
    targetRole: 'DAKAT',
    guessPlayerId: playerB,
    guessCorrect: false,
    results: results(['DAKAT', 70], ['CHOR', 60], ['POLICE', 0], ['BABU', 90]),
    finishedAt: '2026-10-12T18:07:00.000Z',
  },
];

export const mockPlayersBn = mockPlayers;
