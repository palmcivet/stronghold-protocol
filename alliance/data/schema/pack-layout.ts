import {
  AssetAddressError,
  fieldPath,
  indexPath,
  needsListIssues,
  type PackInfo,
  type PackManifest,
  type SchemaIssue,
} from 'arknights-assets-catalog';

/** Pack types of the overlay. Upstream manifests are built by the client from a master backend. */
export const PACK_TYPES = [
  'base',
  'season',
  'mod',
  'local',
  'upstream',
] as const;

export type PackType = (typeof PACK_TYPES)[number];

/** Pack types a manifest may list in `requires`. */
export const REQUIRED_PACK_TYPES = ['base', 'season'] as const;

export type RequiredPackType = (typeof REQUIRED_PACK_TYPES)[number];

/** Pack types that have a needs list: the packs compiled from extracted assets. */
export const NEEDS_PACK_TYPES = ['base', 'season'] as const;

export type NeedsPackType = (typeof NEEDS_PACK_TYPES)[number];

function oneOfIssue(
  value: unknown,
  path: string,
  options: readonly string[],
): SchemaIssue[] {
  return options.some((option) => option === value)
    ? []
    : [
        {
          path,
          message: `expected one of ${options.map((option) => JSON.stringify(option)).join(', ')}`,
        },
      ];
}

/** Checks `pack.type` against `PACK_TYPES` and every `requires[].type` against `REQUIRED_PACK_TYPES`. */
export function packTypeIssues(manifest: PackManifest): readonly SchemaIssue[] {
  return [
    ...oneOfIssue(manifest.pack.type, 'pack.type', PACK_TYPES),
    ...manifest.requires.flatMap((requirement, index) =>
      oneOfIssue(
        requirement.type,
        fieldPath(indexPath('requires', index), 'type'),
        REQUIRED_PACK_TYPES,
      ),
    ),
  ];
}

function packTypeOf(value: unknown): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const pack = (value as Record<string, unknown>).pack;
  if (pack === null || typeof pack !== 'object' || Array.isArray(pack)) {
    return undefined;
  }
  return (pack as Record<string, unknown>).type;
}

/**
 * The catalog guard of a needs list with `pack.type` checked against `NEEDS_PACK_TYPES`.
 * The pack type issue takes the place of the guard's own one, so the list reads like a single guard's issues.
 */
export function needsListIssuesWithPackTypes(
  value: unknown,
): readonly SchemaIssue[] {
  const issues = needsListIssues(value);
  const root =
    value !== null && typeof value === 'object' && !Array.isArray(value);
  const packIsRecord = root && issues.every((issue) => issue.path !== 'pack');
  if (!packIsRecord) {
    return issues;
  }
  const typeIssues = oneOfIssue(
    packTypeOf(value),
    'pack.type',
    NEEDS_PACK_TYPES,
  );
  const rest = issues.filter((issue) => issue.path !== 'pack.type');
  const at = rest.findIndex((issue) => issue.path !== 'schemaVersion');
  const split = at < 0 ? rest.length : at;
  return [...rest.slice(0, split), ...typeIssues, ...rest.slice(split)];
}

/** Site path that holds every published file and manifest. */
export const RESOURCE_ROOT = '/res/';
/** Directory of asset files under `RESOURCE_ROOT`, laid out by `fileAddress`. */
export const FILES_DIRECTORY = 'files/';
/** Directory of published pack manifests under `RESOURCE_ROOT`. */
export const PACKS_DIRECTORY = 'packs/';
/** Directory of the local overlay manifest under `RESOURCE_ROOT`. */
export const LOCAL_DIRECTORY = 'local/';
export const MANIFEST_FILE = 'manifest.json';

/** Packs that have a place in the published layout. Upstream manifests are built by the client. */
export type PublishedPackType = Exclude<PackType, 'upstream'>;

export type PublishedPack = Pick<PackInfo, 'id' | 'version' | 'contentHash'> & {
  readonly type: PublishedPackType;
};

const PATH_SEGMENT = /^[A-Za-z0-9_.+-]+$/;

function segment(
  pack: PublishedPack,
  field: 'id' | 'version' | 'contentHash',
): string {
  const value = pack[field];
  if (!PATH_SEGMENT.test(value) || value === '.' || value === '..') {
    throw new AssetAddressError(
      `${pack.type} pack ${field} ${JSON.stringify(value)} cannot be a path segment`,
    );
  }
  return value;
}

/**
 * Directory of a pack under `RESOURCE_ROOT`:
 * `packs/base/<version>/`, `packs/season/<id>/<contentHash>/`, `packs/mod/<id>/<version>/`, `local/`.
 */
export function packDirectory(pack: PublishedPack): string {
  switch (pack.type) {
    case 'base':
      return `${PACKS_DIRECTORY}base/${segment(pack, 'version')}/`;
    case 'season':
      return `${PACKS_DIRECTORY}season/${segment(pack, 'id')}/${segment(pack, 'contentHash')}/`;
    case 'mod':
      return `${PACKS_DIRECTORY}mod/${segment(pack, 'id')}/${segment(pack, 'version')}/`;
    case 'local':
      return LOCAL_DIRECTORY;
  }
}

/** Manifest address of a pack under `RESOURCE_ROOT`. */
export function packManifestAddress(pack: PublishedPack): string {
  return `${packDirectory(pack)}${MANIFEST_FILE}`;
}

/** `fileRoot` for a published pack: the shared `files/` directory, relative to the pack directory. */
export function packFileRoot(pack: PublishedPack): string {
  const depth = packDirectory(pack)
    .split('/')
    .filter((part) => part.length > 0).length;
  return `${'../'.repeat(depth)}${FILES_DIRECTORY}`;
}

/** `contentHash` of `emptyLocalManifest()`: SHA-256 of its canonical JSON without `pack.contentHash` and `fileRoot`. */
const EMPTY_LOCAL_CONTENT_HASH =
  '83ff2ec26e3d2df78a7096c0333053daa90d7292633c1bb6dab6e89eba11fa98';

/** The local overlay with no entries. Served when the local manifest is missing, so the layer is always present. */
export function emptyLocalManifest(): PackManifest {
  const pack: PublishedPack = {
    type: 'local',
    id: 'local',
    version: '0',
    contentHash: EMPTY_LOCAL_CONTENT_HASH,
  };
  return {
    schemaVersion: 1,
    pack,
    requires: [],
    fileRoot: packFileRoot(pack),
    assets: {},
  };
}
