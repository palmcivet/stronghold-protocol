import type {
  StreamEvent,
  StreamSnapshot,
  StreamUnitInfo,
} from '@alliance/compat-upstream';
import { GEO } from '@alliance/contract/match.js';
import type {
  FieldRect,
  PieceView,
  PrivateView,
} from '@alliance/contract/server-message.js';
import type {
  BattleEvent,
  BattleSnapshot,
  Direction,
  UnitKind,
  UnitSide,
  UnitSnapshot,
} from 'arknights-mission-core';
import type { MissionCamera } from 'arknights-mission-renderer';
import {
  clipMissionMapForPhase,
  groundAreasForPhase,
  missionMapForPhase,
  missionMapOf,
} from '#match/mission-map.js';

export {
  clipMissionMapForPhase,
  groundAreasForPhase,
  missionMapForPhase,
  missionMapOf,
};

/**
 * What the battlefield's 3D stage shows, built from what the backend sends: the stage's ground, the own board during
 * the preparation, and the streamed battle during combat. Master's field view does the same from the same frames.
 */

/** Room the camera leaves around the framed rows, in tiles. */
export const CAMERA_MARGIN = 0.3;

/** The prep camera frames the bench row up to the board's far row, master's own-board view. */
export const PREP_RECT: FieldRect = Object.freeze({
  r0: GEO.HAND_ROW,
  r1: GEO.FIELD.r1,
  c0: GEO.NORMAL_RECT.c0,
  c1: GEO.NORMAL_RECT.c1,
});

/** CSS px of HUD along each edge of the viewport that the framed rows keep clear of. */
export interface HudInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export const NO_INSETS: HudInsets = Object.freeze({
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
});

/**
 * A camera that frames `rect` in the part of the viewport the HUD leaves free. The viewport stays filled: the camera
 * grows past the rect on every side, so the ground runs on under the HUD as master's does.
 */
export function cameraFor(
  rect: FieldRect,
  viewport: { readonly width: number; readonly height: number },
  insets: HudInsets = NO_INSETS,
): MissionCamera {
  const cols = rect.c1 - rect.c0 + 1;
  const rows = rect.r1 - rect.r0 + 1;
  const width = Math.max(1, viewport.width);
  const height = Math.max(1, viewport.height);
  const freeWidth = Math.max(1, width - insets.left - insets.right);
  const freeHeight = Math.max(1, height - insets.top - insets.bottom);
  const tile = Math.min(
    freeWidth / (cols + CAMERA_MARGIN * 2),
    freeHeight / (rows + CAMERA_MARGIN * 2),
  );
  const cameraWidth = width / tile - CAMERA_MARGIN * 2;
  const cameraHeight = height / tile - CAMERA_MARGIN * 2;
  // the free box's centre against the viewport's, in tiles; screen down is towards row 0
  const dx = (insets.left + freeWidth / 2 - width / 2) / tile;
  const dy = (insets.top + freeHeight / 2 - height / 2) / tile;
  return {
    x: rect.c0 + cols / 2 - dx - cameraWidth / 2,
    y: rect.r0 + rows / 2 + dy - cameraHeight / 2,
    width: cameraWidth,
    height: cameraHeight,
    margin: CAMERA_MARGIN,
  };
}

interface UnitSeed {
  readonly id: string;
  readonly side: UnitSide;
  readonly kind: UnitKind;
  readonly x: number;
  readonly y: number;
  readonly hp: number;
  readonly maxHp: number;
  readonly facing: Direction;
}

function unitOf(seed: UnitSeed): UnitSnapshot {
  return {
    id: seed.id,
    side: seed.side,
    kind: seed.kind,
    x: seed.x,
    y: seed.y,
    facing: seed.facing,
    height: 0,
    attributes: { hp: seed.hp },
    maxHp: seed.maxHp,
    tags: [],
    attackRange: [],
    deployPositions: [],
    elements: {},
    blocking: [],
    blockedBy: null,
    skills: [],
    shield: 0,
    downed: seed.hp <= 0,
    redeploy: null,
    unbalanceUntil: null,
    components: {},
  };
}

/** The stage unit id of a piece of the own board or bench. */
export const pieceUnitId = (uid: number): string => `piece:${uid}`;

/** The piece uid of a stage unit id, or null when the unit is not a piece. */
export function pieceUidOf(unitId: string): number | null {
  const match = /^piece:(\d+)$/.exec(unitId);
  return match ? Number(match[1]) : null;
}

/** Chess / enemy catalog id of a stage unit, for spine appearances (prep `piece:`, local `op:` / `spawn:`). */
export function assetDefIdOf(
  unitId: string,
  pieces: ReadonlyMap<string, string>,
  streamDef: string | null | undefined = null,
): string | null {
  const pen = /^pen:([^:]+):/.exec(unitId);
  if (pen?.[1]) {
    return pen[1];
  }
  const spawn = /^spawn:\d+:(.+)$/.exec(unitId);
  if (spawn?.[1]) {
    return spawn[1];
  }
  const op = /^op:(\d+)$/.exec(unitId);
  if (op?.[1]) {
    return pieces.get(`piece:${op[1]}`) ?? null;
  }
  return pieces.get(unitId) ?? streamDef ?? null;
}

