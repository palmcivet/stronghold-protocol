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
  const asset = options.audioFor?.(event, type) ?? null;
  return {
    type,
    eventType: event.type,
    ...(kind ? { kind } : {}),
    ...(unitId ? { unitId } : {}),
    ...(targetId ? { targetId } : {}),
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
  if (!cue || cue.type !== 'downed' || !cue.unitId) {
    return cue;
  }
  const unit = units.find((candidate) => candidate.id === cue.unitId);
  return unit?.kind === 'device' ? { ...cue, type: 'break' } : cue;
}
