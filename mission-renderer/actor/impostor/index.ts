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
  /** Grid that slot sides are rounded up to, in pixels. Defaults to 16. */
  readonly grid?: number;
}

/** A row of slots of one height, filled from the left. */
interface Shelf {
  readonly y: number;
  readonly height: number;
  /** Left edge of the unused rest of the shelf. */
  x: number;
  /** Freed slots of the shelf, reused before the rest. */
  readonly free: { readonly x: number; readonly width: number }[];
  live: number;
}

interface Page {
  readonly target: WebGLRenderTarget;
  readonly clip: boolean;
  readonly size: number;
  readonly shelves: Shelf[];
  /** Top of the unused rest of the page. */
  nextY: number;
  readonly queue: {
    readonly slot: MissionImpostorSlot;
    readonly object: Object3D;
    readonly camera: Camera;
  }[];
}

/** A freed slot or shelf is reused for a request at most this much smaller. */
const REUSE_SLACK = 1.5;

/**
 * An atlas packing slots onto shelves: rows of one height, filled from the left. A freed slot is reused by a request
 * of a fitting size; a shelf whose last slot is freed is emptied, and empty shelves at the top of a page are given back,
 * so a page whose slots are all freed starts over. Pages are added on demand up to the limit; skeletons with clipping
 * attachments get slots on separate, smaller clip pages.
 */
export function createMissionImpostorAtlas(
  options: MissionImpostorAtlasOptions,
): MissionImpostorAtlas {
  const pageSize = options.pageSize ?? { main: 2048, clip: 1024 };
  const maxPages = options.maxPages ?? { main: 3, clip: 2 };
  const grid = options.grid ?? 16;
  const pages: Page[] = [];
  const shelfOf = new Map<MissionImpostorSlot, Shelf>();
  const scene = new Scene();

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
    const page: Page = {
      target: new WebGLRenderTarget(size, size),
      clip,
      size,
      shelves: [],
      nextY: 0,
      queue: [],
    };
    pages.push(page);
    return page;
  };

  const slotOf = (
    page: Page,
    shelf: Shelf,
    x: number,
    width: number,
  ): MissionImpostorSlot => {
    shelf.live += 1;
    const slot: MissionImpostorSlot = {
      page: pages.indexOf(page),
      clip: page.clip,
      x,
      y: shelf.y,
      width,
      height: shelf.height,
    };
    shelfOf.set(slot, shelf);
    return slot;
  };

  const allocIn = (
    page: Page,
    width: number,
    height: number,
  ): MissionImpostorSlot | null => {
    for (const shelf of page.shelves) {
      if (shelf.height < height || shelf.height > height * REUSE_SLACK) {
        continue;
      }
      const index = shelf.free.findIndex(
        (gap) => gap.width >= width && gap.width <= width * REUSE_SLACK,
      );
      const gap = index >= 0 ? shelf.free.splice(index, 1)[0] : undefined;
      if (gap) {
        return slotOf(page, shelf, gap.x, gap.width);
      }
      if (shelf.x + width <= page.size) {
        const x = shelf.x;
        shelf.x += width;
        return slotOf(page, shelf, x, width);
      }
    }
    if (page.nextY + height > page.size) {
      return null;
    }
    const shelf: Shelf = { y: page.nextY, height, x: width, free: [], live: 0 };
    page.nextY += height;
    page.shelves.push(shelf);
    return slotOf(page, shelf, 0, width);
  };

  return {
    alloc(width, height, clip) {
      if (!(width > 0) || !(height > 0)) {
        return null;
      }
      const w = Math.ceil(width / grid) * grid;
      const h = Math.ceil(height / grid) * grid;
      const size = clip ? pageSize.clip : pageSize.main;
      if (w > size || h > size) {
        return null;
      }
      for (const page of pages) {
        if (page.clip !== clip) {
          continue;
        }
        const slot = allocIn(page, w, h);
        if (slot) {
          return slot;
        }
      }
      const page = newPage(clip);
      return page ? allocIn(page, w, h) : null;
    },
    free(slot) {
      const shelf = shelfOf.get(slot);
      if (!shelf) {
        return;
      }
      shelfOf.delete(slot);
      const page = pageOf(slot);
      page.queue.splice(
        0,
        page.queue.length,
        ...page.queue.filter((draw) => draw.slot !== slot),
      );
      shelf.live -= 1;
      if (shelf.live > 0) {
        shelf.free.push({ x: slot.x, width: slot.width });
        return;
      }
      shelf.x = 0;
      shelf.free.length = 0;
      while (page.shelves.length > 0 && page.shelves.at(-1)?.live === 0) {
        const top = page.shelves.pop();
        if (top) {
          page.nextY = top.y;
        }
      }
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
    stats: () => ({ pages: pages.length, slots: shelfOf.size }),
    clear() {
      for (const page of pages) {
        page.target.dispose();
      }
      pages.length = 0;
      shelfOf.clear();
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
