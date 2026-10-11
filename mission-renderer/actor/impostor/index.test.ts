import { Group, OrthographicCamera, type WebGLRenderTarget } from 'three';
import { describe, expect, it } from 'vitest';
import {
  createMissionImpostorAtlas,
  impostorDue,
  type MissionImpostorRefresh,
  type MissionImpostorRenderer,
} from '#actor/impostor/index.js';

const base: MissionImpostorRefresh = {
  frame: 10,
  turn: 0,
  interval: 3,
  last: 9,
  dirty: false,
  rescale: false,
  held: false,
};

describe('impostor refresh', () => {
  it("spreads redraws over the interval by the turn in this frame's update order", () => {
    const due = [0, 1, 2, 3, 4, 5].map((turn) =>
      impostorDue({ ...base, turn }),
    );
    expect(due).toEqual([false, false, true, false, false, true]);
  });

  it('redraws a stale, rescaled or every-frame impostor, and one left behind for two intervals', () => {
    expect(impostorDue({ ...base, dirty: true })).toBe(true);
    expect(impostorDue({ ...base, rescale: true })).toBe(true);
    expect(impostorDue({ ...base, interval: 1 })).toBe(true);
    expect(impostorDue({ ...base, last: 4 })).toBe(true);
  });

  it('keeps the image of a held pose unless it is stale or rescaled', () => {
    expect(impostorDue({ ...base, turn: 2, held: true })).toBe(false);
    expect(impostorDue({ ...base, held: true, dirty: true })).toBe(true);
  });
});

/** 只记录调用的渲染器：图集只用这几个方法。 */
function fakeRenderer() {
  const calls: string[] = [];
  let target: WebGLRenderTarget | null = null;
  let alpha = 1;
  const renderer = {
    getRenderTarget: () => target,
    setRenderTarget: (next: WebGLRenderTarget | null) => {
      target = next;
      calls.push(
        next ? `target ${next.viewport.toArray().join(',')}` : 'target screen',
      );
    },
    getClearAlpha: () => alpha,
    setClearAlpha: (next: number) => {
      alpha = next;
      calls.push(`alpha ${next}`);
    },
    clear: () => void calls.push('clear'),
    render: () => void calls.push('render'),
  } as unknown as MissionImpostorRenderer;
  return { renderer, calls };
}

describe('impostor atlas', () => {
  const options = {
    pageSize: { main: 512, clip: 256 },
    maxPages: { main: 1, clip: 1 },
    cell: 256,
  };

  it('hands out one cell per slot, adds clip pages apart, and returns null when full', () => {
    const atlas = createMissionImpostorAtlas({
      renderer: fakeRenderer().renderer,
      ...options,
    });
    const slots = [0, 1, 2, 3].map(() => atlas.alloc(200, 240, false));
    expect(slots.map((slot) => slot && [slot.page, slot.x, slot.y])).toEqual([
      [0, 0, 0],
      [0, 256, 0],
      [0, 0, 256],
      [0, 256, 256],
    ]);
    expect(atlas.alloc(10, 10, false)).toBeNull();
    expect(atlas.alloc(300, 10, true)).toBeNull();
    expect(atlas.alloc(100, 100, true)).toMatchObject({ page: 1, clip: true });
    atlas.free(slots[1]!);
    expect(atlas.alloc(10, 10, false)).toMatchObject({ page: 0, x: 256, y: 0 });
    expect(atlas.stats()).toEqual({ pages: 2, slots: 5 });
    atlas.clear();
    expect(atlas.stats()).toEqual({ pages: 0, slots: 0 });
  });

  it('draws the queued skeletons into their slots on flush with a clear background, then restores the renderer', () => {
    const { renderer, calls } = fakeRenderer();
    const atlas = createMissionImpostorAtlas({ renderer, ...options });
    const slot = atlas.alloc(128, 64, false)!;
    const parent = new Group();
    const skeleton = new Group();
    parent.add(skeleton);
    atlas.draw(slot, skeleton, new OrthographicCamera());
    atlas.flush();
    atlas.flush();
    expect(calls).toEqual([
      'alpha 0',
      'target 0,0,128,64',
      'clear',
      'render',
      'alpha 1',
      'target screen',
      'alpha 0',
      'alpha 1',
      'target screen',
    ]);
    expect(skeleton.parent).toBe(parent);
    expect(atlas.texture(slot)).toBeDefined();
  });
});
