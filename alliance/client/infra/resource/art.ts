import { useEffect, useState } from 'react';
import { useStore } from 'zustand';
import { assetsStore } from '../store/assets.js';
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

/** The avatar ref fields of an operator in the asset catalog, plain then elite. They name the variant a player picks. */
export const AVATAR_FIELDS = ['avatar', 'avatarElite'] as const;
export type AvatarField = (typeof AVATAR_FIELDS)[number];

export interface AvatarVariant {
  readonly charId: string;
  readonly field: AvatarField;
}

/** The avatar variants the asset catalog has for the operators, in their order. */
export function avatarVariants(
  resources: ResourceStore | null,
  charIds: readonly string[],
): readonly AvatarVariant[] {
  if (!resources) {
    return [];
  }
  return charIds.flatMap((charId) =>
    AVATAR_FIELDS.filter(
      (field) => resources.ref(['chars', charId, field]) !== null,
    ).map((field) => ({ charId, field })),
  );
}
