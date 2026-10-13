import type { TextureRegion } from '@pixi-spine/base';
import {
  AnimationState,
  AnimationStateData,
  type AttachmentLoader,
  BoundingBoxAttachment,
  ClippingAttachment,
  MeshAttachment,
  PathAttachment,
  PointAttachment,
  RegionAttachment,
  Skeleton,
  SkeletonBinary,
  type SkeletonData,
  SkeletonJson,
  type Slot,
} from '@pixi-spine/runtime-3.8';
import type { SpineSource } from 'arknights-assets-catalog';
import { Group, SRGBColorSpace, type Texture } from 'three';
import {
  type MissionAtlasRegion,
  type MissionSkeletonAtlas,
  parseMissionAtlas,
} from '#actor/skeleton/atlas.js';
import {
  createSkeletonMesh,
  SKELETON_BLEND_MODES,
  type SkeletonBlendMode,
} from '#actor/skeleton/mesh.js';
import type {
  MissionSkeletonData,
  MissionSkeletonEvent,
  MissionSkeletonInstance,
  MissionSkeletonRuntime,
  MissionSkeletonSource,
} from '#port/skeleton.js';

export {
  type MissionAtlasPage,
  type MissionAtlasRegion,
  type MissionSkeletonAtlas,
  parseMissionAtlas,
} from '#actor/skeleton/atlas.js';

export interface MissionSkeletonRuntimeOptions {
  /** Scene units per skeleton unit (pixel). Defaults to 1/100. */
  readonly scale?: number;
}

interface LoadedSkeleton extends MissionSkeletonData {
  readonly spine: SkeletonData;
  readonly pages: ReadonlyMap<string, Texture>;
}

const QUAD_TRIANGLES = [0, 1, 2, 2, 3, 0];

class MissingRegionError extends Error {}

/** An attachment loader that hands attachments the plain atlas regions instead of textures. */
function attachmentLoader(atlas: MissionSkeletonAtlas): AttachmentLoader {
  const regionOf = (path: string, name: string): TextureRegion => {
    const region = atlas.findRegion(path);
    if (!region) {
      throw new MissingRegionError(
        `Atlas has no region "${path}" for attachment "${name}"`,
      );
    }
    return region as unknown as TextureRegion;
  };
  return {
    newRegionAttachment(_skin, name, path) {
      const attachment = new RegionAttachment(name);
      attachment.region = regionOf(path, name);
      return attachment;
    },
    newMeshAttachment(_skin, name, path) {
      const attachment = new MeshAttachment(name);
      attachment.region = regionOf(path, name);
      return attachment;
    },
    newBoundingBoxAttachment: (_skin, name) => new BoundingBoxAttachment(name),
    newPathAttachment: (_skin, name) => new PathAttachment(name),
    newPointAttachment: (_skin, name) => new PointAttachment(name),
    newClippingAttachment: (_skin, name) => new ClippingAttachment(name),
  };
}

/** Texture coordinates of a mesh attachment on its page, from the region-relative ones in the skeleton. */
export function meshUvs(
  regionUVs: ArrayLike<number>,
  region: MissionAtlasRegion,
): Float32Array {
  const uvs = new Float32Array(regionUVs.length);
  const pageWidth = region.page.width;
  const pageHeight = region.page.height;
  if (region.degrees === 90) {
    const u =
      region.u -
      (region.originalHeight - region.offsetY - region.height) / pageWidth;
    const v =
      region.v -
      (region.originalWidth - region.offsetX - region.width) / pageHeight;
    const width = region.originalHeight / pageWidth;
    const height = region.originalWidth / pageHeight;
    for (let index = 0; index < uvs.length; index += 2) {
      uvs[index] = u + (regionUVs[index + 1] ?? 0) * width;
      uvs[index + 1] = v + (1 - (regionUVs[index] ?? 0)) * height;
    }
    return uvs;
  }
  const u = region.u - region.offsetX / pageWidth;
  const v =
    region.v -
    (region.originalHeight - region.offsetY - region.height) / pageHeight;
  const width = region.originalWidth / pageWidth;
  const height = region.originalHeight / pageHeight;
  for (let index = 0; index < uvs.length; index += 2) {
    uvs[index] = u + (regionUVs[index] ?? 0) * width;
    uvs[index + 1] = v + (regionUVs[index + 1] ?? 0) * height;
  }
  return uvs;
}

