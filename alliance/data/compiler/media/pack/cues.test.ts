import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import {
  type CueTable,
  cueKeysOf,
  cueTableIssues,
  missingCueKeys,
} from '#schema/pack-app.js';

const DATA = join(import.meta.dirname, '..', '..', '..');
const json = (...path: string[]): unknown =>
  JSON.parse(readFileSync(join(DATA, ...path), 'utf8'));
const CUES = json(
  'compiler',
  'input',
  'season',
  'act2autochess',
  'cues.json',
) as CueTable;
const BASE = join(DATA, 'product', 'base', 'manifest.json');
const SEASON = join(
  DATA,
  'product',
  'season',
  'act2autochess',
  'manifest.json',
);

test('the act2autochess cue table has known roles and only audio keys', () => {
  expect(cueTableIssues(CUES)).toEqual([]);
  expect(Object.keys(CUES.bgm ?? {}).sort()).toEqual([
    'boss',
    'combat',
    'lobby',
    'prep',
    'unite',
  ]);
  expect(CUES.combat?.map((track) => track.rounds)).toEqual([
    { from: 1, to: 7 },
    { from: 8 },
  ]);
});

// The packs are compiled locally and not committed; the compiler refuses a cue key no pack publishes.
test.runIf(existsSync(BASE) && existsSync(SEASON))(
  'the compiled packs publish every key of the cue table',
  () => {
    const assets = (path: string): readonly string[] =>
      Object.keys(
        (JSON.parse(readFileSync(path, 'utf8')) as { assets: object }).assets,
      );
    const published = new Set([...assets(BASE), ...assets(SEASON)]);
    expect(missingCueKeys(CUES, (key) => published.has(key))).toEqual([]);
    expect(cueKeysOf(CUES).length).toBeGreaterThan(0);
  },
);
