import type { EnemyPreview } from '@alliance/contract/server-message.js';
import { describe, expect, it } from 'vitest';
import {
  layoutPen,
  MAX_PREVIEW,
  PEN_MAX,
  penEntries,
  penSignature,
  penZones,
  thinPreview,
} from '#match/field/pen.js';

const E = (
  enemyKey: string,
  count: number,
  gate: 'lower' | 'upper' = 'lower',
  t = 1,
): EnemyPreview => ({ enemyKey, count, gate, t });

describe('layoutPen (master port)', () => {
  it('defaults match official zones', () => {
    const z = penZones();
    expect(z.lower.tiles.length).toBeGreaterThan(0);
    expect(z.upper.tiles.length).toBeGreaterThan(0);
    expect(penZones(null).lower.tiles).toEqual(z.lower.tiles);
  });

  it('places figures inside pen tiles with stable signature', () => {
    const list = [E('n', 6, 'lower', 1), E('u', 4, 'upper', 2)];
    const a = layoutPen(list);
    const b = layoutPen(JSON.parse(JSON.stringify(list)) as EnemyPreview[]);
    expect(a.length).toBeGreaterThan(0);
    expect(a.map((f) => `${f.enemyKey}:${f.x},${f.y}`)).toEqual(
      b.map((f) => `${f.enemyKey}:${f.x},${f.y}`),
    );
    expect(penSignature(list)).toBe(penSignature(list));
  });

  it('thins oversized waves to MAX_PREVIEW', () => {
    expect(PEN_MAX).toBe(MAX_PREVIEW);
    const figures = layoutPen([E('a', 1e9, 'lower', 1)]);
    expect(figures.length).toBeLessThanOrEqual(MAX_PREVIEW);
    const tiny = thinPreview(
      penEntries([E('a', 200, 'lower', 1), E('b', 1, 'lower', 2)]),
    );
    expect(tiny.reduce((n, e) => n + e.n, 0)).toBeLessThanOrEqual(MAX_PREVIEW);
  });

  it('ignores junk entries', () => {
    expect(layoutPen([])).toEqual([]);
  });
});