function prepareAttachments(
  data: SkeletonData,
): Map<MeshAttachment, Float32Array> {
  const meshes = new Map<MeshAttachment, Float32Array>();
  for (const skin of data.skins) {
    for (const entry of skin.getAttachments()) {
      const attachment = entry.attachment;
      if (attachment instanceof RegionAttachment) {
        attachment.updateOffset();
        attachment.setRegion(attachment.region);
      } else if (attachment instanceof MeshAttachment) {
        meshes.set(
          attachment,
          meshUvs(
            attachment.regionUVs,
            attachment.region as unknown as MissionAtlasRegion,
          ),
        );
      }
    }
  }
  return meshes;
}

function blendOf(slot: Slot): SkeletonBlendMode {
  return SKELETON_BLEND_MODES[Number(slot.data.blendMode)] ?? 'normal';
}

/** The default skeleton runtime: Spine 3.8 skeletons and animations drawn as Three meshes. */
export function createMissionSkeletonRuntime(
  options: MissionSkeletonRuntimeOptions = {},
): MissionSkeletonRuntime {
  const scale = options.scale ?? 0.01;
  const uvCache = new WeakMap<
    SkeletonData,
    Map<MeshAttachment, Float32Array>
  >();

  return {
    load(source: MissionSkeletonSource): MissionSkeletonData {
      const atlas = parseMissionAtlas(source.atlas);
      const loader = attachmentLoader(atlas);
      const spine =
        typeof source.skeleton === 'string'
          ? new SkeletonJson(loader).readSkeletonData(source.skeleton)
          : new SkeletonBinary(loader).readSkeletonData(source.skeleton);
      uvCache.set(spine, prepareAttachments(spine));
      const pages = new Map<string, Texture>();
      for (const page of atlas.pages) {
        const texture = source.pages[page.name];
        if (!texture) {
          throw new RangeError(
            `Skeleton atlas page "${page.name}" has no texture`,
          );
        }
        pages.set(page.name, texture);
      }
      const durations: Record<string, number> = {};
      for (const animation of spine.animations) {
        durations[animation.name] = animation.duration;
      }
      const loaded: LoadedSkeleton = {
        spine,
        pages,
        animations: spine.animations.map((animation) => animation.name),
        durations,
        clipping: spine.skins.some((skin) =>
          skin
            .getAttachments()
            .some((entry) => entry.attachment instanceof ClippingAttachment),
        ),
      };
      return loaded;
    },

    create(data: MissionSkeletonData): MissionSkeletonInstance {
      const { spine, pages } = data as LoadedSkeleton;
      const meshUvTable =
        uvCache.get(spine) ?? new Map<MeshAttachment, Float32Array>();
      const skeleton = new Skeleton(spine);
      skeleton.setToSetupPose();
      const state = new AnimationState(new AnimationStateData(spine));
      const object3d = new Group();
      const drawn = createSkeletonMesh();
      drawn.mesh.scale.setScalar(scale);
      object3d.add(drawn.mesh);
      const listeners = new Set<(event: MissionSkeletonEvent) => void>();
      const emit = (event: MissionSkeletonEvent): void => {
        for (const listener of listeners) {
          listener(event);
        }
      };
      state.addListener({
        event: (entry, event) =>
          emit({
            track: entry.trackIndex,
            animation: entry.animation.name,
            type: 'event',
            name: event.data.name,
          }),
        complete: (entry) =>
          emit({
            track: entry.trackIndex,
            animation: entry.animation.name,
            type: 'complete',
            name: null,
          }),
        end: (entry) =>
          emit({
            track: entry.trackIndex,
            animation: entry.animation.name,
            type: 'end',
            name: null,
          }),
      });
      let tint: readonly [number, number, number] = [1, 1, 1];
      let world = new Float32Array(64);

      let clipEnd: Slot['data'] | null = null;
      const draw = (): void => {
        drawn.begin();
        clipEnd = null;
        for (const slot of skeleton.drawOrder) {
          const attachment = slot.getAttachment();
          if (!attachment || !slot.bone.active) {
            if (clipEnd === slot.data) {
              drawn.endClip();
              clipEnd = null;
            }
            continue;
          }
          if (attachment instanceof ClippingAttachment) {
            const length = attachment.worldVerticesLength;
            if (world.length < length) {
              world = new Float32Array(length * 2);
            }
            attachment.computeWorldVertices(slot, 0, length, world, 0, 2);
            drawn.beginClip(world, length >> 1);
            clipEnd = attachment.endSlot;
            continue;
          }
          drawSlot(slot, attachment);
          if (clipEnd === slot.data) {
            drawn.endClip();
            clipEnd = null;
          }
        }
        drawn.end();
      };

      const drawSlot = (
        slot: Slot,
        attachment: ReturnType<Slot['getAttachment']>,
      ): void => {
        let region: MissionAtlasRegion;
        let vertexCount: number;
        let triangles: ArrayLike<number>;
        let uvs: ArrayLike<number>;
        let color: RegionAttachment['color'];
        if (attachment instanceof RegionAttachment) {
          region = attachment.region as unknown as MissionAtlasRegion;
          vertexCount = 4;
          attachment.computeWorldVertices(slot, world, 0, 2);
          triangles = QUAD_TRIANGLES;
          uvs = attachment.uvs;
          color = attachment.color;
        } else if (attachment instanceof MeshAttachment) {
          region = attachment.region as unknown as MissionAtlasRegion;
          vertexCount = attachment.worldVerticesLength >> 1;
          if (world.length < attachment.worldVerticesLength) {
            world = new Float32Array(attachment.worldVerticesLength * 2);
          }
          attachment.computeWorldVertices(
            slot,
            0,
            attachment.worldVerticesLength,
            world,
            0,
            2,
          );
          triangles = attachment.triangles;
          const parent = attachment.getParentMesh() ?? attachment;
          uvs =
            meshUvTable.get(parent) ??
            meshUvTable.get(attachment) ??
            meshUvs(attachment.regionUVs, region);
          color = attachment.color;
        } else {
          return;
        }
        const page = pages.get(region.page.name);
        if (!page) {
          return;
        }
        const skeletonColor = skeleton.color;
        const slotColor = slot.color;
        const alpha = skeletonColor.a * slotColor.a * color.a;
        if (alpha <= 0) {
          return;
        }
        drawn.append({
          page,
          premultipliedAlpha: region.page.premultipliedAlpha,
          blend: blendOf(slot),
          positions: world,
          uvs,
          vertexCount,
          triangles,
          color: [
            skeletonColor.r * slotColor.r * color.r * tint[0],
            skeletonColor.g * slotColor.g * color.g * tint[1],
            skeletonColor.b * slotColor.b * color.b * tint[2],
            alpha,
          ],
        });
      };

      skeleton.updateWorldTransform();
      draw();

      return {
        data,
        object3d,
        play(track, animation, loop, start = 0) {
          const entry = state.setAnimation(track, animation, loop);
          if (start > 0) {
            entry.trackTime = start;
          }
        },
        queue(track, animation, loop, delay = 0) {
          state.addAnimation(track, animation, loop, delay);
        },
        clear(track) {
          state.clearTrack(track);
        },
        update(deltaSeconds) {
          state.update(deltaSeconds);
          state.apply(skeleton);
          skeleton.updateWorldTransform();
          draw();
        },
        onEvent(listener) {
          listeners.add(listener);
          return () => void listeners.delete(listener);
        },
        bounds: () => drawn.bounds(),
        setTint(value) {
          tint = [
            ((value >> 16) & 0xff) / 255,
            ((value >> 8) & 0xff) / 255,
            (value & 0xff) / 255,
          ];
        },
        dispose() {
          listeners.clear();
          state.clearTracks();
          drawn.dispose();
        },
      };
    },

    dispose(data: MissionSkeletonData) {
      uvCache.delete((data as LoadedSkeleton).spine);
    },
  };
}

