/** Side of a tile on the stage, in pixels before the viewport scale. */
export const TILE_SIZE = 64;

/** Height of a raised tile class, in tiles. */
export const TILE_HEIGHT = Object.freeze({
  wall: 0.42,
  forbid: 0.3,
  sep: 0.55,
  bench: 0.16,
  platform: 0.26,
});

export type TileHeightClass = keyof typeof TILE_HEIGHT;
