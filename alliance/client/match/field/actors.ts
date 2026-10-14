import type { AssetKey } from 'arknights-assets-catalog';
import {
  createMissionResourcePort,
  createMissionSkeletonLoader,
  createMissionSkeletonRuntime,
  type MissionActorWorldOptions,
  type MissionAnimClip,
  type MissionAnimRoles,
  type MissionAppearance,
  type MissionSkeletonData,
} from 'arknights-mission-renderer';
import { TextureLoader } from 'three';
import type { ResourceStore } from '#infra/resource/store.js';

/**
 * The actors' models: the backend's Spine skeletons, as master draws its operators and enemies. Each model is loaded
 * once through `createMissionResourcePort` (refcounted spine holds + fallbacks); its clips are matched by name once it
 * is there.
 */

export interface ActorModels {
  /** What the stage's actor world loads models with. */
  readonly options: MissionActorWorldOptions;
  /** How a unit with this model is drawn, or null when the backend has no such model. */
  readonly appearance: (key: AssetKey) => Promise<MissionAppearance | null>;
  readonly has: (key: AssetKey) => boolean;
}

const textures = new TextureLoader();

async function body(url: string): Promise<Response> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`request failed with ${response.status}: ${url}`);
  }
  return response;
}

/** The first clip whose name is one of `names`, compared without case. */
function clip(
  animations: readonly string[],
  names: readonly string[],
): string | null {
  for (const name of names) {
    const found = animations.find(
      (each) => each.toLowerCase() === name.toLowerCase(),
    );
    if (found) {
      return found;
    }
  }
  return null;
}

function loop(
  animations: readonly string[],
  names: readonly string[],
): MissionAnimClip | null {
  const name = clip(animations, names);
  return name ? { begin: null, loop: name, end: null } : null;
}

/** Arknights clip names by field role. */
export function rolesOf(animations: readonly string[]): MissionAnimRoles {
  return {
    idle: clip(animations, ['Idle', 'Default']),
    deploy: clip(animations, ['Start']),
    attack: loop(animations, ['Attack', 'Attack_Loop', 'Combat']),
    attackDown: null,
    skill: null,
    die: clip(animations, ['Die']),
    move: loop(animations, ['Move_Loop', 'Move', 'Run_Loop']),
    stun: loop(animations, ['Stun']),
  };
}

/** Spine skeletons come in at about three tiles tall; this brings an operator to roughly one tile, as on master's board. */
export const MODEL_SCALE = 0.4;

/** Enemy size over the operator baseline, from catalog `modelScale` / `modelScaleY` (master's enemies.json). */
export function modelScaleOf(
  modelScale: number | undefined,
  modelScaleY: number | undefined = 1,
): { readonly scale: number; readonly scaleY: number } {
  const k =
    typeof modelScale === 'number' &&
    Number.isFinite(modelScale) &&
    modelScale > 0.05 &&
    modelScale < 20
      ? modelScale
      : 1;
  const ky =
    typeof modelScaleY === 'number' &&
    Number.isFinite(modelScaleY) &&
    modelScaleY > 0.2 &&
    modelScaleY < 5
      ? modelScaleY
      : 1;
  return { scale: MODEL_SCALE * k, scaleY: ky };
}

export function createActorModels(resources: ResourceStore): ActorModels {
  const runtime = createMissionSkeletonRuntime();
  const load = createMissionSkeletonLoader(runtime, {
    bytes: async (url) => new Uint8Array(await (await body(url)).arrayBuffer()),
    text: async (url) => (await body(url)).text(),
    texture: (url) => textures.loadAsync(url),
  });
  // Stage actors only need spine + release; image/model/json stubs keep the port shape complete for createMissionResourcePort.
  const port = createMissionResourcePort<unknown, MissionSkeletonData>({
    resolver: resources.resolver,
    image: async (url) => textures.loadAsync(url),
    spine: (source) => load(source),
    model: async () => {
      throw new Error('actor resource port does not load models');
    },
    json: async () => {
      throw new Error('actor resource port does not load json');
    },
  });
  // Keys whose appearance was probed: keep one port hold so a later actor acquire does not flash the stand-in
  // between release and re-fetch. Holds last for the life of this ActorModels (resources stay loaded for the match).
  const probed = new Set<AssetKey>();
  return {
    options: {
      skeleton: runtime,
      resources: {
        spine: (key) => port.spine(key),
        release: (key) => port.release(key, 'spine'),
      },
    },
    has: (key) => resources.resolver.has(key),
    appearance: async (key) => {
      try {
        const data = await port.spine(key);
        probed.add(key);
        // Keep the probe hold (do not release): releasing here then re-acquiring on set-appearances flashes stand-in.
        return {
          spine: key,
          roles: rolesOf(data.animations),
          scale: MODEL_SCALE,
          scaleY: 1,
          mirrorX: false,
          offset: { x: 0, y: 0, z: 0 },
        };
      } catch {
        return null;
      }
    },
  };
}
