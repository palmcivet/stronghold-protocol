import { useEffect, useState } from 'react';
import { useStore } from 'zustand';
import { assetsStore } from '#infra/store/assets.js';
import type { ResourceStore } from './store.js';

type Key = NonNullable<ReturnType<ResourceStore['ref']>>;

/** Where art comes from: a `refs` path such as `['chars', id, 'avatar']`, or an asset key such as `image:ui/…`. */
export type ArtSource = readonly string[] | string;

/** The asset key of a source in the store, or null when the store has no art for it. */
export function artKey(
  resources: ResourceStore,
  source: ArtSource,
): Key | null {
  if (typeof source !== 'string') {
    return resources.ref(source);
  }
  const key = source as Key;
  return resources.resolver.has(key) ? key : null;
}

/** URL of a loaded image, or null. The resource store resolves images to `HTMLImageElement`s. */
function urlOf(image: unknown): string | null {
  return image &&
    typeof image === 'object' &&
    'src' in image &&
    typeof image.src === 'string'
    ? image.src
    : null;
}

/**
 * The URL of a piece of art from the current resource store, through its fallback chain and image cache. Null while it
 * loads, when there is no store or no art, or when every fallback failed. The reference is released on unmount.
 */
export function useArt(source: ArtSource | null): string | null {
  const resources = useStore(assetsStore, (state) => state.resources);
  const id =
    source === null
      ? null
      : typeof source === 'string'
        ? source
        : source.join('\u0000');
  const [url, setUrl] = useState<string | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `id` stands for `source`
  useEffect(() => {
    setUrl(null);
    if (!resources || source === null) {
      return;
    }
    const key = artKey(resources, source);
    if (!key) {
      return;
    }
    let live = true;
    resources.image(key).then(
      (image) => {
        if (live) {
          setUrl(urlOf(image));
        }
      },
      () => {},
    );
    return () => {
      live = false;
      resources.release(key);
    };
  }, [resources, id]);
  return url;
}

export interface AvatarVariant {
  readonly charId: string;
  /** Asset key of the image; it is the value a player picks. */
  readonly key: Key;
  /** The variant label of the asset catalog entry, such as `elite0`, `elite2` or `skin`. */
  readonly label: string;
}

/** Image keys an operator's `refs` record points at, in record order. */
function charKeys(resources: ResourceStore, charId: string): readonly Key[] {
  const record = resources.refs.chars?.[charId];
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return [];
  }
  return [
    ...new Set(
      Object.values(record).filter(
        (value): value is Key => typeof value === 'string',
      ),
    ),
  ];
}

/**
 * The avatar variants of the operators: their images whose asset catalog entry carries a `label`. An operator whose
 * images have no label has no variants.
 */
export function avatarVariants(
  resources: ResourceStore | null,
  charIds: readonly string[],
): readonly AvatarVariant[] {
  if (!resources) {
    return [];
  }
  return charIds.flatMap((charId) =>
    charKeys(resources, charId).flatMap((key) => {
      const label = resources.resolver.entry(key)?.asset.label;
      return label ? [{ charId, key, label }] : [];
    }),
  );
}
