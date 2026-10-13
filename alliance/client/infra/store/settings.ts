import * as v from 'valibot';
import { createStore } from 'zustand/vanilla';
import { LANGUAGES, type Language } from '../text/index.js';

const SETTINGS_KEY = 'alliance.settings';

export const QUALITIES = ['low', 'standard', 'high'] as const;
export type Quality = (typeof QUALITIES)[number];

/** Preparation actions a key can be bound to. */
export const KEY_ACTIONS = ['refresh', 'levelUp', 'freeze'] as const;
export type KeyAction = (typeof KEY_ACTIONS)[number];

/** `KeyboardEvent.code` of each action. */
export const DEFAULT_KEYS: Readonly<Record<KeyAction, string>> = {
  refresh: 'KeyD',
  levelUp: 'KeyF',
  freeze: 'KeyE',
};

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
  keys: v.optional(
    v.object({
      refresh: v.optional(KeyCode, DEFAULT_KEYS.refresh),
      levelUp: v.optional(KeyCode, DEFAULT_KEYS.levelUp),
      freeze: v.optional(KeyCode, DEFAULT_KEYS.freeze),
    }),
    { ...DEFAULT_KEYS },
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
  /** Chess id shown as the avatar; empty shows the initial of the name. */
  readonly avatar: string;
  readonly quality: Quality;
  readonly keys: Readonly<Record<KeyAction, string>>;
  readonly audio: Readonly<Record<AudioChannel, ChannelSetting>>;
}

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Saved settings, with defaults for what is missing or invalid. */
export function loadSettings(): SettingsState {
  let raw: unknown = {};
  try {
    raw = JSON.parse(storage()?.getItem(SETTINGS_KEY) ?? '{}');
  } catch {
    raw = {};
  }
  const parsed = v.safeParse(SettingsSchema, raw);
  return parsed.success ? parsed.output : v.parse(SettingsSchema, {});
}

export const settingsStore = createStore<SettingsState>(loadSettings);

settingsStore.subscribe((state) => {
  try {
    storage()?.setItem(SETTINGS_KEY, JSON.stringify(state));
  } catch {
    // storage is full or blocked; the settings stay for this page
  }
});

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
