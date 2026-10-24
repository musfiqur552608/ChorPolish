import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('scorecard privacy', () => {
  it('never passes the room code into the exported sheet', () => {
    const exportSource = read('src/features/scoresheet/ExportScoreSheet.tsx');
    const gameTableSource = read('src/features/room/GameTable.tsx');

    // ScoreSheet has an optional roomCode prop, but the export path and the
    // in-game score sheets must never supply it. (The avatar dialog may still
    // display the code; only the `roomCode=` prop matters here.)
    expect(exportSource).not.toMatch(/roomCode/);
    expect(gameTableSource).not.toMatch(/roomCode\s*=/);
  });

  it('keeps the room code only in the in-room ScoreSheet component', () => {
    const scoreSheetSource = read('src/features/scoresheet/ScoreSheet.tsx');
    expect(scoreSheetSource).toMatch(/roomCode\?:\s*string\s*\|\s*null/);
  });
});
