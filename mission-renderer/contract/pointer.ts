export type MissionPointerHit =
  | { readonly type: 'unit'; readonly unitId: string }
  | { readonly type: 'tile'; readonly x: number; readonly y: number }
  | { readonly type: 'empty' };

export type MissionPointerPhase = 'down' | 'move' | 'up';

/** A pointer press, move or release over the stage, with what lies under it. Coordinates are relative to the viewport. */
export interface MissionPointerEvent {
  readonly phase: MissionPointerPhase;
  readonly screenX: number;
  readonly screenY: number;
  readonly hit: MissionPointerHit;
}
