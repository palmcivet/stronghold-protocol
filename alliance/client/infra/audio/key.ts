import type { ResourceRefs } from '@alliance/data/refs';
import {
  type AssetKey,
  type AssetResolver,
  type AudioSource,
  assetKindOf,
  audioSource,
} from 'arknights-assets-catalog';

const audioOnly = (key: AssetKey | undefined): AssetKey | null =>
  key !== undefined && assetKindOf(key) === 'audio' ? key : null;

/** `audio:` key of a sound effect of a group (`battle`, `ui`, `autochess`). */
export function sfxKey(
  refs: ResourceRefs,
  group: string,
  name: string,
): AssetKey | null {
  return audioOnly(refs.sfx?.[group]?.[name]);
}

/** `audio:` keys of the voice lines of an operator's slot, in pack order. */
export function voiceKeys(
  refs: ResourceRefs,
  charId: string,
  slot: string,
): readonly AssetKey[] {
  const keys = refs.voice?.[charId]?.[slot] ?? [];
  return keys.filter((key) => audioOnly(key) !== null);
}

/** `audio:` key of a music track by its name. */
export function bgmKey(refs: ResourceRefs, name: string): AssetKey | null {
  return audioOnly(refs.bgm?.[name]);
}

/** The file to fetch for an `audio:` key, following its fallbacks. Null when nothing in the chain is audio. */
export function audioSourceOf(
  resolver: AssetResolver,
  key: AssetKey,
): AudioSource | null {
  const asset = resolver.resolve(key);
  return asset ? audioSource(asset) : null;
}
