import {
  createMissionCueBindings,
  createMissionEffectTable,
  MISSION_GROUND_IMAGE_SLOTS,
  MISSION_GROUND_MESH_SLOTS,
} from 'arknights-mission-renderer';
import { describe, expect, it } from 'vitest';
import {
  DAMAGE_NUMBERS,
  installCombatFx,
  OFFICIAL_DAMAGE_NUMBERS,
} from '#match/field/combat-fx.js';
import {
  groundArtPackOf,
  OFFICIAL_GROUND_IMAGES,
  OFFICIAL_GROUND_MESHES,
} from '#match/field/ground-art.js';

describe('combat fx defaults', () => {
  it('matches master defaults and binds the skill activation flash', () => {
    expect(DAMAGE_NUMBERS).toBe(true);
    expect(OFFICIAL_DAMAGE_NUMBERS).toBe(false);
    const table = createMissionEffectTable();
    const cues = createMissionCueBindings();
    installCombatFx(table, cues);
    expect(table.has('mission:damage-number')).toBe(true);
    expect(table.has('mission:skill-flash')).toBe(true);
    expect(table.has('mission:skill-burst')).toBe(true);
    expect(cues.get('skill-start')?.effect).toEqual([
      'mission:skill-flash',
      'mission:skill-burst',
    ]);
  });
});

describe('official ground pack', () => {
  it('lists every renderer image and mesh slot with an official key', () => {
    for (const slot of MISSION_GROUND_IMAGE_SLOTS) {
      expect(OFFICIAL_GROUND_IMAGES[slot]).toMatch(/^(texture|image):/);
    }
    for (const slot of MISSION_GROUND_MESH_SLOTS) {
      expect(OFFICIAL_GROUND_MESHES[slot]).toMatch(/^model:/);
    }
    const pack = groundArtPackOf(null);
    expect(pack.images.diffuse).toBe('image:alliance/ground/diffuse');
    expect(pack.images.normal).toBe(OFFICIAL_GROUND_IMAGES.normal);
    expect(pack.meshes?.crate).toBe(OFFICIAL_GROUND_MESHES.crate);
  });
});
