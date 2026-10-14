import type { AssetKey } from 'arknights-assets-catalog';
import type {
  MISSION_GROUND_MESH_SLOTS,
  MissionGroundImageSlot,
  MissionGroundOptions,
  MissionGroundPack,
} from 'arknights-mission-renderer';
import { CanvasTexture, SRGBColorSpace, Texture } from 'three';

/**
 * Official board pack keys (master's `board3d/load.js` PACK_IMAGES / PACK_MESHES), and a painted diffuse stand-in when
 * the season's `map/autochess` textures are not in the resource store yet.
 */

/** Painted stand-in diffuse used when the official atlas is missing. */
const STAND_IN_DIFFUSE: AssetKey = 'image:alliance/ground/diffuse';

/** Official texture key of each ground image slot. */
export const OFFICIAL_GROUND_IMAGES: Readonly<
  Record<MissionGroundImageSlot, AssetKey>
> = Object.freeze({
  diffuse: 'texture:map/autochess/TX_autochessi_D',
  normal: 'texture:map/autochess/TX_autochessi_N_rgb',
  roughness: 'texture:map/autochess/TX_autochessi_M_rough',
  emissive: 'texture:map/autochess/TX_autochessi_E',
  common: 'texture:map/autochess/TX_autochessi_common_D',
  commonEmissive: 'texture:map/autochess/TX_autochessi_common_E',
  background: 'texture:map/autochess/TX_autochessi_BG',
  wind: 'texture:map/common/TX_wind_device',
  gate: 'texture:map/fx/[opt]merged_textures',
  waterNormal: 'texture:map/water/[ucp]TX_water_normal',
  caustics: 'texture:map/water/TX_Caustics256',
  noise: 'texture:map/water/T_noise_clouds_01',
});

/** Official mesh keys of each prop slot (master's pack mesh names). */
type TerrainMeshSlot = (typeof MISSION_GROUND_MESH_SLOTS)[number];

export const OFFICIAL_GROUND_MESHES: Readonly<
  Record<TerrainMeshSlot, AssetKey>
> = Object.freeze({
  crate: 'model:mesh/s_common_box_01/pCube2',
  blower: 'model:mesh/s_wind_device/S_wild_wind_device',
  bgPlane: 'model:mesh/s_background_common/pPlane1',
});

/** Prefab table master resolves gate pieces through. */
export const OFFICIAL_GATE_PREFAB: AssetKey = 'json:map/fx/prefab';

/** Board tiles / UV table of the theme. */
export const OFFICIAL_BOARD_TILES: AssetKey = 'json:board/autochess/tiles';

/**
 * Stand-in atlas size. Matches the official diffuse UV space (`TERRAIN_ATLAS_SOURCES.D` = 2048) so
 * `surfaceUV` samples the painted regions correctly. A smaller canvas mis-aligns bevels against the mesh.
 */
const ATLAS = 2048;

type RegionKind =
  | 'plate'
  | 'concrete'
  | 'stripe'
  | 'panel'
  | 'side'
  | 'crate'
  | 'pad'
  | 'hatch';

type Region = readonly [
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  kind: RegionKind,
];

/** Regions of the official diffuse atlas (`tiles.json` `board3d`) with a base colour and paint recipe. */
const REGIONS: readonly Region[] = [
  [0, 0, 256, 256, '#6a7380', 'plate'],
  [256, 0, 256, 256, '#636b78', 'plate'],
  [512, 0, 256, 256, '#6a7380', 'plate'],
  [768, 0, 256, 256, '#5c6470', 'plate'],
  [0, 256, 256, 256, '#4a515a', 'concrete'],
  [256, 256, 256, 256, '#4e555f', 'concrete'],
  [0, 512, 256, 256, '#4a515a', 'concrete'],
  [256, 512, 256, 256, '#525964', 'concrete'],
  [512, 256, 256, 256, '#5a5538', 'stripe'],
  [768, 256, 256, 256, '#4e5156', 'stripe'],
  [768, 512, 256, 256, '#6a3c3c', 'stripe'],
  [549, 1787, 255, 256, '#2f5160', 'hatch'],
  [804, 1790, 234, 234, '#3a5866', 'hatch'],
  [1290, 1400, 190, 190, '#3a5866', 'hatch'],
  [1036, 480, 404, 216, '#3a414a', 'panel'],
  [1088, 708, 356, 310, '#3d454e', 'panel'],
  [12, 776, 196, 196, '#5a646e', 'panel'],
  [0, 1024, 512, 512, '#2f5a55', 'pad'],
  [512, 1024, 512, 512, '#2f4e5a', 'pad'],
  [0, 1664, 272, 384, '#9a8250', 'side'],
  [272, 1664, 272, 384, '#6a727c', 'side'],
  [0, 1538, 512, 98, '#2a3038', 'panel'],
  [0, 768, 512, 208, '#344438', 'panel'],
  [512, 768, 256, 208, '#4a3535', 'panel'],
  [544, 1540, 480, 244, '#323840', 'panel'],
  [1087, 1938, 134, 108, '#7a5e3c', 'crate'],
  [1222, 1938, 134, 108, '#8a6c44', 'crate'],
];

