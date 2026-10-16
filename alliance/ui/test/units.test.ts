import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const uiRoot = fileURLToPath(new URL('..', import.meta.url));
const SKIPPED = new Set(['node_modules', 'dist', 'dist-test', 'dist-web']);
const TEST_FILE = /\.(test|spec)\.tsx?$/;
/** A length in a unit the canvas does not use: stylelint covers `.css`, this covers lengths written in code. */
const FORBIDDEN_UNIT = /\d(rem|vw|vh|dvh|svh|lvh|dvw|svw|lvw|vmin|vmax)\b/;

function sources(directory: string): readonly string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (SKIPPED.has(name)) {
      return [];
    }
    if (statSync(path).isDirectory()) {
      return sources(path);
    }
    return /\.tsx?$/.test(name) && !TEST_FILE.test(name) ? [path] : [];
  });
}

describe('length units in code', () => {
  it('writes no length in rem or a viewport unit', () => {
    const found = sources(uiRoot).filter((path) =>
      FORBIDDEN_UNIT.test(readFileSync(path, 'utf8')),
    );
    expect(found.map((path) => relative(uiRoot, path))).toEqual([]);
  });
});
