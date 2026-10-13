import {
  BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  PlaneGeometry,
} from 'three';
import {
  impostorDue,
  type MissionImpostorAtlas,
  type MissionImpostorSlot,
} from '#actor/impostor/index.js';
import type {
  MissionSkeletonBounds,
  MissionSkeletonInstance,
} from '#port/skeleton.js';

/** How actors draw their skeletons through an impostor atlas. */
export interface MissionActorImpostor {
  readonly atlas: MissionImpostorAtlas;
  /** Frames between redraws of an impostor whose image is not stale. Defaults to 3. */
  readonly interval?: number;
  /** Atlas pixels per skeleton unit at a root scale of 1. Defaults to 1. */
  readonly pixelsPerUnit?: number;
}

/** A redraw is due when the drawn scale changes by more than this. */
export const IMPOSTOR_RESCALE = 0.12;

/** One actor's impostor: its slot, the quad that shows it, and the camera its skeleton is drawn through. */
export interface ActorImpostor {
  readonly slot: MissionImpostorSlot;
  readonly instance: MissionSkeletonInstance;
  readonly mesh: Mesh<PlaneGeometry, MeshBasicMaterial>;
  readonly camera: OrthographicCamera;
  /** Atlas pixels per skeleton unit when the slot was taken. */
  readonly scale: number;
  /** Frame of the last redraw. */
  last: number;
}

/** What the impostor step decides for one actor this frame. */
export interface ImpostorTurn {
  /** The impostor to show, or null when the skeleton draws directly. */
  readonly impostor: ActorImpostor | null;
  /** Its skeleton was queued for a redraw. */
  readonly drawn: boolean;
}

function frame(
  camera: OrthographicCamera,
  bounds: MissionSkeletonBounds,
): void {
  camera.left = bounds.x;
  camera.right = bounds.x + bounds.width;
  camera.bottom = bounds.y;
  camera.top = bounds.y + bounds.height;
  camera.near = -1000;
  camera.far = 1000;
  camera.position.set(0, 0, 0);
  camera.updateProjectionMatrix();
}

function quad(
  atlas: MissionImpostorAtlas,
  slot: MissionImpostorSlot,
  bounds: MissionSkeletonBounds,
): Mesh<PlaneGeometry, MeshBasicMaterial> {
  const geometry = new PlaneGeometry(bounds.width, bounds.height);
  geometry.translate(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
    0,
  );
  const texture = atlas.texture(slot);
  const image = texture.image as { width?: number; height?: number };
  const width = image.width ?? 1;
  const height = image.height ?? 1;
  const u0 = slot.x / width;
  const u1 = (slot.x + slot.width) / width;
  const v0 = slot.y / height;
  const v1 = (slot.y + slot.height) / height;
  // PlaneGeometry vertices: top left, top right, bottom left, bottom right
  geometry.setAttribute(
    'uv',
    new BufferAttribute(new Float32Array([u0, v1, u1, v1, u0, v0, u1, v0]), 2),
  );
  const mesh = new Mesh(
    geometry,
    new MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    }),
  );
  mesh.name = 'impostor';
  return mesh;
}

/** Frees the slot and disposes the quad. */
export function dropImpostor(
  atlas: MissionImpostorAtlas,
  impostor: ActorImpostor,
): void {
  atlas.free(impostor.slot);
  impostor.mesh.removeFromParent();
  impostor.mesh.geometry.dispose();
  impostor.mesh.material.dispose();
}

/**
 * Keeps an actor's impostor current. A new skeleton, bounds outgrowing the slot or a drawn scale changed by more than
 * `IMPOSTOR_RESCALE` takes a new slot; a full atlas gives null and the skeleton draws directly. `turn` is the actor's
 * place in this frame's update order.
 */
export function stepImpostor(
  options: MissionActorImpostor,
  current: ActorImpostor | null,
  instance: MissionSkeletonInstance,
  rootScale: number,
  frameIndex: number,
  turn: number,
  held = false,
): ImpostorTurn {
  const atlas = options.atlas;
  const scale = Math.abs(rootScale) * (options.pixelsPerUnit ?? 1);
  const bounds = instance.bounds();
  const width = bounds.width * scale;
  const height = bounds.height * scale;
  const rescale =
    current !== null && Math.abs(scale / current.scale - 1) > IMPOSTOR_RESCALE;
  const stale =
    current === null ||
    current.instance !== instance ||
    width > current.slot.width ||
    height > current.slot.height;
  let impostor = current;
  if (stale || rescale) {
    if (current) {
      dropImpostor(atlas, current);
    }
    const slot = atlas.alloc(width, height, instance.data.clipping);
    if (!slot) {
      return { impostor: null, drawn: false };
    }
    impostor = {
      slot,
      instance,
      mesh: quad(atlas, slot, bounds),
      camera: new OrthographicCamera(),
      scale,
      last: -Infinity,
    };
  }
  if (!impostor) {
    return { impostor: null, drawn: false };
  }
  const due = impostorDue({
    frame: frameIndex,
    turn,
    interval: options.interval ?? 3,
    last: impostor.last,
    dirty: stale,
    rescale,
    held,
  });
  if (due) {
    frame(impostor.camera, bounds);
    atlas.draw(impostor.slot, instance.object3d, impostor.camera);
    impostor.last = frameIndex;
  }
  return { impostor, drawn: due };
}
