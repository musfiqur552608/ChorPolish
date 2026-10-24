import { describe, expect, it } from 'vitest';
import { GAME_CONFIG, pointsFor } from '@/config/game';

describe('game config', () => {
  it('defines one zero-based slot per seat', () => {
    expect([...GAME_CONFIG.slots]).toEqual([0, 1, 2, 3]);
    expect(GAME_CONFIG.slots.length).toBe(GAME_CONFIG.seats);
    expect(new Set(GAME_CONFIG.slots).size).toBe(GAME_CONFIG.seats);
  });

  it('always seats exactly four players', () => {
    expect(GAME_CONFIG.seats).toBe(4);
    expect(GAME_CONFIG.minPlayers).toBe(4);
    expect(GAME_CONFIG.maxPlayers).toBe(4);
  });

  it('keeps the classic point values', () => {
    expect(pointsFor('BABU')).toBe(90);
    expect(pointsFor('POLICE')).toBe(80);
    expect(pointsFor('CHOR')).toBe(60);
    expect(pointsFor('DAKAT')).toBe(70);
  });

  it('alternates the hunted role by round parity', () => {
    expect(GAME_CONFIG.targetByParity.odd).toBe('CHOR');
    expect(GAME_CONFIG.targetByParity.even).toBe('DAKAT');
  });

  it('keeps every timing positive', () => {
    for (const value of Object.values(GAME_CONFIG.phaseDurations)) {
      expect(value).toBeGreaterThan(0);
    }
    expect(GAME_CONFIG.drawSeconds).toBeGreaterThan(0);
    expect(GAME_CONFIG.graceSeconds).toBeGreaterThan(0);
    expect(GAME_CONFIG.abandonedCleanupSeconds).toBeGreaterThan(0);
    expect(GAME_CONFIG.inactiveRoomMinutes).toBeGreaterThan(0);
  });

  it('has unique avatars and reactions', () => {
    expect(new Set(GAME_CONFIG.avatars).size).toBe(GAME_CONFIG.avatars.length);
    expect(new Set(GAME_CONFIG.reactions).size).toBe(GAME_CONFIG.reactions.length);
  });

  it('offers presets inside the allowed round range', () => {
    for (const preset of GAME_CONFIG.roundPresets) {
      expect(preset).toBeGreaterThanOrEqual(GAME_CONFIG.minRounds);
      expect(preset).toBeLessThanOrEqual(GAME_CONFIG.maxRounds);
    }
  });
});
