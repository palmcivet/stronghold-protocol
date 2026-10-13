import { TICK } from 'arknights-mission-core';
import { Texture } from 'three';
import { describe, expect, it } from 'vitest';
import { type ActorFrame, createActorWorld } from '#actor/entity/index.js';
import type {
  MissionImpostorAtlas,
  MissionImpostorSlot,
} from '#actor/impostor/index.js';
import {
  appearance,
  fakeSkeleton,
  type RecordedTick,
  recordDuel,
} from '#test/actor/fixture.js';

/** 记录调用的图集：容量为 capacity 个格子，每格 64 像素见方。 */
function fakeAtlas(capacity: number) {
  const calls: string[] = [];
  const live = new Set<MissionImpostorSlot>();
  let next = 0;
  const texture = new Texture({ width: 512, height: 512 });
  const atlas: MissionImpostorAtlas = {
    alloc(width, height, clip) {
      if (live.size >= capacity) {
        calls.push(`full ${width}x${height}`);
        return null;
      }
      const slot = {
        page: 0,
        clip,
        x: (next % 8) * 64,
        y: Math.floor(next / 8) * 64,
        width: Math.ceil(width),
        height: Math.ceil(height),
      };
      next += 1;
      live.add(slot);
      calls.push(`alloc ${slot.width}x${slot.height}${clip ? ' clip' : ''}`);
      return slot;
    },
    free(slot) {
      live.delete(slot);
      calls.push(`free ${slot.x},${slot.y}`);
    },
    draw(slot, object) {
      calls.push(
        `draw ${slot.x},${slot.y} ${object.parent ? 'attached' : 'detached'}`,
      );
    },
    flush: () => void calls.push('flush'),
    texture: () => texture,
    stats: () => ({ pages: 1, slots: live.size }),
    clear: () => live.clear(),
  };
  return { atlas, calls, live };
}

function world(capacity: number, interval = 2) {
  const skeleton = fakeSkeleton();
  const atlas = fakeAtlas(capacity);
  const actors = createActorWorld({
    skeleton: skeleton.runtime,
    resources: skeleton.resources,
    impostor: { atlas: atlas.atlas, interval, pixelsPerUnit: 40 },
  });
  actors.setAppearances({
    g: appearance('spine:guard'),
    e: appearance('spine:enemy'),
  });
  /** 假时钟：每帧推进一拍。 */
  const play = async (ticks: readonly RecordedTick[]) => {
    for (const tick of ticks) {
      const frame: ActorFrame = {
        deltaSeconds: TICK,
        units: tick.snapshot.units,
        moving: new Set(),
        events: tick.events,
      };
      for (const system of actors.systems) {
        system.run(frame);
      }
      await Promise.resolve();
    }
  };
  return { actors, skeleton, atlas, play };
}

describe('actor impostor', () => {
  const duel = recordDuel(120, 90);

  it('draws each skeleton into its own slot and shows a quad instead of the skeleton', async () => {
    const { actors, atlas, play } = world(4);
    await play(duel.slice(0, 3));
    const guard = actors.actors.get('g');
    expect(guard?.impostor?.slot).toMatchObject({ width: 40, height: 40 });
    expect(guard?.impostor?.mesh.parent).toBe(guard?.root);
    expect(guard?.skeleton.instance?.object3d.parent).toBeNull();
    expect(atlas.calls.filter((call) => call.startsWith('alloc'))).toEqual([
      'alloc 40x40',
      'alloc 40x40',
    ]);
    expect(atlas.calls.filter((call) => call.startsWith('draw'))[0]).toMatch(
      /detached$/,
    );
  });

  it('spreads redraws over the interval by the turn in update order', async () => {
    const { atlas, play } = world(4, 2);
    await play(duel.slice(0, 8));
    const draws = atlas.calls
      .filter((call) => call.startsWith('draw'))
      .map((call) => call.split(' ')[1]);
    // 新格子当帧画；之后两名演员按顺序各隔一帧轮流重画
    expect(draws.slice(0, 2)).toEqual(['0,0', '64,0']);
    const rest = draws.slice(2);
    expect(rest.length).toBeGreaterThan(2);
    for (let index = 1; index < rest.length; index += 1) {
      expect(rest[index]).not.toBe(rest[index - 1]);
    }
  });

  it('draws the skeleton directly when the atlas is full', async () => {
    const { actors, atlas, play } = world(1);
    await play(duel.slice(0, 3));
    const shown = [...actors.actors.values()].map((actor) =>
      actor.impostor
        ? 'impostor'
        : actor.skeleton.instance?.object3d.parent === actor.root
          ? 'direct'
          : 'none',
    );
    expect(shown.sort()).toEqual(['direct', 'impostor']);
    expect(atlas.calls.some((call) => call.startsWith('full'))).toBe(true);
  });

  it('takes a new slot when the drawn scale changes, and frees it when the actor is released or impostors stop', async () => {
    const { actors, atlas, play } = world(4);
    await play(duel.slice(0, 3));
    actors.setAppearances({ g: appearance('spine:guard', { scale: 1.5 }) });
    await play(duel.slice(3, 5));
    expect(actors.actors.get('g')?.impostor?.slot).toMatchObject({ width: 60 });
    await play(duel.slice(5));
    expect(actors.actors.has('e')).toBe(false);
    const frees = atlas.calls.filter((call) => call.startsWith('free'));
    expect(frees.length).toBe(2);
    actors.setImpostor(null);
    const guard = actors.actors.get('g');
    expect(guard?.impostor).toBeNull();
    expect(guard?.skeleton.instance?.object3d.parent).toBe(guard?.root);
    expect(atlas.live.size).toBe(0);
  });
});
