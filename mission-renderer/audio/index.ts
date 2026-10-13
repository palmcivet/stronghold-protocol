import type { AssetKey } from 'arknights-assets-catalog';
import type { BattleEvent, UnitSnapshot } from 'arknights-mission-core';
import type { MissionAudioCue, MissionAudioCueType } from '#contract/audio.js';
import type { MissionCueBase, MissionCueKind } from '#contract/cue.js';
import { eventBindingOf, type MissionCueBindings } from '#effect/binding.js';
import { cueFor } from '#effect/cue.js';

export type EffectAudioFor = (
  event: BattleEvent,
  type: MissionAudioCueType,
) => AssetKey | null;

export interface MissionAudioCueOptions {
  /** Asset key of a cue, chosen by the caller. */
  readonly audioFor?: EffectAudioFor;
  /** Bindings that give each cue key its sound. Defaults to the core event bindings. */
  readonly bindings?: Pick<MissionCueBindings, 'get'>;
}

function stringValue(data: unknown, key: string): string | undefined {
  const value = (data as Readonly<Record<string, unknown>>)[key];
  return typeof value === 'string' ? value : undefined;
}

function numberValue(data: unknown, key: string): number | undefined {
  const value = (data as Readonly<Record<string, unknown>>)[key];
  return typeof value === 'number' ? value : undefined;
}

/** The audio cue of a battle event, or null when the event has no sound or no binding. */
export function audioCueFor(
  event: BattleEvent,
  options: MissionAudioCueOptions = {},
): MissionAudioCue | null {
  const cue = cueFor(event);
  const type =
    (options.bindings ? options.bindings.get(cue.key) : eventBindingOf(cue.key))
      ?.sound ?? null;
  if (!type) {
    return null;
  }
  const kind =
    event.type === 'cue'
      ? ((event.data as MissionCueBase).kind as MissionCueKind)
      : undefined;
  const unitId = stringValue(event.data, 'unitId');
  const targetId = stringValue(event.data, 'targetId');
  const skillSlot = numberValue(event.data, 'skillSlot');
  const asset = options.audioFor?.(event, type) ?? null;
  return {
    type,
    eventType: event.type,
    ...(kind ? { kind } : {}),
    ...(unitId ? { unitId } : {}),
    ...(targetId ? { targetId } : {}),
    ...(skillSlot !== undefined ? { skillSlot } : {}),
    ...(asset ? { asset } : {}),
  };
}

/**
 * The audio cue of an event. A stage device going down breaks apart instead of falling, so its `downed` cue is a
 * `break` cue; `units` is the current frame, where the unit's kind is read.
 */
export function effectCueFor(
  event: BattleEvent,
  units: readonly UnitSnapshot[],
  options: MissionAudioCueOptions = {},
): MissionAudioCue | null {
  const cue = audioCueFor(event, options);
  if (cue?.type !== 'downed' || !cue.unitId) {
    return cue;
  }
  const unit = units.find((candidate) => candidate.id === cue.unitId);
  return unit?.kind === 'device' ? { ...cue, type: 'break' } : cue;
}

/** Held skill cues at most, one per unit. */
export const SKILL_HOLD_LIMIT = 64;

/**
 * Holds a skill cue whose unit the view does not know yet, and plays it once when the unit appears. A cast made on
 * deployment can reach the view before the unit does; without the hold that first cast stays silent.
 */
export interface SkillCueHold {
  /** The cue to play now, or null when it is held for a unit the view does not know yet. */
  pass(
    cue: MissionAudioCue,
    known: (unitId: string) => boolean,
  ): MissionAudioCue | null;
  /** Held cues of units now known, each once. */
  release(known: (unitId: string) => boolean): MissionAudioCue[];
  /** Drops every held cue. Call it before the units of a new field are tracked. */
  clear(): void;
  readonly size: number;
}

export function createSkillCueHold(limit = SKILL_HOLD_LIMIT): SkillCueHold {
  const held = new Map<string, MissionAudioCue>();
  return {
    pass(cue, known) {
      if (cue.type !== 'skill' || !cue.unitId || known(cue.unitId)) {
        return cue;
      }
      held.delete(cue.unitId);
      held.set(cue.unitId, cue);
      while (held.size > limit) {
        const oldest = held.keys().next().value;
        if (oldest === undefined) {
          break;
        }
        held.delete(oldest);
      }
      return null;
    },
    release(known) {
      const out: MissionAudioCue[] = [];
      for (const [unitId, cue] of held) {
        if (known(unitId)) {
          out.push(cue);
          held.delete(unitId);
        }
      }
      return out;
    },
    clear() {
      held.clear();
    },
    get size() {
      return held.size;
    },
  };
}
