import { createHash } from 'node:crypto';
import {
  type AssetKey,
  type Need,
  type PackAsset,
  type PackFile,
  type PackManifest,
  type PackRequirement,
  packManifestIssues,
  type RawEntry,
} from 'arknights-assets-catalog';
import { fallbackTargetOf } from '#compiler/media/pack/fallback.js';
import { baseRefs, seasonRefs } from '#compiler/media/pack/refs.js';
import {
  type AppPackManifest,
  type CueTable,
  cueKeysOf,
  cueTableIssues,
  missingCueKeys,
  packAppIssues,
} from '#schema/pack-app.js';
import {
  packFileRoot,
  packTypeIssues,
  type RequiredPackType,
} from '#schema/pack-layout.js';

export type PackKind = 'base' | 'season';

/** Key namespaces that belong to a season pack. Every other published namespace belongs to the base pack. */
const SEASON_PREFIXES: readonly string[] = Object.freeze([
  'image:season/',
  'image:ui/',
  'image:band/',
  'image:bond/',
  'audio:bgm/',
  'audio:sfx/autochess/',
  'json:anim-roles/',
  'json:board/',
  'json:material/',
  'json:prefab/',
  'texture:',
  'model:',
]);

/** Build-only tables stay out of every pack. */
const UNPUBLISHED_PREFIXES: readonly string[] = Object.freeze([
  'json:gamedata/',
]);

export function isSeasonKey(key: AssetKey): boolean {
  return SEASON_PREFIXES.some((prefix) => key.startsWith(prefix));
}

export function isUnpublishedKey(key: AssetKey): boolean {
  return UNPUBLISHED_PREFIXES.some((prefix) => key.startsWith(prefix));
}

/** Serialization with sorted object keys, so equal content gives equal bytes. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value !== null && typeof value === 'object') {
    const row = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(row)
        .sort()
        .map((name) => [name, sortKeys(row[name])]),
    );
  }
  return value;
}

export function sha256Hex(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export interface PackInput {
  readonly type: PackKind;
  readonly id: string;
  readonly version: string;
  readonly requires: readonly (PackRequirement & {
    readonly type: RequiredPackType;
  })[];
  /** Needs of this pack, as the needs list gives them. */
  readonly needs: readonly Need[];
  /** Raw entries by key from every catalog that may hold a needed key. */
  readonly entries: ReadonlyMap<AssetKey, RawEntry>;
  /** Parsed `charword_table.json`, for the voice slots of the references. */
  readonly charword: unknown | null;
  /** Hand-written cue table of a season pack, written to `app.cues` as is. */
  readonly cues?: unknown;
  /** Keys the required packs publish. A cue may name one of them instead of a key of this pack. */
  readonly requiredKeys?: ReadonlySet<AssetKey>;
}

export interface PackBuild {
  readonly manifest: AppPackManifest;
  /** Required needs without an entry. A pack is not written while this is not empty. */
  readonly missingRequired: readonly AssetKey[];
  readonly missingOptional: readonly AssetKey[];
  /** Keys that belong to the other pack kind. */
  readonly misplaced: readonly AssetKey[];
  /** Cue keys that neither this pack nor a required pack publishes. A pack is not written while this is not empty. */
  readonly missingCues: readonly AssetKey[];
}

/** Checks the cue table against its schema. Throws with every problem. */
function checkedCues(input: PackInput): CueTable | null {
  if (input.cues === undefined) {
    return null;
  }
  if (input.type !== 'season') {
    throw new Error(`base pack ${input.id} cannot carry a cue table`);
  }
  const issues = cueTableIssues(input.cues);
  if (issues.length > 0) {
    throw new Error(
      `season pack ${input.id} cue table is invalid: ${issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ')}`,
    );
  }
  return input.cues as CueTable;
}

/**
 * Builds one pack manifest. The needed keys and their dependencies form the assets; `refs` come from the paths of the keys that belong to the pack kind.
 * `contentHash` covers the manifest without `pack.contentHash` and `fileRoot`, because `fileRoot` is a deployment location.
 */
