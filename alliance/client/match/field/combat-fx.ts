import {
  actorPoint,
  createBurstKind,
  createDamageNumberKind,
  createPulseKind,
  MISSION_EFFECT_CHEST,
  type MissionCueBindings,
  type MissionEffectTable,
} from 'arknights-mission-renderer';

/**
 * Master's display defaults for combat floats (`ui/gameLogic/settings.js` DEFAULT_SETTINGS): numbers on, official
 * (red-only) mode off.
 */
export const DAMAGE_NUMBERS = true;
export const OFFICIAL_DAMAGE_NUMBERS = false;

/** Gold of master's skill activation (`render/fx/limits.js` SKILL_GOLD). */
const SKILL_GOLD = 0xffd45a;

/**
 * Wires damage-number mode and the skill-activation flash onto the stage's effect table and cue bindings.
 */
export function installCombatFx(
  table: MissionEffectTable,
  bindings: MissionCueBindings,
): void {
  table.replace(createDamageNumberKind({ official: OFFICIAL_DAMAGE_NUMBERS }));
  if (!DAMAGE_NUMBERS) {
    bindings.bind('damaged', {
      effect: 'mission:hit-flash',
      sound: 'damage',
    });
    bindings.bind('heal', { effect: 'mission:heal-flash', sound: 'heal' });
    bindings.bind('dodged', { effect: null, sound: null });
  }

  table.register(
    createPulseKind({
      id: 'mission:skill-flash',
      accepts: ['skill-start'],
      anchor: (cue) => cue.data.unitId ?? null,
      shape: 'ring',
      color: SKILL_GOLD,
      seconds: 0.55,
      radius: [0.25, 1.35],
      lift: 0.02,
    }),
  );
  table.register(
    createBurstKind({
      id: 'mission:skill-burst',
      accepts: ['skill-start'],
      burst: (cue, context) => {
        const at = actorPoint(context, cue.data.unitId, MISSION_EFFECT_CHEST);
        return at
          ? {
              at,
              color: SKILL_GOLD,
              count: 8,
              life: 0.55,
              speed: 1.6,
              rise: 1.2,
            }
          : null;
      },
    }),
  );
  bindings.bind('skill-start', {
    effect: ['mission:skill-flash', 'mission:skill-burst'],
    sound: 'skill',
  });
}