function shade(hex: string, amount: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const channel = (shift: number): number => {
    const base = (value >> shift) & 0xff;
    return Math.max(0, Math.min(255, Math.round(base + amount * 255)));
  };
  const r = channel(16);
  const g = channel(8);
  const b = channel(0);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/** Deterministic 0..1 hash noise from integer coords (painted atlas must be stable across runs). */
function noise2(x: number, y: number, salt = 0): number {
  let n = (x * 374761393 + y * 668265263 + salt * 982451653) | 0;
  n = (n ^ (n >>> 13)) * 1274126177;
  n = n ^ (n >>> 16);
  return (n >>> 0) / 4294967296;
}

function paintRegion(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  kind: RegionKind,
): void {
  context.save();
  context.beginPath();
  context.rect(x, y, w, h);
  context.clip();
  const gradient = context.createLinearGradient(x, y, x + w, y + h);
  gradient.addColorStop(0, shade(fill, 0.08));
  gradient.addColorStop(0.45, fill);
  gradient.addColorStop(1, shade(fill, -0.1));
  context.fillStyle = gradient;
  context.fillRect(x, y, w, h);

  // fine grain (deterministic)
  context.globalAlpha = 0.12;
  const grains = Math.max(24, Math.floor((w * h) / 1800));
  for (let i = 0; i < grains; i += 1) {
    const px = x + noise2(x + i, y, 1) * w;
    const py = y + noise2(x, y + i, 2) * h;
    context.fillStyle = noise2(i, x + y, 3) > 0.5 ? '#ffffff' : '#000000';
    context.fillRect(px, py, 1 + noise2(i, y, 4) * 2, 1 + noise2(x, i, 5) * 2);
  }
  context.globalAlpha = 1;

  const inset = Math.max(2, Math.min(w, h) * 0.04);
  if (kind === 'concrete' || kind === 'pad' || kind === 'stripe') {
    context.strokeStyle = 'rgba(255,255,255,0.08)';
    context.lineWidth = 1;
    const step = Math.max(8, Math.min(w, h) / 8);
    for (let gx = x; gx < x + w; gx += step) {
      context.beginPath();
      context.moveTo(gx, y);
      context.lineTo(gx, y + h);
      context.stroke();
    }
    for (let gy = y; gy < y + h; gy += step) {
      context.beginPath();
      context.moveTo(x, gy);
      context.lineTo(x + w, gy);
      context.stroke();
    }
  }

  if (kind === 'plate' || kind === 'crate' || kind === 'panel') {
    context.strokeStyle = 'rgba(255,255,255,0.18)';
    context.lineWidth = Math.max(2, inset);
    context.strokeRect(x + inset, y + inset, w - inset * 2, h - inset * 2);
    context.strokeStyle = 'rgba(0,0,0,0.35)';
    context.strokeRect(
      x + inset * 1.6,
      y + inset * 1.6,
      w - inset * 3.2,
      h - inset * 3.2,
    );
    // rivets
    context.fillStyle = shade(fill, 0.2);
    const rivet = Math.max(2, inset * 0.7);
    for (const [rx, ry] of [
      [inset * 2.2, inset * 2.2],
      [w - inset * 2.2, inset * 2.2],
      [inset * 2.2, h - inset * 2.2],
      [w - inset * 2.2, h - inset * 2.2],
    ] as const) {
      context.beginPath();
      context.arc(x + rx, y + ry, rivet, 0, Math.PI * 2);
      context.fill();
    }
  }

  if (kind === 'hatch') {
    context.strokeStyle = 'rgba(180,220,230,0.25)';
    context.lineWidth = Math.max(2, inset);
    const rings = 3;
    for (let i = 1; i <= rings; i += 1) {
      const t = i / (rings + 1);
      context.strokeRect(
        x + w * t * 0.45,
        y + h * t * 0.45,
        w * (1 - t * 0.9),
        h * (1 - t * 0.9),
      );
    }
  }

  if (kind === 'side') {
    context.fillStyle = 'rgba(0,0,0,0.2)';
    for (let i = 0; i < 6; i += 1) {
      const yy = y + (h * (i + 1)) / 7;
      context.fillRect(x, yy, w, Math.max(2, h * 0.03));
    }
  }

  if (kind === 'stripe') {
    context.fillStyle = 'rgba(240,200,80,0.22)';
    const band = Math.max(6, h * 0.18);
    context.save();
    context.translate(x + w / 2, y + h / 2);
    context.rotate(-Math.PI / 4);
    context.fillRect(-w, -band / 2, w * 2, band);
    context.restore();
  }

  // outer bevel
  context.strokeStyle = 'rgba(0,0,0,0.45)';
  context.lineWidth = Math.max(2, inset * 0.8);
  context.strokeRect(x + 1, y + 1, w - 2, h - 2);
  context.strokeStyle = 'rgba(255,255,255,0.1)';
  context.lineWidth = 1;
  context.strokeRect(x + 2, y + 2, w - 4, h - 4);
  context.restore();
}

function paint(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS;
  canvas.height = ATLAS;
  const context = canvas.getContext('2d');
  if (context) {
    context.fillStyle = '#2e343c';
    context.fillRect(0, 0, ATLAS, ATLAS);
    // subtle board noise under everything (deterministic)
    context.globalAlpha = 0.08;
    for (let i = 0; i < 6000; i += 1) {
      context.fillStyle = noise2(i, 0, 10) > 0.5 ? '#ffffff' : '#000000';
      context.fillRect(
        noise2(i, 1, 11) * ATLAS,
        noise2(i, 2, 12) * ATLAS,
        1 + noise2(i, 3, 13) * 2,
        1 + noise2(i, 4, 14) * 2,
      );
    }
    context.globalAlpha = 1;
    for (const [x, y, w, h, fill, kind] of REGIONS) {
      paintRegion(context, x, y, w, h, fill, kind);
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

type GroundPort = NonNullable<MissionGroundOptions['resources']>;

let painted: CanvasTexture | null = null;

function paintedDiffuse(): CanvasTexture {
  painted ??= paint();
  return painted;
}

function textureOf(image: unknown): Texture | null {
  if (image && typeof image === 'object' && 'isTexture' in image) {
    return image as Texture;
  }
  if (image && typeof image === 'object' && 'src' in image) {
    const texture = new Texture(image as never);
    texture.colorSpace = SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  }
  return null;
}

type ImagePort = {
  readonly image: (key: AssetKey) => Promise<unknown>;
  readonly model?: (key: AssetKey) => Promise<unknown>;
  readonly json?: (key: AssetKey) => Promise<unknown>;
  readonly resolver?: { has(key: AssetKey): boolean };
};

/** Whether the resource store lists the official diffuse atlas. */
export function hasOfficialDiffuse(resources: ImagePort | null): boolean {
  return resources?.resolver?.has(OFFICIAL_GROUND_IMAGES.diffuse) === true;
}

/**
 * Pack that prefers the official diffuse key when the store has it; otherwise the painted stand-in. Optional slots stay
 * on their official keys so a missing map only drops that feature.
 */
export function groundArtPackOf(
  resources: ImagePort | null,
): MissionGroundPack {
  const diffuse = hasOfficialDiffuse(resources)
    ? OFFICIAL_GROUND_IMAGES.diffuse
    : STAND_IN_DIFFUSE;
  return Object.freeze({
    images: Object.freeze({
      diffuse,
      normal: OFFICIAL_GROUND_IMAGES.normal,
      roughness: OFFICIAL_GROUND_IMAGES.roughness,
      emissive: OFFICIAL_GROUND_IMAGES.emissive,
      common: OFFICIAL_GROUND_IMAGES.common,
      commonEmissive: OFFICIAL_GROUND_IMAGES.commonEmissive,
      background: OFFICIAL_GROUND_IMAGES.background,
      wind: OFFICIAL_GROUND_IMAGES.wind,
      gate: OFFICIAL_GROUND_IMAGES.gate,
      waterNormal: OFFICIAL_GROUND_IMAGES.waterNormal,
      caustics: OFFICIAL_GROUND_IMAGES.caustics,
      noise: OFFICIAL_GROUND_IMAGES.noise,
    }),
    meshes: OFFICIAL_GROUND_MESHES,
    gatePrefab: OFFICIAL_GATE_PREFAB,
    tiles: OFFICIAL_BOARD_TILES,
  });
}

/** The resource port of {@link groundArtPackOf}: official images when present, painted diffuse otherwise. */
export function createGroundArtPort(resources: ImagePort | null): GroundPort {
  const official = hasOfficialDiffuse(resources);
  return {
    image: async (key) => {
      if (key === STAND_IN_DIFFUSE) {
        return paintedDiffuse();
      }
      if (resources) {
        try {
          if (!resources.resolver || resources.resolver.has(key)) {
            const texture = textureOf(await resources.image(key));
            if (texture) {
              return texture;
            }
          }
        } catch {
          // fall through
        }
      }
      if (
        key === OFFICIAL_GROUND_IMAGES.diffuse ||
        key === STAND_IN_DIFFUSE ||
        !official
      ) {
        return paintedDiffuse();
      }
      return Promise.reject(new Error(`no ground art ${key}`));
    },
    model: async (key) => {
      if (!resources?.model) {
        return Promise.reject(new Error(`no ground model ${key}`));
      }
      return resources.model(key);
    },
    json: async (key) => {
      if (!resources?.json) {
        return Promise.reject(new Error(`no ground document ${key}`));
      }
      return resources.json(key);
    },
    release: () => {},
  };
}

/** Port with no image loaders: official diffuse is the painted stand-in. */
export const groundArtPort: GroundPort = createGroundArtPort(null);
