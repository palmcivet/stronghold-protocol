import * as v from 'valibot';
import {
  backendOf,
  CORE_OWNER,
  decode,
  envelope,
  type ItemSpec,
  storageKey,
} from '#infra/storage/index.js';
import { LANGUAGES } from '#infra/text/index.js';
import {
  type AUDIO_CHANNELS,
  type AudioSettings,
  DEFAULT_AUDIO,
  type DisplaySettings,
  type IdentitySettings,
  type KeysSettings,
  QUALITIES,
  TEXT_SIZES,
} from './types.js';

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

const Channel = (
  fallback: (typeof DEFAULT_AUDIO)[keyof typeof DEFAULT_AUDIO],
) =>
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

/** Monolithic personal config shape (former `wsde:device:core:settings` v2). */
const MonolithSchema = v.object({
  language: v.optional(v.picklist(LANGUAGES), 'zh-Hans'),
  name: v.optional(v.pipe(v.string(), v.maxLength(12)), ''),
  avatar: v.optional(v.pipe(v.string(), v.maxLength(64)), ''),
  quality: v.optional(v.picklist(QUALITIES), 'standard'),
  textSize: v.optional(v.picklist(TEXT_SIZES), 'sm'),
  safeAreaUi: v.optional(v.boolean(), true),
  keymap: v.optional(
    v.record(
      v.pipe(v.string(), v.maxLength(64)),
      v.pipe(v.array(v.pipe(v.string(), v.maxLength(32))), v.maxLength(4)),
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

type Monolith = v.InferOutput<typeof MonolithSchema>;

const monolithSpec: ItemSpec<Monolith> = {
  scope: 'device',
  owner: CORE_OWNER,
  key: 'settings',
  schema: MonolithSchema,
  version: 2,
  migrations: { 1: keysToKeymap },
  fallback: () => v.parse(MonolithSchema, {}),
};

export const IDENTITY_KEY = 'settings.identity';
export const DISPLAY_KEY = 'settings.display';
export const AUDIO_KEY = 'settings.audio';
export const KEYS_KEY = 'settings.keys';

function sectionStorageKey(key: string): string {
  return storageKey({ kind: 'device' }, CORE_OWNER, key);
}

function splitMonolith(data: Monolith): {
  identity: IdentitySettings;
  display: DisplaySettings;
  audio: AudioSettings;
  keys: KeysSettings;
} {
  return {
    identity: {
      language: data.language,
      name: data.name,
      avatar: data.avatar,
    },
    display: {
      quality: data.quality,
      textSize: data.textSize,
      safeAreaUi: data.safeAreaUi,
    },
    audio: {
      audio: {
        master: { ...data.audio.master },
        music: { ...data.audio.music },
        sfx: { ...data.audio.sfx },
      },
    },
    keys: { keymap: { ...data.keymap } },
  };
}

/**
 * Moves `alliance.settings` and the former monolith `wsde:device:core:settings` into the four section items
 * without losing user config. Idempotent: skips a section that already has a value.
 */
export async function migrateSettingsSections(): Promise<void> {
  const backend = backendOf('small');
  const legacyRaw = await backend.get('alliance.settings');
  const monolithRaw = await backend.get(sectionStorageKey('settings'));

  let source: unknown = null;
  if (monolithRaw !== undefined && monolithRaw !== null) {
    source = monolithRaw;
  } else if (legacyRaw !== undefined && legacyRaw !== null) {
    source = envelope(1, legacyRaw);
  }
  if (source === null) {
    return;
  }

  const decoded = decode(source, monolithSpec);
  const data = decoded.ok ? decoded.value : monolithSpec.fallback();
  const parts = splitMonolith(data);

  const writes: [string, unknown][] = [
    [IDENTITY_KEY, parts.identity],
    [DISPLAY_KEY, parts.display],
    [AUDIO_KEY, parts.audio],
    [KEYS_KEY, parts.keys],
  ];
  for (const [key, value] of writes) {
    const full = sectionStorageKey(key);
    if ((await backend.get(full)) === undefined) {
      await backend.set(full, envelope(1, value));
    }
  }

  await backend.delete(sectionStorageKey('settings'));
  await backend.delete('alliance.settings');
}

/** Gain of the music and the sound effects, 0 to 1, from the channel settings. */
export function audioGains(
  audio: Readonly<
    Record<(typeof AUDIO_CHANNELS)[number], { volume: number; muted: boolean }>
  >,
): { readonly music: number; readonly sfx: number } {
  const level = (channel: { volume: number; muted: boolean }): number =>
    channel.muted ? 0 : channel.volume / 100;
  const master = level(audio.master);
  return { music: master * level(audio.music), sfx: master * level(audio.sfx) };
}
