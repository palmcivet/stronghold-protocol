import { TICK } from 'arknights-mission-core';
import type { Sprite } from 'three';
import { describe, expect, it } from 'vitest';
import type { MissionCue } from '#contract/cue.js';
import { damageNumberOf, MISSION_NUMBER_MOTION } from '#effect/number.js';
import { createMissionStage } from '#runtime/stage/index.js';
import { recordDuel } from '#test/actor/fixture.js';

const damaged = (applied: number, red?: true): MissionCue<'damaged'> =>
  ({
    key: 'damaged',
    tick: 0,
    data: {
      sourceId: 'g',
      targetId: 'e',
      kind: 'physical',
      amount: applied,
      applied,
      ...(red ? { red } : {}),
    },
  }) as unknown as MissionCue<'damaged'>;

describe('damage numbers', () => {
  it('shows every hit by kind, or in official mode only the red integers', () => {
    expect(damageNumberOf(damaged(41.6), false)).toMatchObject({
      text: '42',
      style: 'physical',
    });
    expect(damageNumberOf(damaged(41.6), true)).toBeNull();
    expect(damageNumberOf(damaged(41.6, true), true)).toMatchObject({
      text: '42',
      style: 'red',
    });
  });

  it('shows MISS for a miss and nothing for a plain dodge', () => {
    const dodged = (miss: boolean): MissionCue<'dodged'> => ({
      key: 'dodged',
      tick: 0,
      data: {
        sourceId: 'g',
        targetId: 'e',
        kind: 'physical',
        ...(miss ? { miss: true as const } : {}),
      },
    });
    expect(damageNumberOf(dodged(true), true)).toMatchObject({
      text: 'MISS',
      style: 'miss',
    });
    expect(damageNumberOf(dodged(false), false)).toBeNull();
  });

  it('rises over the hit unit and fades out after its life', () => {
    const stage = createMissionStage(null);
    const duel = recordDuel(40, 1000);
    const hitAt = duel.findIndex((tick) =>
      tick.events.some((event) => event.type === 'damaged'),
    );
    for (const tick of duel.slice(0, hitAt + 1)) {
      stage.dispatch({ type: 'push-snapshot', snapshot: tick.snapshot });
      for (const event of tick.events) {
        stage.dispatch({ type: 'push-event', event });
      }
      stage.update(TICK);
    }
    expect(stage.effects.live().get('mission:damage-number')).toBe(1);
    const sprite = stage.effects.layer.children.find(
      (child) => (child as Sprite).isSprite,
    ) as Sprite;
    const startY = sprite.position.y;
    stage.update(MISSION_NUMBER_MOTION.riseSeconds / 2);
    expect(sprite.position.y).toBeGreaterThan(startY);
    stage.update(MISSION_NUMBER_MOTION.seconds);
    expect(stage.effects.live().has('mission:damage-number')).toBe(false);
  });
});
