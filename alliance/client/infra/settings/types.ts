import * as v from 'valibot';
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

export const ChannelSchema = (fallback: ChannelSetting) =>
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

export interface IdentitySettings {
  readonly language: Language;
  readonly name: string;
  readonly avatar: string;
}

export interface DisplaySettings {
  readonly quality: Quality;
  readonly textSize: TextSize;
  /** When on, HUD insets into env(safe-area-inset-*); the map stays full-bleed. */
  readonly safeAreaUi: boolean;
}

export interface AudioSettings {
  readonly audio: Readonly<Record<AudioChannel, ChannelSetting>>;
}

export interface KeysSettings {
  /** Keys the player changed, by action id (see `#infra/intent/keymap`). */
  readonly keymap: Readonly<Record<string, readonly string[]>>;
}

export const IdentitySchema = v.object({
  language: v.optional(v.picklist(LANGUAGES), 'zh-Hans'),
  name: v.optional(v.pipe(v.string(), v.maxLength(12)), ''),
  avatar: v.optional(v.pipe(v.string(), v.maxLength(64)), ''),
});

export const DisplaySchema = v.object({
  quality: v.optional(v.picklist(QUALITIES), 'standard'),
  textSize: v.optional(v.picklist(TEXT_SIZES), 'sm'),
  safeAreaUi: v.optional(v.boolean(), true),
});

export const AudioSchema = v.object({
  audio: v.optional(
    v.object({
      master: ChannelSchema(DEFAULT_AUDIO.master),
      music: ChannelSchema(DEFAULT_AUDIO.music),
      sfx: ChannelSchema(DEFAULT_AUDIO.sfx),
    }),
    {
      master: { ...DEFAULT_AUDIO.master },
      music: { ...DEFAULT_AUDIO.music },
      sfx: { ...DEFAULT_AUDIO.sfx },
    },
  ),
});

export const KeysSchema = v.object({
  keymap: v.optional(
    v.record(
      v.pipe(v.string(), v.maxLength(64)),
      v.pipe(v.array(KeyCode), v.maxLength(4)),
    ),
    {},
  ),
});

/** Mission-renderer ground quality is only high|low. */
export type GroundQuality = 'high' | 'low';

/** Maps a settings quality step onto the renderer. `standard` uses high. */
export function groundQualityOf(quality: Quality): GroundQuality {
  return quality === 'low' ? 'low' : 'high';
}
