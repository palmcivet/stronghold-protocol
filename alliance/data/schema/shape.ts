import {
  type AssetKey,
  assetKeyIssue,
  assetKindOf,
  fieldPath,
  indexPath,
  type SchemaIssue,
} from 'arknights-assets-catalog';

/** Shapes of the alliance/data schemas and their checker. Internal to alliance/data. */

export type Shape =
  | { readonly type: 'key' }
  /** A key of the `audio` kind. */
  | { readonly type: 'audio' }
  | { readonly type: 'keys' }
  | {
      readonly type: 'map';
      readonly of: Shape;
      /** Accepted names; any name when absent. */
      readonly names?: (name: string) => boolean;
    }
  | {
      readonly type: 'fields';
      readonly fields: Readonly<Record<string, Shape>>;
      /** Names that must be present. */
      readonly required?: readonly string[];
    }
  | { readonly type: 'list'; readonly of: Shape }
  /** A whole number from 1. */
  | { readonly type: 'count' };

export const KEY: Shape = { type: 'key' };
export const AUDIO: Shape = { type: 'audio' };
export const COUNT: Shape = { type: 'count' };
export const list = (of: Shape): Shape => ({ type: 'list', of });
export const KEYS: Shape = { type: 'keys' };
export const map = (of: Shape, names?: (name: string) => boolean): Shape =>
  names ? { type: 'map', of, names } : { type: 'map', of };
export const roles =
  (list: readonly string[]) =>
  (name: string): boolean =>
    list.includes(name);
export const fields = (shape: Readonly<Record<string, Shape>>): Shape => ({
  type: 'fields',
  fields: shape,
});
export const KEY_MAP = map(KEY);

export function isObject(
  value: unknown,
): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function checkShape(
  issues: SchemaIssue[],
  value: unknown,
  shape: Shape,
  path: string,
): void {
  if (shape.type === 'key') {
    const issue = assetKeyIssue(value);
    if (issue) {
      issues.push({ path, message: issue });
    }
    return;
  }
  if (shape.type === 'audio') {
    const issue = assetKeyIssue(value);
    if (issue) {
      issues.push({ path, message: issue });
    } else if (assetKindOf(value as AssetKey) !== 'audio') {
      issues.push({ path, message: `${String(value)} is not audio` });
    }
    return;
  }
  if (shape.type === 'keys') {
    if (!Array.isArray(value)) {
      issues.push({ path, message: 'expected an array of keys' });
      return;
    }
    value.forEach((item, index) => {
      checkShape(issues, item, KEY, indexPath(path, index));
    });
    return;
  }
  if (shape.type === 'count') {
    if (!Number.isInteger(value) || (value as number) < 1) {
      issues.push({ path, message: 'expected a whole number from 1' });
    }
    return;
  }
  if (shape.type === 'list') {
    if (!Array.isArray(value)) {
      issues.push({ path, message: 'expected an array' });
      return;
    }
    value.forEach((item, index) => {
      checkShape(issues, item, shape.of, indexPath(path, index));
    });
    return;
  }
  if (!isObject(value)) {
    issues.push({ path, message: 'expected an object' });
    return;
  }
  if (shape.type === 'map') {
    for (const [name, item] of Object.entries(value)) {
      if (shape.names && !shape.names(name)) {
        issues.push({
          path: fieldPath(path, name),
          message: `unknown role ${JSON.stringify(name)}`,
        });
      } else {
        checkShape(issues, item, shape.of, fieldPath(path, name));
      }
    }
    return;
  }
  for (const name of shape.required ?? []) {
    if (!Object.hasOwn(value, name)) {
      issues.push({
        path: fieldPath(path, name),
        message: `missing ${JSON.stringify(name)}`,
      });
    }
  }
  for (const [name, item] of Object.entries(value)) {
    const field = Object.hasOwn(shape.fields, name)
      ? shape.fields[name]
      : undefined;
    if (field) {
      checkShape(issues, item, field, fieldPath(path, name));
    } else {
      issues.push({
        path: fieldPath(path, name),
        message: `unknown name ${JSON.stringify(name)}`,
      });
    }
  }
}
