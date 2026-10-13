import {
  type AssetColorSpace,
  type AssetKey,
  type AssetKind,
  type AssetResolver,
  assetColorSpace,
  assetKindOf,
  createSpineCache,
  type ResolvedAsset,
  type SpineCacheOptions,
  type SpineSource,
  spineSource,
} from 'arknights-assets-catalog';
import {
  LinearFilter,
  LinearMipmapLinearFilter,
  LinearSRGBColorSpace,
  SRGBColorSpace,
  type Texture,
} from 'three';

export type MissionAssetKind = 'image' | 'spine' | 'model' | 'json';

export interface MissionResourcePort<
  TImage = unknown,
  TSpine = unknown,
  TModel = unknown,
  TJson = unknown,
> {
  /** Takes one reference to the image under `key`. Release it with `release` when done, even if the call rejects. */
  image(key: AssetKey): Promise<TImage>;
  /** Takes one reference to the spine model under `key`, with its atlas pages loaded. */
  spine(key: AssetKey): Promise<TSpine>;
  /** Takes one reference to the model under `key`. */
  model(key: AssetKey): Promise<TModel>;
  /** Takes one reference to the JSON document under `key`. */
  json(key: AssetKey): Promise<TJson>;
  /** Gives back one reference. Without `kind`, the kind follows from the key. */
  release(key: AssetKey, kind?: MissionAssetKind): void;
}

export interface MissionResourceLoaders<
  TImage = unknown,
  TSpine = unknown,
  TModel = unknown,
  TJson = unknown,
> {
  readonly resolver: AssetResolver;
  /**
   * `colorSpace` is the entry's, `srgb` unless the catalog marks it `linear`. A Three texture returned here gets the
   * texture policy of its kind: colour space, mipmaps and anisotropy.
   */
  readonly image: (
    url: string,
    key: AssetKey,
    colorSpace: AssetColorSpace,
  ) => Promise<TImage>;
  readonly spine: (source: SpineSource) => Promise<TSpine>;
  readonly model: (url: string, key: AssetKey) => Promise<TModel>;
  readonly json: (url: string, key: AssetKey) => Promise<TJson>;
  /** Delays before each retry of a failed load. Default [250, 1000]. */
  readonly retryDelays?: readonly number[];
  /** Anisotropic filtering of `texture` keys, usually the renderer's maximum. Default 1. */
  readonly anisotropy?: number;
  /** Optional spine cache tuning; `load` is taken from `spine` above. */
  readonly spineCache?: Omit<SpineCacheOptions, 'load'>;
}

type FileKind = Exclude<MissionAssetKind, 'spine'>;

const DEFAULT_RETRY_DELAYS: readonly number[] = [250, 1000];

/** Catalog kinds each file kind accepts. Board textures are `texture` keys and load as images. */
const ACCEPTED_KINDS: Readonly<Record<FileKind, readonly AssetKind[]>> = {
  image: ['image', 'texture'],
  model: ['model'],
  json: ['json'],
};

/** How each catalog kind loaded as an image is sampled. Board textures are seen at a slant and minified; images are drawn near their size. */
export const MISSION_TEXTURE_POLICY = Object.freeze({
  texture: Object.freeze({ mipmaps: true, anisotropic: true }),
  image: Object.freeze({ mipmaps: false, anisotropic: false }),
});

/** Sets the colour space, mipmaps and anisotropy of a loaded texture by its catalog kind. */
function applyTexturePolicy(
  texture: Texture,
  kind: 'image' | 'texture',
  colorSpace: AssetColorSpace,
  anisotropy: number,
): void {
  const policy = MISSION_TEXTURE_POLICY[kind];
  texture.colorSpace =
    colorSpace === 'srgb' ? SRGBColorSpace : LinearSRGBColorSpace;
  texture.generateMipmaps = policy.mipmaps;
  texture.minFilter = policy.mipmaps ? LinearMipmapLinearFilter : LinearFilter;
  texture.anisotropy = policy.anisotropic ? Math.max(1, anisotropy) : 1;
  texture.needsUpdate = true;
}

interface SharedLoad {
  readonly promise: Promise<unknown>;
  references: number;
}

interface SpineLoad {
  readonly value: unknown;
  readonly sourceKey: AssetKey;
}

interface SpineHold {
  readonly promise: Promise<unknown>;
  references: number;
  /** Key under which the spine cache holds the model. Null until the load succeeds. */
  sourceKey: AssetKey | null;
}

