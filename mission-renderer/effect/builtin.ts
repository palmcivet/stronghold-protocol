import { createDamageNumberKind } from '#effect/number.js';
import { createPulseKind } from '#effect/pulse.js';
import {
  actorPoint,
  createBurstKind,
  createProjectileKind,
  MISSION_EFFECT_CHEST,
} from '#effect/shape.js';
import type { MissionEffectKind } from '#effect/table.js';

/** A flash under a unit that takes damage. */
const HIT_FLASH = createPulseKind({
  id: 'mission:hit-flash',
  accepts: ['damaged'],
  anchor: (cue) => (cue.data.applied > 0 ? cue.data.targetId : null),
  shape: 'disc',
  color: 0xff6040,
  seconds: 0.2,
  radius: [0.15, 0.35],
  lift: 0.02,
});

/** A flash under a unit that is healed. */
const HEAL_FLASH = createPulseKind({
  id: 'mission:heal-flash',
  accepts: ['heal'],
  anchor: (cue) => (cue.data.amount > 0 ? cue.data.unitId : null),
  shape: 'disc',
  color: 0x60ff90,
  seconds: 0.35,
  radius: [0.2, 0.4],
  lift: 0.02,
});

/** A ring spreading from a unit as it is deployed. */
const DEPLOY_RING = createPulseKind({
  id: 'mission:deploy-ring',
  accepts: ['deploy'],
  anchor: (cue) => cue.data.unitId,
  shape: 'ring',
  color: 0x9fd8ff,
  seconds: 0.5,
  radius: [0.2, 0.6],
  lift: 0.01,
});

/** Colour of a hit spark by damage kind, as master's impacts. */
export const MISSION_SPARK_COLORS: Readonly<Record<string, number>> =
  Object.freeze({ physical: 0xfff0d0, arts: 0xc77dff, true: 0xffffff });

/** Colour of an element burst by element, as master. */
export const MISSION_ELEMENT_COLORS: Readonly<Record<string, number>> =
  Object.freeze({
    burn: 0xff7a33,
    neural: 0xff5ad0,
    necrosis: 0x9dff6a,
    apoptosis: 0x9dff6a,
    erosion: 0x6fe0ff,
  });

/** A few sparks on a unit's body as a hit lands. */
const HIT_SPARK = createBurstKind({
  id: 'mission:hit-spark',
  accepts: ['hit'],
  burst: (cue, context) => {
    const at = cue.data.cancel
      ? undefined
      : actorPoint(context, cue.data.targetId, MISSION_EFFECT_CHEST);
    return at
      ? {
          at,
          color: MISSION_SPARK_COLORS[cue.data.kind] ?? 0xd0a0ff,
          count: 4,
          life: 0.25,
          speed: 2.4,
        }
      : null;
  },
});

/** A shot flying from the shooter to its target. */
const PROJECTILE = createProjectileKind();

/** Motes rising off a unit that leaves the field, as master's death: warm for an enemy, mint for an ally. */
const DEATH_DISSOLVE = createBurstKind({
  id: 'mission:death-dissolve',
  accepts: ['removed'],
  burst: (cue, context) => {
    const actor = context.actors.get(cue.data.unitId);
    const at = actorPoint(context, cue.data.unitId, MISSION_EFFECT_CHEST);
    return actor && at && actor.kind !== 'device'
      ? {
          at,
          color: actor.unit.side === 'enemy' ? 0xff7a52 : 0xbfeee2,
          count: 12,
          life: 0.95,
          speed: 0.3,
          rise: 0.8,
          size: 0.06,
        }
      : null;
  },
});

/** Crate and turret debris as a device is destroyed: wood shards, or grey ones for a turret, as master. */
const SHATTER = createBurstKind({
  id: 'mission:shatter',
  accepts: ['removed'],
  burst: (cue, context) => {
    const actor = context.actors.get(cue.data.unitId);
    const at = actorPoint(context, cue.data.unitId, 0.35);
    return actor && at && actor.kind === 'device'
      ? {
          at,
          color: actor.unit.attackRange.length > 0 ? 0x6c777d : 0xc89a5a,
          count: 10,
          life: 0.6,
          speed: 1.1,
          rise: 1.2,
          gravity: 4,
          size: 0.1,
          additive: false,
        }
      : null;
  },
});

/** A flash at a turret's barrel as it fires, as master: 0.42 tiles out towards the target. */
const MUZZLE_FLASH = createBurstKind({
  id: 'mission:muzzle-flash',
  accepts: ['attack'],
  burst: (cue, context) => {
    const actor = context.actors.get(cue.data.unitId);
    if (actor?.kind !== 'device') {
      return null;
    }
    const recoil = actor.recoil;
    const at = actorPoint(context, cue.data.unitId, MISSION_EFFECT_CHEST);
    return at
      ? {
          at: { ...at, x: at.x + recoil.x * 0.42, y: at.y + recoil.y * 0.42 },
          color: 0xfff0c0,
          count: 3,
          life: 0.1,
          speed: 0.5,
          size: 0.16,
        }
      : null;
  },
});

/** A burst of an element's colour on the unit whose element bar bursts. */
const ELEMENT_BURST = createBurstKind({
  id: 'mission:element-burst',
  accepts: ['element-burst'],
  burst: (cue, context) => {
    const at = actorPoint(context, cue.data.targetId, MISSION_EFFECT_CHEST);
    return at
      ? {
          at,
          color: MISSION_ELEMENT_COLORS[cue.data.element] ?? 0xd0a0ff,
          count: 12,
          life: 0.5,
          speed: 3,
        }
      : null;
  },
});

/** Damage, heal and MISS numbers over the unit. */
const DAMAGE_NUMBER = createDamageNumberKind();

/** The engine's effect kinds, registered in every new effect table. */
export const MISSION_EFFECT_KINDS: readonly MissionEffectKind[] = Object.freeze(
  [
    HIT_FLASH,
    HEAL_FLASH,
    DEPLOY_RING,
    DAMAGE_NUMBER,
    HIT_SPARK,
    PROJECTILE,
    DEATH_DISSOLVE,
    SHATTER,
    MUZZLE_FLASH,
    ELEMENT_BURST,
  ] as unknown as MissionEffectKind[],
);
