import * as v from 'valibot';
import { createStore } from 'zustand/vanilla';
import { CORE_OWNER, defineItem } from '#infra/storage/index.js';
import { LANGUAGES, type Language } from '#infra/text/index.js';

export const QUALITIES = ['low', 'standard', 'high'] as const;
export type Quality = (typeof QUALITIES)[number];

/** Steps of the interface text size; the field keeps its own scale. */
export const TEXT_SIZES = ['sm', 'md', 'lg', 'xl'] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

const KeyCode = v.pipe(v.string(), v.maxLength(32));

/** Volume channels. `master` scales the other two. */
export const AUDIO_CHANNELS = ['master', 'music', 'sfx'] as const;
export type AudioChannel = (typeof AUDIO_CHANNELS)[number];

/** Volume of a channel, 0 to 100, and whether it is muted. */
export interface ChannelSetting {
  readonly volume: number;
  readonly muted: boolean;
}

export const DEFAULT_AUDIO: Readonly<Record<AudioChannel, ChannelSetting>> = {
  master: { volume: 80, muted: false },
  music: { volume: 60, muted: false },
  sfx: { volume: 80, muted: false },
};

const Channel = (fallback: ChannelSetting) =>
  v.optional(
    v.object({
      volume: v.optional(
        v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(100)),
        fallback.volume,
      ),
      muted: v.optional(v.boolean(), fallback.muted),
    }),
    { ...fallback },
  );

const SettingsSchema = v.object({
  language: v.optional(v.picklist(LANGUAGES), 'zh-Hans'),
  name: v.optional(v.pipe(v.string(), v.maxLength(12)), ''),
  avatar: v.optional(v.pipe(v.string(), v.maxLength(64)), ''),
  quality: v.optional(v.picklist(QUALITIES), 'standard'),
  textSize: v.optional(v.picklist(TEXT_SIZES), 'sm'),
  // the old `keys` table is turned into overrides by the version 1 migration below
  keymap: v.optional(
    v.record(
      v.pipe(v.string(), v.maxLength(64)),
      v.pipe(v.array(KeyCode), v.maxLength(4)),
    ),
    {},
  ),
  audio: v.optional(
    v.object({
      master: Channel(DEFAULT_AUDIO.master),
      music: Channel(DEFAULT_AUDIO.music),
      sfx: Channel(DEFAULT_AUDIO.sfx),
    }),
    {
      master: { ...DEFAULT_AUDIO.master },
      music: { ...DEFAULT_AUDIO.music },
      sfx: { ...DEFAULT_AUDIO.sfx },
    },
  ),
});

/** Personal configuration. It stays in this browser and never reaches the server. */
export interface SettingsState {
  readonly language: Language;
  /** Code name remembered for the entry page. */
  readonly name: string;
  /** Asset key of the avatar image; empty shows the initial of the name. */
  readonly avatar: string;
  readonly quality: Quality;
  readonly textSize: TextSize;
  /** Keys the player changed, by action id (see `#infra/intent/keymap`). */
  readonly keymap: Readonly<Record<string, readonly string[]>>;
  readonly audio: Readonly<Record<AudioChannel, ChannelSetting>>;
}

/** The keys of the old table (`keys`, before the key map) and the defaults it shipped with. */
const OLD_KEYS: Readonly<Record<string, readonly [string, string]>> = {
  refresh: ['core:refresh', 'KeyD'],
  levelUp: ['core:levelUp', 'KeyF'],
  freeze: ['core:freeze', 'KeyE'],
};

/**
 * Version 1 is the old `alliance.settings` with its full `keys` table. A key the player changed from the old
 * default becomes an override; an old default is dropped, so the new defaults (R, D, F) apply.
 */
export function keysToKeymap(data: unknown): unknown {
  if (typeof data !== 'object' || data === null) {
    return data;
  }
  const { keys, ...rest } = data as { keys?: unknown } & Record<
    string,
    unknown
  >;
  const keymap: Record<string, string[]> = {};
  if (typeof keys === 'object' && keys !== null) {
    for (const [action, code] of Object.entries(keys)) {
      const old = OLD_KEYS[action];
      if (old && typeof code === 'string' && code !== old[1]) {
        keymap[old[0]] = [code];
      }
    }
  }
  return { ...rest, keymap };
}

/** The settings item: on this device, owned by the core. */
export const settingsItem = defineItem<SettingsState>({
  scope: 'device',
  owner: CORE_OWNER,
  key: 'settings',
  schema: SettingsSchema,
  version: 2,
  migrations: { 1: keysToKeymap },
  fallback: () => v.parse(SettingsSchema, {}),
});

/** The saved settings, from the preloaded snapshot. */
export function loadSettings(): SettingsState {
  return settingsItem.get();
}

export const settingsStore = createStore<SettingsState>(loadSettings);

/** Gain of the music and the sound effects, 0 to 1, from the channel settings. */
export function audioGains(
  audio: Readonly<Record<AudioChannel, ChannelSetting>>,
): { readonly music: number; readonly sfx: number } {
  const level = (channel: ChannelSetting): number =>
    channel.muted ? 0 : channel.volume / 100;
  const master = level(audio.master);
  return { music: master * level(audio.music), sfx: master * level(audio.sfx) };
}

/** Changes one volume channel and keeps the others. */
export function setChannel(
  channel: AudioChannel,
  change: Partial<ChannelSetting>,
): void {
  const { audio } = settingsStore.getState();
  settingsStore.setState({
    audio: { ...audio, [channel]: { ...audio[channel], ...change } },
  });
}
