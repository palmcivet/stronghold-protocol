import { describe, expect, it } from 'vitest';
import type { MissionMap } from '#contract/view.js';
import {
  type BoardTile,
  cellKey,
  classifyCells,
  glyphOf,
} from '#ground/cells.js';

const tile = { height: 0, deployable: true, walkableBy: ['ground'] };

function mapOf(tiles: readonly BoardTile[], cols: number): MissionMap {
  return { cols, rows: 1, tiles };
}

describe('terrain cells', () => {
  it('reads the glyph a tile carries, or infers one from its device and height', () => {
    expect(glyphOf({ x: 0, y: 0, ...tile, glyph: 'R' })).toBe('R');
    expect(glyphOf({ x: 0, y: 0, ...tile, device: 'barrier' })).toBe('X');
    expect(glyphOf({ x: 0, y: 0, ...tile, objective: true })).toBe('E');
    expect(glyphOf({ x: 0, y: 0, ...tile, height: 1 })).toBe('h');
    expect(
      glyphOf({ x: 0, y: 0, ...tile, deployable: false, walkableBy: [] }),
    ).toBe('#');
    expect(glyphOf({ x: 0, y: 0, ...tile })).toBe('r');
  });

  it('builds a non-content tile only when it touches content', () => {
    const cells = classifyCells(
      mapOf(
        [
          { x: 0, y: 0, ...tile, glyph: 'X' },
          { x: 1, y: 0, ...tile, glyph: 'X' },
          { x: 2, y: 0, ...tile, glyph: 'r' },
        ],
        3,
      ),
    );

    expect(cells.get(cellKey(0, 0))?.drawn).toBe(false);
    expect(cells.get(cellKey(1, 0))?.drawn).toBe(true);
    expect(cells.get(cellKey(2, 0))?.drawn).toBe(true);
  });

  it('raises a high-ground tile to the wall height and joins it to raised neighbours', () => {
    const cells = classifyCells(
      mapOf(
        [
          { x: 0, y: 0, ...tile, glyph: 'h' },
          { x: 1, y: 0, ...tile, glyph: 'h' },
        ],
        2,
      ),
    );

    expect(cells.get(cellKey(0, 0))?.height).toBe(0.42);
    expect(cells.get(cellKey(0, 0))?.surface).toBe('plateL');
    expect(cells.get(cellKey(1, 0))?.surface).toBe('plateR');
  });

  it('rotates and flips road slabs by the hash of (row, column), as master does', () => {
    // master layout.js: hash2(r, c) = ((r * 73856093) ^ (c * 19349663)) >>> 0
    const master = (row: number, col: number) =>
      (Math.imul(row, 73856093) ^ Math.imul(col, 19349663)) >>> 0;
    const tiles: BoardTile[] = [];
    for (let y = 0; y < 3; y += 1) {
      for (let x = 0; x < 4; x += 1) {
        tiles.push({ x, y, ...tile, glyph: 'r' });
      }
    }
    const cells = classifyCells({ cols: 4, rows: 3, tiles });
    for (const { x, y } of tiles) {
      const hash = master(y, x);
      expect([
        cells.get(cellKey(x, y))?.rot,
        cells.get(cellKey(x, y))?.flipX,
      ]).toEqual([(hash % 4) * 90, ((hash >> 3) & 1) === 1]);
    }
  });

  it('draws lane and pen hatches as glass only inside the enemy preview rectangle', () => {
    const tiles: BoardTile[] = [
      { x: 0, y: 0, ...tile, glyph: 'p' },
      { x: 1, y: 0, ...tile, glyph: 'f' },
      { x: 2, y: 0, ...tile, glyph: 'p' },
      { x: 3, y: 0, ...tile, glyph: 'r' },
    ];
    const inPen = classifyCells({
      cols: 4,
      rows: 1,
      tiles,
      enemyPreview: { x: 1, y: 0, width: 3, height: 1 },
    });
    expect(tiles.map(({ x }) => inPen.get(cellKey(x, 0))?.glass)).toEqual([
      false,
      true,
      true,
      false,
    ]);
    const none = classifyCells(mapOf(tiles, 4));
    expect(tiles.map(({ x }) => none.get(cellKey(x, 0))?.glass)).toEqual([
      false,
      false,
      false,
      false,
    ]);
  });
});
