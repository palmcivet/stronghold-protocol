import type { StageMap } from '@alliance/compat-upstream';
import { PHASE, type Phase } from '@alliance/contract/match.js';
import type { MissionMap } from 'arknights-mission-renderer';
import {
  clipMapToAreas,
  MISSION_GROUND_AREAS,
  type MissionTileRect,
} from 'arknights-mission-renderer';

/** The renderer's map of a stage board. Every tile keeps master's glyph, so the ground builds master's board classes. */
export function missionMapOf(stage: StageMap): MissionMap {
  return {
    cols: stage.cols,
    rows: stage.rows,
    tiles: stage.tiles.map((tile) => ({
      x: tile.x,
      y: tile.y,
      glyph: tile.glyph,
      height: tile.height,
      deployable: tile.deployable,
      walkableBy: tile.walkableBy,
      objective: tile.objective,
    })),
  };
}

/**
 * Master's `boardArea`: prep / battle / 联防 build the field alone (separator rows 6–13). The enemy preview pen
 * (rows 14–18) is only built for the pen camera. `MISSION_GROUND_AREAS.normal` / `.unite` keep the pen block for that
 * camera; field-only slices drop it so neighbor halves never stitch in normal play.
 */
function fieldOnly(
  areas: readonly MissionTileRect[],
): readonly MissionTileRect[] {
  return areas.filter((area) => area.y + area.height - 1 <= 13);
}

const NORMAL_FIELD = Object.freeze(fieldOnly(MISSION_GROUND_AREAS.normal));
const UNITE_FIELD = Object.freeze(fieldOnly(MISSION_GROUND_AREAS.unite));

export interface GroundAreaOptions {
  /** When true, include the enemy preview pen (master's pen camera). */
  readonly pen?: boolean;
}

/**
 * Which parts of the official board to build, as master `boardArea` / `areaFor`:
 * - prep / normal combat: own half only (fields stay separate; not stitched)
 * - pen camera: own half + preview pen
 * - 联防 (`UNITE`): both halves joined (pen only with the pen camera)
 * - Final Assault / Hidden Core: boss field
 */
export function groundAreasForPhase(
  phase: Phase | string | null | undefined,
  options: GroundAreaOptions = {},
): readonly MissionTileRect[] {
  const withPen = options.pen === true;
  if (phase === PHASE.UNITE) {
    return withPen ? MISSION_GROUND_AREAS.unite : UNITE_FIELD;
  }
  if (phase === PHASE.FINAL_ASSAULT || phase === PHASE.HIDDEN_CORE) {
    return MISSION_GROUND_AREAS.boss;
  }
  return withPen ? MISSION_GROUND_AREAS.normal : NORMAL_FIELD;
}

/** Stage map clipped to the phase's ground area so neighbor boards are not stitched in normal play. */
export function missionMapForPhase(
  stage: StageMap,
  phase: Phase | string | null | undefined,
  options: GroundAreaOptions = {},
): MissionMap {
  return clipMapToAreas(
    missionMapOf(stage),
    groundAreasForPhase(phase, options),
  );
}

/** Clip an already-built MissionMap the same way. */
export function clipMissionMapForPhase(
  map: MissionMap,
  phase: Phase | string | null | undefined,
  options: GroundAreaOptions = {},
): MissionMap {
  return clipMapToAreas(map, groundAreasForPhase(phase, options));
}
