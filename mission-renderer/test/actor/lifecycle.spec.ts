import { TICK } from 'arknights-mission-core';
import { describe, expect, it } from 'vitest';
import { MISSION_ACTOR_FADE_SECONDS } from '#actor/entity/index.js';
import type { MissionAudioCue } from '#contract/audio.js';
import { createMissionStage } from '#runtime/stage/index.js';
import {
  appearance,
  fakeSkeleton,
  type RecordedTick,
  recordDuel,
} from '#test/actor/fixture.js';

const REMOVE_AT = 90;

function staged(options: { hpBar?: boolean } = {}) {
  const skeleton = fakeSkeleton();
  const cues: MissionAudioCue[] = [];
  const stage = createMissionStage(null, {
    actors: { skeleton: skeleton.runtime, resources: skeleton.resources },
    onAudioCue: (cue) => void cues.push(cue),
  });
  stage.dispatch({
    type: 'set-appearances',
    appearances: {
      g: appearance('spine:guard', { tint: 0xff8080 }),
      e: appearance(
        'spine:enemy',
        options.hpBar === false ? { hpBar: false } : {},
      ),
    },
  });
  const play = async (ticks: readonly RecordedTick[]) => {
    for (const tick of ticks) {
      stage.dispatch({ type: 'push-snapshot', snapshot: tick.snapshot });
      for (const event of tick.events) {
        stage.dispatch({ type: 'push-event', event });
      }
      stage.update(TICK);
      await Promise.resolve();
    }
  };
  const instanceOf = (id: string) =>
    skeleton.instances.find(
      (instance) => stage.actors.actors.get(id)?.skeleton.instance === instance,
    );
  return { stage, skeleton, cues, play, instanceOf };
}

describe('actor lifecycle', () => {
  const duel = recordDuel(REMOVE_AT + 30, REMOVE_AT);
  const downedAt = duel.findIndex((tick) =>
    tick.events.some((event) => event.type === 'downed'),
  );
  const removedAt = duel.findIndex((tick) =>
    tick.events.some((event) => event.type === 'removed'),
  );

  it('records a duel where the enemy falls and later leaves', () => {
    expect(downedAt).toBeGreaterThan(0);
    expect(removedAt).toBeGreaterThan(downedAt);
    expect(duel[removedAt + 1]?.snapshot.units.map((unit) => unit.id)).toEqual([
      'g',
    ]);
  });

  it('creates an actor per unit on its first snapshot and gives it its model, scaled and tinted by the appearance', async () => {
    const h = staged();
    await h.play(duel.slice(0, 2));
    expect([...h.stage.actors.actors.keys()].sort()).toEqual(['e', 'g']);
    const guard = h.instanceOf('g')!;
    expect(guard.calls[0]).toBe('tint ff8080');
    expect(h.stage.actors.actors.get('e')?.root.scale.x).toBe(-1);
    expect(h.stage.actors.actors.get('g')?.root.position.toArray()).toEqual([
      0, 0, -0,
    ]);
  });

  it('plays the attack on each attack event and returns to idle', async () => {
    const h = staged();
    await h.play(duel.slice(0, downedAt));
    const calls = h.instanceOf('g')!.calls;
    expect(
      calls.filter((call) => call === 'play 0 Attack').length,
    ).toBeGreaterThan(0);
    expect(calls).toContain('queue 0 Idle loop');
  });

  it('holds the fallen pose once downed, drops the health bar, then fades out and releases the actor after removal', async () => {
    const h = staged();
    await h.play(duel.slice(0, downedAt + 1));
    const enemy = h.stage.actors.actors.get('e')!;
    const model = h.instanceOf('e')!;
    expect(enemy.phase).toBe('downed');
    expect(model.calls.at(-1)).toBe('play 0 Die');
    expect(h.stage.hud.bar('e')).toBeNull();
    expect(h.stage.hud.bar('g')).toEqual({ hp: 1, shield: 0 });

    await h.play(duel.slice(downedAt + 1, removedAt + 1));
    expect(enemy.phase).toBe('fading');
    expect(enemy.fade).toBeCloseTo(1 - TICK / MISSION_ACTOR_FADE_SECONDS);
    let frames = 1;
    while (enemy.phase === 'fading' && frames < 100) {
      h.stage.update(TICK);
      frames += 1;
    }
    expect(
      Math.abs(frames * TICK - MISSION_ACTOR_FADE_SECONDS),
    ).toBeLessThanOrEqual(TICK);
    expect(enemy.phase).toBe('released');
    expect(h.stage.actors.actors.has('e')).toBe(false);
    expect(model.disposed).toBe(true);
    expect(h.skeleton.released).toEqual(['spine:enemy']);
    expect(h.stage.actors.pool.idle('enemy')).toBe(1);
  });

  it('hides the health bar where the appearance turns it off', async () => {
    const h = staged({ hpBar: false });
    await h.play(duel.slice(0, 2));
    expect(h.stage.hud.bar('e')).toBeNull();
    expect(h.stage.hud.bar('g')).not.toBeNull();
  });

  it('releases pushed events to the audio cues on the next update', async () => {
    const h = staged();
    const attack = duel.find((tick) =>
      tick.events.some((event) => event.type === 'attack'),
    )!;
    h.stage.dispatch({ type: 'push-snapshot', snapshot: attack.snapshot });
    for (const event of attack.events) {
      h.stage.dispatch({ type: 'push-event', event });
    }
    expect(h.cues).toEqual([]);
    h.stage.update(TICK);
    expect(h.cues.map((cue) => cue.type)).toContain('attack');
    expect(h.stage.view.events.length).toBe(attack.events.length);
  });

  it('drops every actor and appearance on reset', async () => {
    const h = staged();
    await h.play(duel.slice(0, 2));
    h.stage.dispatch({ type: 'reset' });
    expect(h.stage.actors.actors.size).toBe(0);
    expect(h.stage.view.appearances).toEqual({});
    expect(h.skeleton.instances.every((instance) => instance.disposed)).toBe(
      true,
    );
  });
});