const pieceSeed = (piece: PieceView, x: number, y: number): UnitSeed => ({
  id: pieceUnitId(piece.uid),
  side: 'ally',
  kind: piece.kind === 'chess' ? 'operator' : 'token',
  x,
  y,
  hp: 1,
  maxHp: 1,
  facing: piece.dir ?? 'RIGHT',
});

function boardUnits(view: PrivateView): UnitSnapshot[] {
  return view.board.flatMap((piece) => {
    if (piece.row === undefined || piece.col === undefined) {
      return [];
    }
    if (
      piece.kind === 'chess' ||
      piece.kind === 'item' ||
      piece.kind === 'token'
    ) {
      return [unitOf(pieceSeed(piece, piece.col, piece.row))];
    }
    return [];
  });
}

function benchUnits(
  pieces: readonly (PieceView | null)[],
  row: number,
  c0: number,
): UnitSnapshot[] {
  return pieces.flatMap((piece, slot) =>
    piece &&
    (piece.kind === 'chess' || piece.kind === 'item' || piece.kind === 'token')
      ? [unitOf(pieceSeed(piece, c0 + slot, row))]
      : [],
  );
}

/** The own board, bench and temporary bench as master's prep view stands them: chess, loose items and tokens. */
export function prepSnapshotOf(
  view: PrivateView | null,
  tick = 0,
): BattleSnapshot {
  if (!view) {
    return { tick, units: [] };
  }
  return {
    tick,
    units: [
      ...boardUnits(view),
      ...benchUnits(view.hand, GEO.HAND_ROW, 0),
      ...benchUnits(view.temp, GEO.TEMP_ROW, GEO.TEMP_C0),
    ],
  };
}

/** The streamed battle: each unit where master's latest snapshot puts it, as its spawn info describes it. */
export function streamSnapshotFor(
  snapshot: StreamSnapshot | null,
  info: Readonly<Record<string, StreamUnitInfo>>,
  tick = 0,
): BattleSnapshot {
  if (!snapshot) {
    return { tick, units: [] };
  }
  return {
    tick,
    units: snapshot.units.map((unit) => {
      const known = info[unit.id];
      return unitOf({
        id: unit.id,
        side: known?.side ?? 'enemy',
        kind: known?.kind ?? 'enemy',
        x: unit.x,
        y: unit.y,
        hp: unit.hp,
        maxHp: unit.maxHp,
        facing: known?.facing ?? 'RIGHT',
      });
    }),
  };
}

/** The bench slot a hand-row or temp-row tile stands for, or null for any other tile. */
export function benchSlotAt(
  x: number,
  y: number,
): { readonly area: 'hand' | 'temp'; readonly idx: number } | null {
  if (y === GEO.HAND_ROW && x >= 0 && x < GEO.HAND_SIZE) {
    return { area: 'hand', idx: x };
  }
  const idx = x - GEO.TEMP_C0;
  if (y === GEO.TEMP_ROW && idx >= 0 && idx < GEO.TEMP_SIZE) {
    return { area: 'temp', idx };
  }
  return null;
}

/** Whether a tile is on the own deployable board. */
export function onBoard(x: number, y: number): boolean {
  const { r0, r1, c0, c1 } = GEO.FIELD;
  return y >= r0 && y <= r1 && x >= c0 && x <= c1;
}

/** A stream event as a mission-core battle event the stage's effect layer draws. */
export function battleEventOf(
  event: StreamEvent,
  tick = 0,
): BattleEvent | null {
  switch (event.kind) {
    case 'damage':
      return {
        tick,
        type: 'damaged',
        data: {
          sourceId: '',
          creditId: '',
          targetId: event.unitId,
          amount: event.amount,
          applied: event.amount,
          kind: event.damageKind,
          hp: 0,
          sourceless: true,
          ...(event.red ? { red: true as const } : {}),
        },
      };
    case 'heal':
      return {
        tick,
        type: 'heal',
        data: {
          unitId: event.unitId,
          sourceId: '',
          amount: event.amount,
          hp: 0,
        },
      };
    case 'death':
      return { tick, type: 'removed', data: { unitId: event.unitId } };
    case 'leak':
      return { tick, type: 'leak', data: { unitId: event.unitId } };
    case 'skill':
      return {
        tick,
        type: event.active ? 'skill-start' : 'skill-end',
        data: { unitId: event.unitId, skillId: '', reason: '' },
      };
    case 'fx':
      return {
        tick,
        type: 'cue',
        data: { kind: event.name, ...event.data },
      } as BattleEvent;
    case 'spawn':
      return null;
  }
}
