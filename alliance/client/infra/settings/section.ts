import type { ComponentType } from 'react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/shallow';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { type Item, persistStore } from '#infra/storage/index.js';
import type { Language } from '#infra/text/index.js';
import { definePart } from '#part/registry.js';
import { type InsertWhen, insertPart } from '#part/slot.js';
import type {
  AudioChannel,
  ChannelSetting,
  Quality,
  TextSize,
} from './types.js';
import { DEFAULT_AUDIO } from './types.js';

export const PROFILE_TABS = 'core:profile.tabs';

/** Combined personal configuration (all official sections). */
export interface SettingsState {
  readonly language: Language;
  readonly name: string;
  readonly avatar: string;
  readonly quality: Quality;
  readonly textSize: TextSize;
  readonly safeAreaUi: boolean;
  readonly keymap: Readonly<Record<string, readonly string[]>>;
  readonly audio: Readonly<Record<AudioChannel, ChannelSetting>>;
}

export interface SettingSectionDef<T extends object> {
  readonly id: string;
  readonly titleKey: `${string}:${string}`;
  readonly order: number;
  readonly when?: InsertWhen;
  /** Storage item already created with defineItem (so it joins preload). */
  readonly item: Item<T>;
  readonly Panel: ComponentType;
  /** Picks this section's fields from the aggregate store. */
  readonly pick: (state: SettingsState) => T;
  /** Writes a section value back into the aggregate. */
  readonly merge: (value: T) => Partial<SettingsState>;
  /** Side effects when the section value changes (and once at start). */
  readonly apply?: (value: T, previous: T | undefined) => void;
}

interface SectionRuntime<T extends object = object> {
  readonly def: SettingSectionDef<T>;
  stopPersist: (() => void) | null;
  stops: readonly (() => void)[];
}

const sections = new Map<string, SectionRuntime>();

/** Aggregate store shared by every section. Boot / domains may also read it. */
export const settingsStore: StoreApi<SettingsState> =
  createStore<SettingsState>(() => ({
    language: 'zh-Hans',
    name: '',
    avatar: '',
    quality: 'standard',
    textSize: 'sm',
    safeAreaUi: true,
    keymap: {},
    audio: {
      master: { ...DEFAULT_AUDIO.master },
      music: { ...DEFAULT_AUDIO.music },
      sfx: { ...DEFAULT_AUDIO.sfx },
    },
  }));

function runtimeOf<T extends object>(sectionId: string): SectionRuntime<T> {
  const runtime = sections.get(sectionId);
  if (!runtime) {
    throw new Error(`setting section ${sectionId} is not defined`);
  }
  return runtime as unknown as SectionRuntime<T>;
}

/**
 * Registers a settings section: wires defineItem storage, inserts a profile tab, and an optional apply hook.
 * Same id twice throws. Domains read and write through getSetting / setSetting / useSetting.
 */
export function defineSettingSection<T extends object>(
  def: SettingSectionDef<T>,
): () => void {
  if (sections.has(def.id)) {
    throw new Error(`setting section ${def.id} is already defined`);
  }
  const undefine = definePart(def.id, def.Panel, {
    extensible: true,
    title: def.titleKey,
  });
  const removeInsert = insertPart({
    into: PROFILE_TABS,
    id: def.id,
    order: def.order,
    ...(def.when ? { when: def.when } : {}),
  });
  const runtime: SectionRuntime<T> = {
    def,
    stopPersist: null,
    stops: [undefine, removeInsert],
  };
  sections.set(def.id, runtime as unknown as SectionRuntime);
  return () => {
    runtime.stopPersist?.();
    for (const stop of runtime.stops) {
      stop();
    }
    sections.delete(def.id);
  };
}

/** Synchronous read of a section's fields from the aggregate store. */
export function getSetting<T extends object>(sectionId: string): T {
  const { def } = runtimeOf<T>(sectionId);
  return def.pick(settingsStore.getState());
}

/** Merges a partial update into a section and the aggregate store (persisted after startSettings). */
export function setSetting<T extends object>(
  sectionId: string,
  patch: Partial<T>,
): void {
  const { def } = runtimeOf<T>(sectionId);
  const current = def.pick(settingsStore.getState());
  settingsStore.setState(def.merge({ ...current, ...patch }));
}

/** React subscription to a section (or a selected slice). */
export function useSetting<T extends object>(sectionId: string): T;
export function useSetting<T extends object, S>(
  sectionId: string,
  select: (state: T) => S,
): S;
export function useSetting<T extends object, S = T>(
  sectionId: string,
  select?: (state: T) => S,
): S {
  const { def } = runtimeOf<T>(sectionId);
  const pickSection = (state: SettingsState): S => {
    const section = def.pick(state);
    return select ? select(section) : (section as unknown as S);
  };
  return useStore(settingsStore, useShallow(pickSection));
}

/** Every registered section id, in registration order. */
export function settingSectionIds(): readonly string[] {
  return [...sections.keys()];
}

/**
 * After preload and defineSettingSection: load each item into the aggregate, persist slices, run apply.
 */
export function startSettings(): () => void {
  const stops: (() => void)[] = [];
  for (const runtime of sections.values()) {
    const { def } = runtime;
    runtime.stopPersist?.();
    settingsStore.setState(def.merge(def.item.get()));
    runtime.stopPersist = persistStore(
      settingsStore,
      def.item,
      def.pick,
      def.merge,
    );
    const { apply } = def;
    if (apply) {
      let previous: ReturnType<typeof def.pick> | undefined;
      apply(def.pick(settingsStore.getState()), undefined);
      previous = def.pick(settingsStore.getState());
      stops.push(
        settingsStore.subscribe((state) => {
          const next = def.pick(state);
          if (JSON.stringify(next) !== JSON.stringify(previous)) {
            apply(next, previous);
            previous = next;
          }
        }),
      );
    }
  }
  return () => {
    for (const stop of stops) {
      stop();
    }
    for (const runtime of sections.values()) {
      runtime.stopPersist?.();
      runtime.stopPersist = null;
    }
  };
}

/** Test helper: drop every section registration. */
export function resetSettingSections(): void {
  for (const id of [...sections.keys()]) {
    const runtime = sections.get(id);
    runtime?.stopPersist?.();
    for (const stop of runtime?.stops ?? []) {
      stop();
    }
    sections.delete(id);
  }
}
