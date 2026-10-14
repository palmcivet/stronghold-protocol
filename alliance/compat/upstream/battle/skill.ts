/**
 * Master chess / enemy skill records → mission-core `SkillSpec`. Attribute mods that core already understands are
 * inlined; custom triggers and blackboard hooks stay for content modules (skill kits).
 */
import type {
  SkillModifier,
  SkillSpec,
  TileCoord,
} from 'arknights-mission-core';
import type { CombatSkillSource } from '#data/view/combat-def.js';

export type { CombatSkillSource };

const BUILTIN_TRIGGERS = new Set([
  'DEFAULT',
  'ACTIVE_RANGE',
  'SKILL_RANGE',
  'TAKE_DAMAGE',
  'SP_FULL',
  'ALWAYS',
  'CUSTOM_RANGE',
  'SEARCH',
  'GDGLOW_SKILL_2',
  'NEVER',
  'MANUAL',
]);

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Master `rangeGrid` cell → mission-core tile offset (same convention as combat-def attack range). */
function cellsOf(value: unknown): readonly TileCoord[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((cell): TileCoord[] => {
    if (!Array.isArray(cell) || cell.length < 2) {
      return [];
    }
    const x = cell[0];
    const y = cell[1];
    if (typeof x !== 'number' || typeof y !== 'number') {
      return [];
    }
    return [{ x, y }];
  });
}

function spTypeOf(raw: unknown): 'time' | 'attack' | 'hurt' | 'none' {
  switch (raw) {
    case 'INCREASE_WHEN_ATTACK':
      return 'attack';
    case 'INCREASE_WHEN_TAKEN_DAMAGE':
      return 'hurt';
    case 'ON_DEPLOY':
    case 'NONE':
    case 'none':
      return 'none';
    default:
      return 'time';
  }
}

function triggerOf(raw: unknown): string {
  if (!isRecord(raw) || typeof raw.rule !== 'string') {
    return 'DEFAULT';
  }
  const rule = raw.rule;
  if (rule === 'ALWAYS') {
    return 'SP_FULL';
  }
  if (rule === 'MANUAL') {
    return 'NEVER';
  }
  if (BUILTIN_TRIGGERS.has(rule)) {
    return rule;
  }
  // Custom content triggers need a skill-kit module; do not auto-cast until one is installed.
  return 'NEVER';
}

function bodyOf(
  skillType: unknown,
  durationType: unknown,
  duration: number,
  ammo: number,
): { readonly body: string; readonly ammo: number; readonly duration: number } {
  if (skillType === 'PASSIVE') {
    return { body: 'passive', ammo: 0, duration: 0 };
  }
  if (durationType === 'AMMO' || durationType === 'ammo') {
    return {
      body: 'ammo',
      ammo: Math.max(1, ammo),
      duration: Math.max(0, duration),
    };
  }
  if (durationType === 'TOGGLE' || durationType === 'toggle') {
    return { body: 'toggle', ammo: 0, duration: 0 };
  }
  if (duration > 0) {
    return { body: 'duration', ammo: 0, duration };
  }
  return { body: 'instant', ammo: 0, duration: 0 };
}

/**
 * Flat blackboard keys core can apply as skill attribute mods while the skill is active. Everything else stays in
 * `script` for content modules.
 */
function modsOf(
  bb: Readonly<Record<string, unknown>>,
): readonly SkillModifier[] {
  const mods: SkillModifier[] = [];
  const push = (
    key: string,
    attribute: string,
    op: SkillModifier['op'],
  ): void => {
    const value = bb[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      mods.push({ attribute, op, value });
    }
  };
  push('atk', 'atk', 'percent');
  push('def', 'def', 'percent');
  push('max_hp', 'hp', 'percent');
  push('magic_resistance', 'res', 'percent');
  push('base_attack_time', 'atkInterval', 'add');
  push('attack_speed', 'attackSpeed', 'add');
  push('block_cnt', 'block', 'add');
  push('move_speed', 'moveSpeed', 'percent');
  return mods;
}

/** Script facts content modules may read; only JSON-safe scalars. */
function scriptOf(
  bb: Readonly<Record<string, unknown>>,
  rawTrigger: string | null,
): Readonly<Record<string, string | number | boolean>> {
  const out: Record<string, string | number | boolean> = {};
  if (rawTrigger) {
    out.triggerRule = rawTrigger;
  }
  for (const [key, value] of Object.entries(bb)) {
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      out[key] = value;
    }
  }
  return out;
}

/**
 * One mission-core skill of a chess skill record, or null when there is no usable skill id.
 */
export function skillSpecOf(
  raw: CombatSkillSource | null | undefined,
  options: { readonly heal?: boolean } = {},
): SkillSpec | null {
  if (!raw || typeof raw.skillId !== 'string' || !raw.skillId) {
    return null;
  }
  const bb = isRecord(raw.bb) ? raw.bb : {};
  const ammo = Math.max(
    0,
    Math.trunc(num(bb['attack@trigger_time'], num(bb.ammo, 0))),
  );
  const duration = Math.max(0, num(raw.duration, 0));
  const shaped = bodyOf(raw.skillType, raw.durationType, duration, ammo);
  const triggerRange = cellsOf(
    isRecord(raw.trigger) ? raw.trigger.customRangeGrid : null,
  );
  const skillRange = cellsOf(raw.rangeGrid);
  const mods = modsOf(bb);
  return {
    id: raw.skillId,
    body: shaped.body,
    trigger: triggerOf(raw.trigger),
    spCost: Math.max(0, num(raw.spCost, 0)),
    duration: shaped.duration,
    ammo: shaped.ammo,
    spType: spTypeOf(raw.spType),
    initSp: Math.max(0, num(raw.initSp, 0)),
    charges: Math.max(1, Math.trunc(num(raw.maxChargeTime, 1))),
    operation: raw.skillType === 'AUTO' ? 'AUTO' : 'MANUAL',
    ...(options.heal ? { heal: true as const } : {}),
    ...(mods.length ? { mods } : {}),
    ...(triggerRange.length
      ? { triggerRange }
      : skillRange.length
        ? { triggerRange: skillRange }
        : {}),
  };
}

/** Blackboard scalars for `UnitSpec.script` from the same skill record. */
export function skillScriptOf(
  raw: CombatSkillSource | null | undefined,
): Readonly<Record<string, string | number | boolean>> {
  if (!raw) {
    return {};
  }
  const bb = isRecord(raw.bb) ? raw.bb : {};
  const triggerRaw =
    isRecord(raw.trigger) && typeof raw.trigger.rule === 'string'
      ? raw.trigger.rule
      : null;
  return scriptOf(bb, triggerRaw);
}
