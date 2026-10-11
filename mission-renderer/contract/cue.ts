import type {
  BattleEventType,
  CueEvent,
  CueMap,
  EventData,
} from 'arknights-mission-core';
import type { MissionAudioCueType } from '#contract/audio.js';

/** Cue kinds declared on the core `CueMap` by content and mods. */
export type MissionCueKind = keyof CueMap & string;

/** Battle events keyed by their type. A `cue` event is keyed by its kind instead. */
export type MissionEventCueKey = Exclude<BattleEventType, 'cue'>;

/** Key of a declared cue kind. */
export type MissionKindCueKey = `cue:${MissionCueKind}`;

/**
 * What an effect or a sound answers to: a core battle event (kebab-case, no colon), `cue:<kind>` for a `cue` event,
 * or `<namespace>:<event>` for an event a mod adds.
 */
export type MissionCueKey = MissionEventCueKey | `${string}:${string}`;

/** Fields every `cue` event carries. */
export interface MissionCueBase {
  readonly kind: string;
  readonly unitId?: string;
  readonly x?: number;
  readonly y?: number;
}

/** Data a cue carries: the event data, the `cue` event of that kind, or an untyped record for a mod event. */
export type MissionCueData<K extends MissionCueKey> =
  K extends MissionEventCueKey
    ? EventData<K>
    : K extends `cue:${infer C}`
      ? C extends MissionCueKind
        ? Extract<CueEvent, { readonly kind: C }>
        : MissionCueBase & Readonly<Record<string, unknown>>
      : Readonly<Record<string, unknown>>;

/** A battle event seen by the view, keyed for the cue bindings. Narrows by `key`. */
export type MissionCue<K extends MissionCueKey = MissionCueKey> = {
  [P in K]: {
    readonly key: P;
    readonly tick: number;
    readonly data: MissionCueData<P>;
  };
}[K];

/** Namespaced effect kind id, `<namespace>:<name>`. The engine's kinds use `mission:`. */
export type MissionEffectKindId = `${string}:${string}`;

/** What a cue draws and plays. Null marks a cue that draws no effect, or plays no sound, on purpose. */
export interface MissionCueBinding {
  readonly effect: MissionEffectKindId | null;
  readonly sound: MissionAudioCueType | null;
}

/** A binding for every core battle event. */
export type MissionEventBindings = {
  readonly [K in MissionEventCueKey]: MissionCueBinding;
};