export interface MissionSkeletonFetch {
  bytes(url: string): Promise<Uint8Array>;
  text(url: string): Promise<string>;
  texture(url: string): Promise<Texture>;
}

function fileName(url: string): string {
  const path = url.split(/[?#]/)[0] ?? url;
  return decodeURIComponent(path.slice(path.lastIndexOf('/') + 1));
}

/**
 * The `spine` loader of the resource port: fetches the skeleton, atlas and pages of a resolved entry and loads them
 * with `runtime`. Atlas pages are matched to the entry's page files by file name; they hold colour, so they are read
 * as sRGB.
 */
export function createMissionSkeletonLoader(
  runtime: MissionSkeletonRuntime,
  fetch: MissionSkeletonFetch,
): (source: SpineSource) => Promise<MissionSkeletonData> {
  return async (source) => {
    const [skeleton, atlas] = await Promise.all([
      source.skel.endsWith('.json')
        ? fetch.text(source.skel)
        : fetch.bytes(source.skel),
      fetch.text(source.atlas),
    ]);
    const urls = new Map(
      source.pages.map((url) => [fileName(url), url] as const),
    );
    const pages: Record<string, Texture> = {};
    await Promise.all(
      parseMissionAtlas(atlas).pages.map(async (page) => {
        const url = urls.get(page.name);
        if (!url) {
          throw new RangeError(
            `Skeleton atlas page "${page.name}" is not among the entry's pages`,
          );
        }
        const texture = await fetch.texture(url);
        texture.colorSpace = SRGBColorSpace;
        pages[page.name] = texture;
      }),
    );
    return runtime.load({ skeleton, atlas, pages });
  };
}
