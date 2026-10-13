import { TICK } from 'arknights-mission-core';
import { describe, expect, it } from 'vitest';
import { createMissionCueBindings } from '#effect/binding.js';
import {
  installOfficialFx,
  OFFICIAL_FX,
  OFFICIAL_FX_RECIPES,
  OFFICIAL_FX_SCREEN,
  officialFxEffects,
  officialTilesAround,
  officialWallTiles,
} from '#effect/official.js';
import { createMissionEffectTable } from '#effect/table.js';
import { createMissionStage } from '#runtime/stage/index.js';
import { recordDuel } from '#test/actor/fixture.js';
import { defined } from '#test/defined.js';

describe('official fx', () => {
  it("lists master's 179 fx kinds once each, in kebab-case, every archetype with a shape", () => {
    const kinds = Object.keys(OFFICIAL_FX);
    expect(kinds).toHaveLength(179);
    for (const kind of kinds) {
      expect(kind).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      const archetype = defined(OFFICIAL_FX[kind]).archetype;
      expect(archetype === 'none' || archetype in OFFICIAL_FX_RECIPES).toBe(
        true,
      );
    }
    expect(OFFICIAL_FX['chen3-wave']).toEqual({
      archetype: 'qi',
      color: 0xdfe8ff,
      point: true,
    });
    expect(OFFICIAL_FX.bombard).toEqual({
      archetype: 'blast',
      color: 0xffa04a,
      radius: 1.5,
      point: true,
      heavy: true,
    });
    expect(OFFICIAL_FX.telegraph).toEqual({
      archetype: 'telegraph',
      color: 0xff3b30,
      seconds: 1.2,
    });
  });

  it('binds every kind, the ones master draws nothing for to null, and the stage seals the result', () => {
    const table = createMissionEffectTable();
    const cues = createMissionCueBindings();
    installOfficialFx(table, cues);
    expect(cues.declared()).toEqual(Object.keys(OFFICIAL_FX));
    expect(cues.get('cue:hit-cap')?.effect).toBeNull();
    expect(cues.get('cue:doll-end')?.effect).toBeNull();
    expect(cues.get('cue:blast')?.effect).toEqual([
      'official-fx:zone',
      'official-fx:burst',
      'official-fx:veil',
    ]);
    expect(officialFxEffects('lightning')).toEqual([
      'official-fx:beam',
      'official-fx:burst',
    ]);
    expect(() =>
      createMissionStage(null, { effects: table, cues }),
    ).not.toThrow();
  });

  it('draws a cue on its unit, a beam between two units, and a warning ring for its duration', () => {
    const table = createMissionEffectTable();
    const cues = createMissionCueBindings();
    installOfficialFx(table, cues);
    const stage = createMissionStage(null, { effects: table, cues });
    const [first] = recordDuel(0, 1000);
    stage.dispatch({
      type: 'push-snapshot',
      snapshot: defined(first).snapshot,
    });
    stage.dispatch({ type: 'set-speed', speed: 2 });
    stage.update(TICK);
    const cue = (kind: string, data: Record<string, unknown>) =>
      stage.dispatch({
        type: 'push-event',
        event: { tick: 0, type: 'cue', data: { kind, ...data } } as never,
      });
    cue('crit', { unitId: 'e' });
    cue('lightning', { unitId: 'g', from: 'g', to: 'e' });
    cue('telegraph', { x: 1, y: 0, r: 1, dur: 2 });
    cue('hit-cap', { unitId: 'e' });
    stage.update(0);
    const live = stage.effects.live();
    expect(live.get('official-fx:burst')).toBe(1);
    expect(live.get('official-fx:beam')).toBe(1);
    expect(live.get('official-fx:zone')).toBe(1);
    // 2 game seconds at 2× is one real second
    stage.update(0.9);
    expect(stage.effects.live().get('official-fx:zone')).toBe(1);
    stage.update(0.2);
    expect(stage.effects.live().has('official-fx:zone')).toBe(false);
  });

  it('flashes the screen for a field-wide blast, lights warning tiles and wall lines, snows for cold, and slashes for qi', () => {
    const table = createMissionEffectTable();
    const cues = createMissionCueBindings();
    installOfficialFx(table, cues);
    const stage = createMissionStage(null, { effects: table, cues });
    const [first] = recordDuel(0, 1000);
    if (!first) {
      throw new Error('the duel recorded no sample');
    }
    const { snapshot } = first;
    stage.dispatch({ type: 'push-snapshot', snapshot: snapshot });
    stage.dispatch({ type: 'set-speed', speed: 1 });
    stage.update(TICK);
    const cue = (kind: string, data: Record<string, unknown>) =>
      stage.dispatch({
        type: 'push-event',
        event: { tick: 0, type: 'cue', data: { kind, ...data } } as never,
      });
    cue('blast', { x: 1, y: 0, r: OFFICIAL_FX_SCREEN.radius });
    stage.update(0);
    expect([...stage.effects.live().keys()]).toEqual(['official-fx:veil']);
    stage.update(1);
    cue('telegraph', { x: 1, y: 0, r: 1, tiles: 'box' });
    cue('firewall', { x: 3, y: 2, axis: 'row' });
    stage.update(0);
    expect(stage.effects.live().get('official-fx:tiles')).toBe(2);
    expect(stage.effects.live().has('official-fx:zone')).toBe(true);
    stage.update(5);
    cue('cold-wind', {});
    cue('chen3-wave', { x: 1, y: 0, fromX: 0, fromY: 0, dr: 0, dc: 1 });
    stage.update(0);
    const live = stage.effects.live();
    expect(live.get('official-fx:veil')).toBe(1);
    expect(live.get('official-fx:snow')).toBe(1);
    expect(live.get('official-fx:slash')).toBe(1);
    expect(live.has('official-fx:burst')).toBe(false);
  });

  it('picks warning tiles and wall lines as master', () => {
    expect(officialTilesAround(2, 3, 1, 'box')).toHaveLength(9);
    expect(officialTilesAround(2, 3, 1, true)).toHaveLength(5);
    expect(
      officialTilesAround(0, 0, 9, [
        [1, 2],
        ['x', 3],
        [4, 5],
      ]),
    ).toEqual([
      [1, 2],
      [4, 5],
    ]);
    expect(officialWallTiles(3.4, 2, 'col')).toEqual([
      [0, 3],
      [1, 3],
      [2, 3],
      [3, 3],
      [4, 3],
      [5, 3],
      [6, 3],
    ]);
    expect(officialWallTiles(10, 5, 'row')).toHaveLength(9);
    const field = { x: 1, y: 2, width: 6, height: 3 };
    expect(officialWallTiles(3, 3, 'col', field)).toEqual([
      [2, 3],
      [3, 3],
      [4, 3],
    ]);
    expect(officialWallTiles(3, 3, 'row', field)).toHaveLength(6);
  });
});