export function buildPack(input: PackInput): PackBuild {
  const missingRequired: AssetKey[] = [];
  const missingOptional: AssetKey[] = [];
  const misplaced: AssetKey[] = [];
  const missingCues: AssetKey[] = [];
  const assets: Record<string, PackAsset> = {};
  const cues = checkedCues(input);

  const include = (key: AssetKey): void => {
    if (assets[key] || isUnpublishedKey(key)) {
      return;
    }
    const entry = input.entries.get(key);
    if (!entry) {
      return;
    }
    if (input.type === 'base' && isSeasonKey(key)) {
      misplaced.push(key);
    }
    if (input.type === 'season' && !isSeasonKey(key)) {
      misplaced.push(key);
    }
    assets[key] = {
      kind: entry.kind,
      files: entry.files.map(
        (file): PackFile => ({
          role: file.role,
          name: file.name,
          format: file.format,
          bytes: file.bytes,
          hash: file.hash,
        }),
      ),
      dependsOn: entry.dependsOn,
      fallbackId: null,
      preloadGroup: null,
    };
    for (const dependency of entry.dependsOn) {
      include(dependency);
    }
  };

  for (const need of input.needs) {
    if (isUnpublishedKey(need.key)) {
      continue;
    }
    if (!input.entries.has(need.key)) {
      if (need.required) {
        missingRequired.push(need.key);
      } else {
        missingOptional.push(need.key);
      }
      continue;
    }
    include(need.key);
  }

  for (const key of cues ? cueKeysOf(cues) : []) {
    if (isSeasonKey(key)) {
      include(key);
    }
  }
  if (cues) {
    missingCues.push(
      ...missingCueKeys(
        cues,
        (key) => Boolean(assets[key]) || Boolean(input.requiredKeys?.has(key)),
      ),
    );
  }

  for (const key of Object.keys(assets) as AssetKey[]) {
    const target = fallbackTargetOf(key);
    if (target && assets[target]) {
      assets[key] = { ...(assets[key] as PackAsset), fallbackId: target };
    }
  }

  const keys = (Object.keys(assets) as AssetKey[]).filter(
    (key) => isSeasonKey(key) === (input.type === 'season'),
  );
  const refs =
    input.type === 'season' ? seasonRefs(keys) : baseRefs(keys, input.charword);
  const pack = {
    type: input.type,
    id: input.id,
    version: input.version,
    contentHash: '',
  };
  const body = {
    schemaVersion: 1 as const,
    pack,
    requires: [...input.requires],
    assets: sortRecord(assets),
    refs,
    ...(cues ? { app: { cues } } : {}),
  };
  const contentHash = sha256Hex(
    canonicalJson({ ...body, pack: { ...pack, contentHash: undefined } }),
  );
  const fileRoot = packFileRoot({
    type: input.type,
    id: input.id,
    version: input.version,
    contentHash,
  });
  const manifest: AppPackManifest = {
    ...body,
    pack: { ...pack, contentHash },
    fileRoot,
  };
  const issues = [
    ...packManifestIssues(manifest),
    ...packTypeIssues(manifest),
    ...(manifest.app === undefined ? [] : packAppIssues(manifest.app)),
  ];
  if (issues.length > 0) {
    throw new Error(
      `${input.type} pack ${input.id} is invalid: ${issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ')}`,
    );
  }
  return {
    manifest,
    missingRequired: [...new Set(missingRequired)].sort(),
    missingOptional: [...new Set(missingOptional)].sort(),
    misplaced: [...new Set(misplaced)].sort(),
    missingCues: [...new Set(missingCues)].sort(),
  };
}

function sortRecord<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map((key) => [key, record[key] as T]),
  );
}

/** Keys the previous manifest lists and the new one does not. An empty list means the pack did not shrink. */
export function droppedKeys(previous: unknown, next: PackManifest): AssetKey[] {
  const old =
    previous !== null && typeof previous === 'object'
      ? (previous as { assets?: Record<string, unknown> }).assets
      : undefined;
  if (!old) {
    return [];
  }
  return Object.keys(old)
    .filter((key) => !(key in next.assets))
    .map((key) => key as AssetKey)
    .sort();
}
