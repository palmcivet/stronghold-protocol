import type { JsonRecord, MasterValueType } from '#data/asset/rules.js';

export interface MasterLeaf {
  readonly path: readonly string[];
  /** `text` for a string, `texts` for an array of strings, `spine` for a Spine record, `other` for numbers, booleans and null. */
  readonly type: MasterValueType | 'other';
  readonly value: unknown;
  /** The record that holds the leaf. */
  readonly parent: JsonRecord;
}

export function isJsonRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** A Spine record names its skeleton, as `skel` does in `assets.json`. */
export function isSpineRecord(value: unknown): value is JsonRecord {
  return isJsonRecord(value) && typeof value.skel === 'string';
}

/** Every leaf of the master file in document order. A Spine record is one leaf; its fields are not visited. */
/** The version segment master's served asset views put after the root: `/assets/~<hash>/…`, `/fonts/~<hash>/…`. */
const VERSIONED = /^\/(assets|fonts)\/~[0-9a-f]+\//;

/** An address without master's version segment; master serves the plain path too. */
export function unversioned(address: string): string {
  return address.replace(VERSIONED, '/$1/');
}

function stripVersions(value: unknown): unknown {
  if (typeof value === 'string') {
    return unversioned(value);
  }
  if (Array.isArray(value)) {
    return value.map(stripVersions);
  }
  if (isJsonRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([name, item]) => [name, stripVersions(item)]),
    );
  }
  return value;
}

export function masterLeaves(root: JsonRecord): readonly MasterLeaf[] {
  const leaves: MasterLeaf[] = [];
  const visit = (
    value: unknown,
    path: readonly string[],
    parent: JsonRecord,
  ): void => {
    if (typeof value === 'string') {
      leaves.push({ path, type: 'text', value: unversioned(value), parent });
    } else if (
      Array.isArray(value) &&
      value.every((item) => typeof item === 'string')
    ) {
      leaves.push({
        path,
        type: 'texts',
        value: value.map(unversioned),
        parent,
      });
    } else if (Array.isArray(value)) {
      value.forEach((item, index) => {
        visit(item, [...path, String(index)], parent);
      });
    } else if (isSpineRecord(value)) {
      leaves.push({
        path,
        type: 'spine',
        value: stripVersions(value) as typeof value,
        parent,
      });
    } else if (isJsonRecord(value)) {
      for (const [name, item] of Object.entries(value)) {
        visit(item, [...path, name], value);
      }
    } else {
      leaves.push({ path, type: 'other', value, parent });
    }
  };
  for (const [name, item] of Object.entries(root)) {
    visit(item, [name], root);
  }
  return leaves;
}
