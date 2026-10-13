import type {
  BattleEvent,
  BattleSnapshot,
  TileCoord,
  TileSpec,
  UnitSnapshot,
} from 'arknights-mission-core';
import type { MissionAppearances } from '#contract/appearance.js';
import type {
  MissionStageCommand,
  MissionUpdateMode,
} from '#contract/command.js';
import type {
  MissionPointerEvent,
  MissionPointerHit,
  MissionPointerPhase,
} from '#contract/pointer.js';

export type {
  MissionStageCommand,
  MissionUpdateMode,
} from '#contract/command.js';
export type {
  MissionPointerEvent,
  MissionPointerHit,
  MissionPointerPhase,
} from '#contract/pointer.js';

/** A rectangle of tiles: `x`, `y` is the lowest column and row it covers. */
export interface MissionTileRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface MissionMap {
  readonly cols: number;
  readonly rows: number;
  readonly tiles: readonly TileSpec[];
  /** Where the enemy preview stands. The lane and pen hatches inside it are drawn as glass; without it none are. */
  readonly enemyPreview?: MissionTileRect;
}

export interface MissionCamera {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly margin: number;
}

export interface MissionView {
  readonly map: MissionMap | null;
  readonly camera: MissionCamera | null;
  readonly snapshot: BattleSnapshot | null;
  readonly units: readonly UnitSnapshot[];
  readonly events: readonly BattleEvent[];
  readonly highlightedTiles: readonly TileCoord[];
  readonly updateMode: MissionUpdateMode;
  /** Speed of the local render clock, kept across mode changes. */
  readonly speed: number;
  /** Appearances set so far, by unit id. */
  readonly appearances: MissionAppearances;
}

export interface MissionStage {
  readonly view: MissionView;
  readonly dispatch: (command: MissionStageCommand) => void;
  readonly update: (deltaSeconds: number) => void;
  readonly pick: (screenX: number, screenY: number) => MissionPointerHit;
  /** Picks under the pointer and hands the event to the stage's `onPointer`. */
  readonly pointer: (
    phase: MissionPointerPhase,
    screenX: number,
    screenY: number,
  ) => MissionPointerEvent;
  readonly resize: (width: number, height: number) => void;
  readonly destroy: () => void;
}
