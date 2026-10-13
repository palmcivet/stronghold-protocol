import type { AssetKey, AssetKind } from '#key/asset-key.js';
import type { AssetFile } from '#schema/asset-file.js';
import type { AssetColorSpace } from '#schema/color-space.js';
import {
  fieldPath,
  indexPath,
  isRecord,
  SchemaCheck,
  type SchemaIssue,
  SHA256_HEX,
} from '#schema/issue.js';
import { checkEntryHead } from '#schema/raw-catalog.js';

/** One layer of the asset overlay. Every layer shares this format; the pack author names the pack types. */
export interface PackManifest {
  readonly schemaVersion: 1;
  readonly pack: PackInfo;
  readonly requires: readonly PackRequirement[];
  /** Root of the files, relative to the manifest URL or absolute. Ends with `/`. */
  readonly fileRoot: string;
  readonly assets: Readonly<Record<AssetKey, PackAsset>>;
  /** Domain ids to keys. The shape belongs to the pack author; every leaf is a key. */
  readonly refs?: PackRefs;
}

export interface PackInfo {
  /** Pack type named by the pack author, such as `base`. Any non-empty string. */
  readonly type: string;
  readonly id: string;
  readonly version: string;
  /** SHA-256 of this manifest after normalization, excluding this field. */
  readonly contentHash: string;
}

export interface PackRequirement {
  /** Type of the required pack. Any non-empty string. */
  readonly type: string;
  readonly id: string;
  readonly version: string;
}

export interface PackAsset {
  readonly kind: AssetKind;
  readonly files: readonly PackFile[];
  readonly dependsOn: readonly AssetKey[];
  readonly fallbackId: AssetKey | null;
  readonly preloadGroup: string | null;
  /** Colour space of an image or texture; `srgb` when absent. */
  readonly colorSpace?: AssetColorSpace;
  /** Variant of an image, such as `elite0`, `elite2` or `skin` for a portrait or avatar; absent when the image has none. */
  readonly label?: string;
}

export interface PackFile extends AssetFile {
  /** Only for a file outside the address layout: an absolute URL or a path relative to `fileRoot`. An empty `hash` skips verification. */
  readonly href?: string;
}

export interface PackRefs {
  readonly [name: string]: PackRefNode;
}

export type PackRefNode = AssetKey | PackRefs | readonly PackRefNode[];

function checkRefNode(check: SchemaCheck, value: unknown, path: string): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      checkRefNode(check, item, indexPath(path, index));
    });
    return;
  }
  if (isRecord(value)) {
    for (const [name, item] of Object.entries(value)) {
      checkRefNode(check, item, fieldPath(path, name));
    }
    return;
  }
  check.key(value, path);
}

/** Checks that `refs` is an object whose leaves are all valid keys. */
export function packRefsIssues(
  value: unknown,
  path = 'refs',
): readonly SchemaIssue[] {
  const check = new SchemaCheck();
  if (check.record(value, path)) {
    checkRefNode(check, value, path);
  }
  return check.issues;
}

export function packManifestIssues(value: unknown): readonly SchemaIssue[] {
  const check = new SchemaCheck();
  const root = check.record(value, '');
  if (!root) {
    return check.issues;
  }
  check.oneOf(root.schemaVersion, 'schemaVersion', [1]);
  const pack = check.record(root.pack, 'pack');
  if (pack) {
    check.text(pack.type, 'pack.type');
    check.text(pack.id, 'pack.id');
    check.text(pack.version, 'pack.version');
    const hash = pack.contentHash;
    if (typeof hash !== 'string' || !SHA256_HEX.test(hash)) {
      check.fail('pack.contentHash', 'expected a lowercase hex SHA-256');
    }
  }
  const requires = check.list(root.requires, 'requires');
  requires?.forEach((item, index) => {
    const path = indexPath('requires', index);
    const requirement = check.record(item, path);
    if (!requirement) {
      return;
    }
    check.text(requirement.type, fieldPath(path, 'type'));
    check.text(requirement.id, fieldPath(path, 'id'));
    check.text(requirement.version, fieldPath(path, 'version'));
  });
  const fileRoot = check.text(root.fileRoot, 'fileRoot');
  if (fileRoot !== null && !fileRoot.endsWith('/')) {
    check.fail('fileRoot', "expected a trailing '/'");
  }
  const assets = check.record(root.assets, 'assets');
  for (const [recordKey, item] of Object.entries(assets ?? {})) {
    const path = fieldPath('assets', recordKey);
    const asset = check.record(item, path);
    if (!asset) {
      continue;
    }
    const key = checkEntryHead(check, recordKey, asset, path, true);
    const fallback = asset.fallbackId;
    if (
      fallback !== null &&
      check.key(fallback, fieldPath(path, 'fallbackId')) &&
      fallback === key
    ) {
      check.fail(
        fieldPath(path, 'fallbackId'),
        'an asset cannot fall back to itself',
      );
    }
    if (asset.preloadGroup !== null) {
      check.text(asset.preloadGroup, fieldPath(path, 'preloadGroup'));
    }
  }
  if (root.refs !== undefined) {
    check.issues.push(...packRefsIssues(root.refs));
  }
  return check.issues;
}

export function isPackManifest(value: unknown): value is PackManifest {
  return packManifestIssues(value).length === 0;
}
