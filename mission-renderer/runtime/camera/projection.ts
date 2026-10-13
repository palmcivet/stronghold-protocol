import type { PerspectiveCamera } from 'three';
import type { MissionCamera } from '#contract/view.js';

/** The official battle camera: pitched 30° from straight down with a 40° vertical field of view. */
export const MISSION_PROJECTION = Object.freeze({ fovY: 40, pitch: 30 });

export interface MissionProjectionOptions {
  /** Vertical field of view over the framed rectangle, in degrees. Defaults to 40. */
  readonly fovY?: number;
  /** Degrees the camera is pitched away from looking straight down, towards the low rows. Defaults to 30. */
  readonly pitch?: number;
}

/**
 * A perspective camera over the board, in board space (x = column, y = row, z = up; a tile's centre is on whole
 * numbers). It looks north, pitched `pitch` radians from straight down, through a pinhole at `eye`. Screen points are
 * canvas pixels of a board-sized canvas (`width` × `height`, y down); `cx`, `cy` is the principal point and `focal`
 * the focal length, both in those pixels.
 */
export interface MissionProjection {
  readonly eye: { readonly x: number; readonly y: number; readonly z: number };
  readonly pitch: number;
  readonly focal: number;
  readonly cx: number;
  readonly cy: number;
  readonly width: number;
  readonly height: number;
}

export interface MissionScreenPoint {
  readonly x: number;
  readonly y: number;
  /** Distance along the view direction, in tiles. */
  readonly depth: number;
}

const MIN_DEPTH = 0.05;
const DEG = Math.PI / 180;

function basis(pitch: number) {
  const s = Math.sin(pitch);
  const c = Math.cos(pitch);
  return {
    forward: { y: s, z: -c },
    up: { y: c, z: s },
  };
}

function offset(
  pitch: number,
  focal: number,
  dx: number,
  dy: number,
  dz: number,
): MissionScreenPoint | null {
  const { forward, up } = basis(pitch);
  const depth = dy * forward.y + dz * forward.z;
  if (!(depth > MIN_DEPTH)) {
    return null;
  }
  return {
    x: (focal * dx) / depth,
    y: (-focal * (dy * up.y + dz * up.z)) / depth,
    depth,
  };
}

/** Canvas pixel of a board point, or null when it is behind the camera. */
export function projectPoint(
  projection: MissionProjection,
  x: number,
  y: number,
  z: number,
): MissionScreenPoint | null {
  const eye = projection.eye;
  const raw = offset(
    projection.pitch,
    projection.focal,
    x - eye.x,
    y - eye.y,
    z - eye.z,
  );
  if (!raw) {
    return null;
  }
  return {
    x: projection.cx + raw.x,
    y: projection.cy + raw.y,
    depth: raw.depth,
  };
}

/** The board point at height `z` under a canvas pixel, or null when the ray never reaches that height. */
export function unprojectPoint(
  projection: MissionProjection,
  screenX: number,
  screenY: number,
  z: number,
): { readonly x: number; readonly y: number } | null {
  const { forward, up } = basis(projection.pitch);
  const a = (screenX - projection.cx) / projection.focal;
  const b = -(screenY - projection.cy) / projection.focal;
  const direction = {
    x: a,
    y: forward.y + b * up.y,
    z: forward.z + b * up.z,
  };
  if (Math.abs(direction.z) < 1e-12) {
    return null;
  }
  const along = (z - projection.eye.z) / direction.z;
  if (!(along > 0)) {
    return null;
  }
  return {
    x: projection.eye.x + direction.x * along,
    y: projection.eye.y + direction.y * along,
  };
}

/**
 * The perspective camera that frames a rectangle of the board into the part of a board-sized canvas the stage's 2D
 * transform shows: the camera's rectangle (or the whole map without one) fills that part as tightly as the field of
 * view allows and is centred in it. `tileSize` is canvas pixels per tile.
 */
export function frameProjection(
  cols: number,
  rows: number,
  camera: MissionCamera | null,
  tileSize: number,
  options: MissionProjectionOptions = {},
): MissionProjection | null {
  if (!(cols > 0) || !(rows > 0) || !(tileSize > 0)) {
    return null;
  }
  const pitch = (options.pitch ?? MISSION_PROJECTION.pitch) * DEG;
  const fovY = (options.fovY ?? MISSION_PROJECTION.fovY) * DEG;
  const rect = camera ?? { x: 0, y: 0, width: cols, height: rows };
  // the canvas part the 2D transform shows, in pixels from the canvas's top left
  const part = {
    x: rect.x * tileSize,
    y: (rows - rect.y - rect.height) * tileSize,
    width: rect.width * tileSize,
    height: rect.height * tileSize,
  };
  const focal = part.height / 2 / Math.tan(fovY / 2);
  const left = rect.x - 0.5;
  const right = rect.x + rect.width - 0.5;
  const near = rect.y - 0.5;
  const far = rect.y + rect.height - 0.5;
  const target = { x: (left + right) / 2, y: (near + far) / 2 };
  const corners = [
    [left, near],
    [right, near],
    [right, far],
    [left, far],
  ] as const;
  const extent = (distance: number) => {
    const eye = {
      x: target.x,
      y: target.y - distance * Math.sin(pitch),
      z: distance * Math.cos(pitch),
    };
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [x, y] of corners) {
      const point = offset(pitch, focal, x - eye.x, y - eye.y, -eye.z);
      if (!point) {
        return null;
      }
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    }
    return { eye, minX, maxX, minY, maxY };
  };
  const fits = (distance: number): boolean => {
    const box = extent(distance);
    return (
      box !== null &&
      box.maxX - box.minX <= part.width &&
      box.maxY - box.minY <= part.height
    );
  };
  let low = 0.5;
  let high = 1;
  while (!fits(high)) {
    high *= 2;
  }
  for (let step = 0; step < 60; step += 1) {
    const middle = (low + high) / 2;
    if (fits(middle)) {
      high = middle;
    } else {
      low = middle;
    }
  }
  const box = extent(high);
  if (!box) {
    return null;
  }
  return {
    eye: box.eye,
    pitch,
    focal,
    cx: part.x + part.width / 2 - (box.minX + box.maxX) / 2,
    cy: part.y + part.height / 2 - (box.minY + box.maxY) / 2,
    width: cols * tileSize,
    height: rows * tileSize,
  };
}

/**
 * Sets a Three perspective camera to project exactly like the projection: scene space is x = column, y = height,
 * z = −row, and the principal point is applied as a view offset.
 */
export function syncPerspectiveCamera(
  camera: PerspectiveCamera,
  projection: MissionProjection,
): void {
  const { eye, pitch, width, height } = projection;
  const { forward, up } = basis(pitch);
  camera.fov = (2 * Math.atan(height / 2 / projection.focal)) / DEG;
  camera.aspect = width / height;
  camera.near = 0.1;
  camera.far = 500;
  camera.position.set(eye.x, eye.z, -eye.y);
  camera.up.set(0, up.z, -up.y);
  camera.lookAt(eye.x, eye.z + forward.z, -(eye.y + forward.y));
  camera.setViewOffset(
    width,
    height,
    width / 2 - projection.cx,
    height / 2 - projection.cy,
    width,
    height,
  );
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
}
