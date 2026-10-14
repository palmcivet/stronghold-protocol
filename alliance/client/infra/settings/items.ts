import * as v from 'valibot';
import { CORE_OWNER, defineItem } from '#infra/storage/index.js';
import { AUDIO_KEY, DISPLAY_KEY, IDENTITY_KEY, KEYS_KEY } from './migrate.js';
import {
  AudioSchema,
  type AudioSettings,
  DisplaySchema,
  type DisplaySettings,
  IdentitySchema,
  type IdentitySettings,
  KeysSchema,
  type KeysSettings,
} from './types.js';

/** Official section items; importing this module joins them to preload. */
export const identityItem = defineItem<IdentitySettings>({
  scope: 'device',
  owner: CORE_OWNER,
  key: IDENTITY_KEY,
  schema: IdentitySchema,
  version: 1,
  fallback: () => v.parse(IdentitySchema, {}),
});

export const displayItem = defineItem<DisplaySettings>({
  scope: 'device',
  owner: CORE_OWNER,
  key: DISPLAY_KEY,
  schema: DisplaySchema,
  version: 1,
  fallback: () => v.parse(DisplaySchema, {}),
});

export const audioItem = defineItem<AudioSettings>({
  scope: 'device',
  owner: CORE_OWNER,
  key: AUDIO_KEY,
  schema: AudioSchema,
  version: 1,
  fallback: () => v.parse(AudioSchema, {}),
});

export const keysItem = defineItem<KeysSettings>({
  scope: 'device',
  owner: CORE_OWNER,
  key: KEYS_KEY,
  schema: KeysSchema,
  version: 1,
  fallback: () => v.parse(KeysSchema, {}),
});