function isTexture(value: unknown): value is Texture {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'isTexture' in value &&
      value.isTexture === true,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function missionKindOf(key: AssetKey): MissionAssetKind | null {
  const kind = assetKindOf(key);
  if (kind === 'texture') {
    return 'image';
  }
  return kind === 'image' ||
    kind === 'spine' ||
    kind === 'model' ||
    kind === 'json'
    ? kind
    : null;
}

export function createMissionResourcePort<
  TImage = unknown,
  TSpine = unknown,
  TModel = unknown,
  TJson = unknown,
>(
  options: MissionResourceLoaders<TImage, TSpine, TModel, TJson>,
): MissionResourcePort<TImage, TSpine, TModel, TJson> {
  const { resolver } = options;
  const retryDelays = options.retryDelays ?? DEFAULT_RETRY_DELAYS;
  const anisotropy = options.anisotropy ?? 1;
  const fileLoaders: Record<
    FileKind,
    (url: string, entry: ResolvedAsset) => Promise<unknown>
  > = {
    image: async (url, entry) => {
      const colorSpace = assetColorSpace(entry.asset) ?? 'srgb';
      const image = await options.image(url, entry.key, colorSpace);
      if (isTexture(image)) {
        applyTexturePolicy(
          image,
          entry.kind === 'texture' ? 'texture' : 'image',
          colorSpace,
          anisotropy,
        );
      }
      return image;
    },
    model: (url, entry) => options.model(url, entry.key),
    json: (url, entry) => options.json(url, entry.key),
  };
  const fileLoads: Record<FileKind, Map<AssetKey, SharedLoad>> = {
    image: new Map(),
    model: new Map(),
    json: new Map(),
  };
  const spineHolds = new Map<AssetKey, SpineHold>();
  const spineCache = createSpineCache({
    ...options.spineCache,
    load: (source) => options.spine(source),
  });

  // MARK: retry and fallback

  /** Runs `attempt` once, then once more after each delay in `retryDelays`. `onFailure` runs after every failed try. */
  async function retrying<T>(
    attempt: (retry: boolean) => Promise<T>,
    onFailure?: () => void,
  ): Promise<T> {
    for (let tries = 0; ; tries += 1) {
      try {
        return await attempt(tries > 0);
      } catch (error) {
        onFailure?.();
        const delay = retryDelays[tries];
        if (delay === undefined) {
          throw error;
        }
        await sleep(delay);
      }
    }
  }

  /** Tries the entry of `key`, then each fallback that has not failed yet, until one loads. */
  async function settle<T>(
    key: AssetKey,
    attempt: (entry: ResolvedAsset) => Promise<T>,
  ): Promise<T> {
    const failed = new Set<AssetKey>();
    let lastError: unknown;
    for (;;) {
      const entry = resolver.resolve(key, { failed });
      if (!entry) {
        throw new Error(`every entry of ${key} failed to load`, {
          cause: lastError,
        });
      }
      try {
        return await attempt(entry);
      } catch (error) {
        failed.add(entry.key);
        lastError = error;
      }
    }
  }

  /** Rejects when `key` is missing from every layer or has a kind outside `kinds`. */
  function requireKind(key: AssetKey, kinds: readonly AssetKind[]): void {
    const head = resolver.entry(key);
    if (!head) {
      throw new Error(`asset ${key} is not in any layer`);
    }
    if (!kinds.includes(head.kind)) {
      throw new Error(
        `asset ${key} has kind "${head.kind}", expected ${kinds.join(' or ')}`,
      );
    }
  }

  // MARK: image, model and json

  function disposeTexture(value: unknown): void {
    if (isTexture(value)) {
      value.dispose();
    }
  }

  async function loadFile(kind: FileKind, key: AssetKey): Promise<unknown> {
    requireKind(key, ACCEPTED_KINDS[kind]);
    return settle(key, async (entry) => {
      const file =
        entry.files.find((candidate) => candidate.role === 'main') ??
        entry.files[0];
      if (!file) {
        throw new Error(`asset ${entry.key} has no files`);
      }
      return retrying(() => fileLoaders[kind](file.url, entry));
    });
  }

  function acquireFile(kind: FileKind, key: AssetKey): Promise<unknown> {
    const loads = fileLoads[kind];
    const existing = loads.get(key);
    if (existing) {
      existing.references += 1;
      return existing.promise;
    }
    const load: SharedLoad = { promise: loadFile(kind, key), references: 1 };
    loads.set(key, load);
    return load.promise;
  }

  function releaseFile(kind: FileKind, key: AssetKey): void {
    const loads = fileLoads[kind];
    const load = loads.get(key);
    if (!load) {
      return;
    }
    load.references -= 1;
    if (load.references <= 0) {
      loads.delete(key);
      // The last reference is gone: a loaded Three texture leaves the GPU with it.
      load.promise.then(disposeTexture, () => undefined);
    }
  }

  // MARK: spine

  async function loadSpine(key: AssetKey): Promise<SpineLoad> {
    requireKind(key, ['spine']);
    return settle(key, async (entry) => {
      const source = spineSource(entry);
      if (!source) {
        throw new Error(`asset ${entry.key} has no skel, atlas or page file`);
      }
      const value = await retrying(
        (retry) => spineCache.acquire(source, { retry }),
        () => {
          spineCache.release(source.key);
        },
      );
      return { value, sourceKey: source.key };
    });
  }

  /**
   * One spine hold per requested key. The spine cache holds the model under the key of the entry that loaded,
   * which differs from `key` when a fallback answered.
   */
  function acquireSpine(key: AssetKey): Promise<unknown> {
    const existing = spineHolds.get(key);
    if (existing) {
      existing.references += 1;
      return existing.promise;
    }
    const hold: SpineHold = {
      promise: loadSpine(key).then((load) => {
        if (spineHolds.get(key) === hold) {
          hold.sourceKey = load.sourceKey;
        } else {
          spineCache.release(load.sourceKey);
        }
        return load.value;
      }),
      references: 1,
      sourceKey: null,
    };
    spineHolds.set(key, hold);
    return hold.promise;
  }

  function releaseSpine(key: AssetKey): void {
    const hold = spineHolds.get(key);
    if (!hold) {
      return;
    }
    hold.references -= 1;
    if (hold.references > 0) {
      return;
    }
    spineHolds.delete(key);
    if (hold.sourceKey !== null) {
      spineCache.release(hold.sourceKey);
    }
  }

  return {
    image: (key) => acquireFile('image', key) as Promise<TImage>,
    spine: (key) => acquireSpine(key) as Promise<TSpine>,
    model: (key) => acquireFile('model', key) as Promise<TModel>,
    json: (key) => acquireFile('json', key) as Promise<TJson>,
    release(key, kind) {
      const target = kind ?? missionKindOf(key);
      if (target === null) {
        return;
      }
      if (target === 'spine') {
        releaseSpine(key);
      } else {
        releaseFile(target, key);
      }
    },
  };
}
