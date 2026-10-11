import { TICK } from 'arknights-mission-core';
import { Mesh, type MeshBasicMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import { createMissionHudReaders } from '#actor/hud/readout.js';
import { createMissionStage } from '#runtime/stage/index.js';
import { recordDuel } from '#test/actor/fixture.js';

describe('hud readouts', () => {
  it('draws the content readouts on the bars and seals the reader table', () => {
    const readers = createMissionHudReaders();
    readers.register({
      id: 'test:stock',
      readout: 'pips',
      read: (unit) => (unit.id === 'g' ? { left: 1, max: 3 } : null),
    });
    readers.register({
      id: 'test:debt',
      readout: 'negative',
      read: (unit) => (unit.id === 'g' ? 0.5 : null),
    });
    const stage = createMissionStage(null, { hud: readers });
    expect(readers.sealed).toBe(true);
    const [first] = recordDuel(0, 1000);
    stage.dispatch({ type: 'push-snapshot', snapshot: first!.snapshot });
    stage.update(TICK);
    expect(stage.hud.readouts('g')).toEqual({
      magazine: null,
      pips: { left: 1, max: 3 },
      negative: 0.5,
    });
    expect(stage.hud.readouts('e')).toEqual({
      magazine: null,
      pips: null,
      negative: 0,
    });
    const visible: { color: number; width: number; opacity: number }[] = [];
    stage.hud.layer.traverseVisible((child) => {
      if (!(child instanceof Mesh)) {
        return;
      }
      const material = child.material as MeshBasicMaterial;
      visible.push({
        color: material.color.getHex(),
        width: child.scale.x,
        opacity: material.opacity,
      });
    });
    expect(
      visible
        .filter((mesh) => mesh.color === 0xd02020)
        .map((mesh) => mesh.width),
    ).toEqual([0.4]);
    expect(
      visible
        .filter((mesh) => mesh.color === 0xb48cff)
        .map((mesh) => mesh.opacity),
    ).toEqual([1, 0.3, 0.3]);
  });
});
