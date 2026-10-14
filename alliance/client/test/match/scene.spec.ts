import { PHASE } from '@alliance/contract/match.js';
import { MISSION_GROUND_AREAS } from 'arknights-mission-renderer';
import { describe, expect, it } from 'vitest';
import { MODEL_SCALE, modelScaleOf } from '#match/field/actors.js';
import {
  assetDefIdOf,
  battleEventOf,
  cameraFor,
  clipMissionMapForPhase,
  groundAreasForPhase,
  missionMapOf,
  PREP_RECT,
  pieceUidOf,
  pieceUnitId,
  prepSnapshotOf,
} from '#match/field/scene.js';

describe('field scene', () => {
  it('maps a stage board to the renderer map and frames the prep camera over the HUD-free area', () => {
    const map = missionMapOf({
      cols: 11,
      rows: 8,
      tiles: [
        {
          x: 0,
          y: 0,
          glyph: '.',
          height: 0,
          deployable: true,
          walkableBy: ['ground'],
          objective: false,
        },
        {
          x: 1,
          y: 0,
          glyph: 'H',
          height: 1,
          deployable: false,
          walkableBy: ['ground', 'fly'],
          objective: true,
        },
      ],
    });
    expect(map.cols).toBe(11);
    expect(map.tiles).toHaveLength(2);
    expect(map.tiles[1]?.objective).toBe(true);
    const camera = cameraFor(
      PREP_RECT,
      { width: 1280, height: 720 },
      {
        top: 64,
        right: 0,
        bottom: 160,
        left: 200,
      },
    );
    expect(camera.width).toBeGreaterThan(PREP_RECT.c1 - PREP_RECT.c0);
    expect(camera.height).toBeGreaterThan(PREP_RECT.r1 - PREP_RECT.r0);
  });

  it('resolves prep piece, local op and spawn unit ids to catalog defs for appearances', () => {
    const pieces = new Map([[pieceUnitId(7), 'chess_texas']]);
    expect(assetDefIdOf('piece:7', pieces)).toBe('chess_texas');
    expect(assetDefIdOf('op:7', pieces)).toBe('chess_texas');
    expect(assetDefIdOf('spawn:0:enemy_slug', pieces)).toBe('enemy_slug');
    expect(assetDefIdOf('pen:enemy_boss:2', pieces)).toBe('enemy_boss');
    expect(assetDefIdOf('op:9', pieces, 'streamed')).toBeNull();
    expect(assetDefIdOf('unknown', pieces, 'from-stream')).toBe('from-stream');
  });

  it('keeps piece ids reversible and turns stream hits into battle events the effect layer draws', () => {
    expect(pieceUnitId(12)).toBe('piece:12');
    expect(pieceUidOf('piece:12')).toBe(12);
    expect(pieceUidOf('7')).toBeNull();
    expect(
      battleEventOf({
        kind: 'spawn',
        unit: {
          id: '1',
          name: 'a',
          side: 'enemy',
          kind: 'enemy',
          defId: null,
          facing: 'RIGHT',
        },
      }),
    ).toBeNull();
    expect(
      battleEventOf({
        kind: 'damage',
        unitId: '7',
        amount: 40,
        damageKind: 'arts',
        red: true,
      }),
    ).toMatchObject({
      type: 'damaged',
      data: { targetId: '7', applied: 40, kind: 'arts', red: true },
    });
    expect(
      battleEventOf({ kind: 'heal', unitId: '3', amount: 12 }),
    ).toMatchObject({
      type: 'heal',
      data: { unitId: '3', amount: 12 },
    });
    expect(battleEventOf({ kind: 'death', unitId: '7' })).toMatchObject({
      type: 'removed',
      data: { unitId: '7' },
    });
    expect(
      battleEventOf({
        kind: 'fx',
        name: 'blast',
        x: 1,
        y: 2,
        data: { x: 1, y: 2, r: 2 },
      }),
    ).toMatchObject({
      type: 'cue',
      data: { kind: 'blast', x: 1, y: 2, r: 2 },
    });
    expect(
      battleEventOf({ kind: 'skill', unitId: '3', active: true }),
    ).toMatchObject({
      type: 'skill-start',
      data: { unitId: '3' },
    });
  });

  it('scales enemies by the catalog modelScale over the operator baseline', () => {
    expect(MODEL_SCALE).toBeGreaterThan(0);
    expect(modelScaleOf(1)).toEqual({ scale: MODEL_SCALE, scaleY: 1 });
    expect(modelScaleOf(0.5, 1.263)).toEqual({
      scale: MODEL_SCALE * 0.5,
      scaleY: 1.263,
    });
    expect(modelScaleOf(undefined)).toEqual({ scale: MODEL_SCALE, scaleY: 1 });
  });

  it('puts loose items on the prep snapshot so the stage can pick them', () => {
    const snap = prepSnapshotOf({
      board: [
        { uid: 1, kind: 'chess', id: 'c', row: 10, col: 4 },
        { uid: 2, kind: 'item', id: 'item_a', row: 10, col: 5 },
      ],
      hand: [{ uid: 3, kind: 'item', id: 'item_b' }, null],
      temp: [],
    } as never);
    expect(snap.units.map((unit) => unit.id).sort()).toEqual([
      'piece:1',
      'piece:2',
      'piece:3',
    ]);
    expect(snap.units.find((unit) => unit.id === 'piece:2')?.kind).toBe(
      'token',
    );
  });
});

