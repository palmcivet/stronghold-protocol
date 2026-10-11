import {
  type Camera,
  type Object3D,
  Scene,
  type Texture,
  type WebGLRenderer,
  WebGLRenderTarget,
} from 'three';

/** A rectangle of an atlas page owned by one actor, in pixels. */
export interface MissionImpostorSlot {
  readonly page: number;
  /** Skeletons with clipping attachments draw on separate, smaller clip pages. */
  readonly clip: boolean;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Shared render-target pages that actors draw their skeletons into, shown as one textured quad each. Every slot due in
 * a frame is drawn in one pass per page.
 */
export interface MissionImpostorAtlas {
  /** Reserves a slot, or returns null when every page is full; the actor then draws its skeleton directly. */
  alloc(
    width: number,
    height: number,
    clip: boolean,
  ): MissionImpostorSlot | null;
  free(slot: MissionImpostorSlot): void;
  /** Queues the skeleton object to be drawn into its slot through the camera by the next `flush`. */
  draw(slot: MissionImpostorSlot, object: Object3D, camera: Camera): void;
  /** Draws the queued skeletons, once per frame before the main render. */
  flush(): void;
  /** Texture of the page holding the slot. */
  texture(slot: MissionImpostorSlot): Texture;
  /** Pages and slots in use. */
  stats(): { readonly pages: number; readonly slots: number };
  /** Frees every slot and disposes the pages. */
  clear(): void;
}

/** The renderer calls the atlas makes. */
export type MissionImpostorRenderer = Pick<
  WebGLRenderer,
  | 'getRenderTarget'
  | 'setRenderTarget'
  | 'getClearAlpha'
  | 'setClearAlpha'
  | 'clear'
  | 'render'
>;

export interface MissionImpostorAtlasOptions {
  readonly renderer: MissionImpostorRenderer;
  /** Page side, in pixels, of main and clip pages. Defaults to 2048 and 1024. */
  readonly pageSize?: { readonly main: number; readonly clip: number };
  /** Most pages of each sort. Defaults to 3 main and 2 clip pages. */
  readonly maxPages?: { readonly main: number; readonly clip: number };
  /** Side of the square cells a page is cut into, in pixels; a slot takes one cell. Defaults to 256. */
  readonly cell?: number;
}

interface Page {
  readonly target: WebGLRenderTarget;
  readonly clip: boolean;
  readonly free: number[];
  readonly queue: {
    readonly slot: MissionImpostorSlot;
    readonly object: Object3D;
    readonly camera: Camera;
  }[];
}

/** An atlas cutting each page into equal cells, one per slot; pages are added on demand up to the limit. */
export function createMissionImpostorAtlas(
  options: MissionImpostorAtlasOptions,
): MissionImpostorAtlas {
  const pageSize = options.pageSize ?? { main: 2048, clip: 1024 };
  const maxPages = options.maxPages ?? { main: 3, clip: 2 };
  const cell = options.cell ?? 256;
  const pages: Page[] = [];
  const scene = new Scene();
  let used = 0;

  const cellsOf = (clip: boolean): number =>
    Math.floor((clip ? pageSize.clip : pageSize.main) / cell) ** 2;

  const pageOf = (slot: MissionImpostorSlot): Page => {
    const page = pages[slot.page];
    if (!page) {
      throw new RangeError(`Impostor page ${slot.page} does not exist`);
    }
    return page;
  };

  const newPage = (clip: boolean): Page | null => {
    if (
      pages.filter((page) => page.clip === clip).length >=
      (clip ? maxPages.clip : maxPages.main)
    ) {
      return null;
    }
    const size = clip ? pageSize.clip : pageSize.main;
    const free = Array.from(
      { length: cellsOf(clip) },
      (_, index) => cellsOf(clip) - 1 - index,
    );
    const page: Page = {
      target: new WebGLRenderTarget(size, size),
      clip,
      free,
      queue: [],
    };
    pages.push(page);
    return page;
  };

  return {
    alloc(width, height, clip) {
      if (width > cell || height > cell || width <= 0 || height <= 0) {
        return null;
      }
      const page =
        pages.find(
          (candidate) => candidate.clip === clip && candidate.free.length > 0,
        ) ?? newPage(clip);
      const index = page?.free.pop();
      if (!page || index === undefined) {
        return null;
      }
      const columns = Math.floor(page.target.width / cell);
      used += 1;
      return {
        page: pages.indexOf(page),
        clip,
        x: (index % columns) * cell,
        y: Math.floor(index / columns) * cell,
        width,
        height,
      };
    },
    free(slot) {
      const page = pageOf(slot);
      const columns = Math.floor(page.target.width / cell);
      const index = (slot.y / cell) * columns + slot.x / cell;
      if (page.free.includes(index)) {
        return;
      }
      page.free.push(index);
      page.queue.splice(
        0,
        page.queue.length,
        ...page.queue.filter((draw) => draw.slot !== slot),
      );
      used -= 1;
    },
    draw(slot, object, camera) {
      pageOf(slot).queue.push({ slot, object, camera });
    },
    flush() {
      const renderer = options.renderer;
      const previous = renderer.getRenderTarget();
      const alpha = renderer.getClearAlpha();
      renderer.setClearAlpha(0);
      for (const page of pages) {
        for (const { slot, object, camera } of page.queue) {
          page.target.viewport.set(slot.x, slot.y, slot.width, slot.height);
          page.target.scissor.set(slot.x, slot.y, slot.width, slot.height);
          page.target.scissorTest = true;
          renderer.setRenderTarget(page.target);
          renderer.clear();
          const parent = object.parent;
          scene.add(object);
          renderer.render(scene, camera);
          scene.remove(object);
          parent?.add(object);
        }
        page.queue.length = 0;
      }
      renderer.setClearAlpha(alpha);
      renderer.setRenderTarget(previous);
    },
    texture: (slot) => pageOf(slot).target.texture,
    stats: () => ({ pages: pages.length, slots: used }),
    clear() {
      for (const page of pages) {
        page.target.dispose();
      }
      pages.length = 0;
      used = 0;
    },
  };
}

/** What decides whether an impostor redraws this frame. */
export interface MissionImpostorRefresh {
  readonly frame: number;
  /** The actor's place in this frame's update order, counted from 0 every frame. */
  readonly turn: number;
  /** Frames between redraws; 1 or less redraws every frame. */
  readonly interval: number;
  /** Frame of the last redraw. */
  readonly last: number;
  /** The image is stale: new slot, new skeleton or a changed pose. */
  readonly dirty: boolean;
  /** The drawn scale changed by more than 12 %. */
  readonly rescale: boolean;
  /** The pose is held, so the image in the slot is still right. */
  readonly held: boolean;
}

/**
 * Whether an impostor redraws this frame. Turns spread the redraws evenly over the interval; an actor whose turn
 * shifts with the frame still redraws after two intervals at the latest.
 */
export function impostorDue(refresh: MissionImpostorRefresh): boolean {
  if (refresh.held && !refresh.dirty && !refresh.rescale) {
    return false;
  }
  return (
    refresh.dirty ||
    refresh.rescale ||
    refresh.interval <= 1 ||
    (refresh.frame + refresh.turn) % refresh.interval === 0 ||
    refresh.frame - refresh.last >= 2 * refresh.interval
  );
}