describe('ground areas by phase', () => {
  it('keeps prep/normal on the own half field; 联防 joins both; pen only with the pen camera; boss uses the assault field', () => {
    const normalField = groundAreasForPhase(PHASE.PREP);
    expect(normalField).toHaveLength(1);
    expect(normalField[0]).toEqual({ x: 0, y: 6, width: 11, height: 8 });
    expect(groundAreasForPhase(PHASE.COMBAT)).toEqual(normalField);
    expect(groundAreasForPhase(PHASE.PREP, { pen: true })).toBe(
      MISSION_GROUND_AREAS.normal,
    );
    const uniteField = groundAreasForPhase(PHASE.UNITE);
    expect(uniteField).toHaveLength(1);
    expect(uniteField[0]).toEqual({ x: 0, y: 6, width: 21, height: 8 });
    expect(groundAreasForPhase(PHASE.UNITE, { pen: true })).toBe(
      MISSION_GROUND_AREAS.unite,
    );
    expect(groundAreasForPhase(PHASE.FINAL_ASSAULT)).toBe(
      MISSION_GROUND_AREAS.boss,
    );
  });

  it('clips the full stage so neighbor cols are gone outside 联防, and the pen is optional', () => {
    const tiles = [];
    for (let y = 0; y < 19; y += 1) {
      for (let x = 0; x < 21; x += 1) {
        tiles.push({
          x,
          y,
          glyph: '.',
          height: 0,
          deployable: false,
          walkableBy: [],
          objective: false,
        });
      }
    }
    const full = { cols: 21, rows: 19, tiles };
    const prep = clipMissionMapForPhase(full, PHASE.PREP);
    expect(Math.max(...prep.tiles.map((tile) => tile.x))).toBeLessThanOrEqual(
      10,
    );
    expect(prep.tiles.some((tile) => tile.y >= 14)).toBe(false);
    expect(prep.tiles.some((tile) => tile.x === 15 && tile.y === 10)).toBe(
      false,
    );
    const prepPen = clipMissionMapForPhase(full, PHASE.PREP, { pen: true });
    expect(
      Math.max(...prepPen.tiles.map((tile) => tile.x)),
    ).toBeLessThanOrEqual(14);
    expect(prepPen.tiles.some((tile) => tile.y >= 14)).toBe(true);
    const unite = clipMissionMapForPhase(full, PHASE.UNITE);
    expect(unite.tiles.some((tile) => tile.x === 15 && tile.y === 10)).toBe(
      true,
    );
    expect(unite.tiles.some((tile) => tile.y >= 14)).toBe(false);
  });
});
