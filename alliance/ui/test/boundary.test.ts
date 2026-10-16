import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const uiRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));

/** Bare specifiers the package may import: the React runtime, React Aria, and its own alias. */
const ALLOWED_BARE = [
  /^react$/,
  /^react\/.+$/,
  /^react-dom(\/.+)?$/,
  /^react-aria-components$/,
  /^#ui\//,
];
/** Test files may also use the test runner, the testing library and Node built-ins. */
const ALLOWED_TEST = [/^vitest$/, /^@testing-library\//, /^node:/];

const IMPORT = /(?:import|export)\s[^'"]*?from\s+'([^']+)'|import\s+'([^']+)'/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name === 'node_modules' || name === 'dist') {
      return [];
    }
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return sourceFiles(path);
    }
    // Tooling (configs, the stylelint plugin) is not part of the public package.
    return /\.(ts|tsx)$/.test(name) && !name.endsWith('.config.ts')
      ? [path]
      : [];
  });
}

function specifiers(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  return [...text.matchAll(IMPORT)].map((match) => match[1] ?? match[2] ?? '');
}

describe('package boundary', () => {
  it('imports only React, React Aria, its own files and the test runner', () => {
    const violations: string[] = [];
    for (const file of sourceFiles(uiRoot)) {
      const rel = relative(uiRoot, file);
      const isTest = rel.startsWith('test/') || /\.(test|spec)\./.test(rel);
      for (const spec of specifiers(file)) {
        if (spec.startsWith('.')) {
          const target = resolve(join(file, '..'), spec);
          if (!target.startsWith(uiRoot)) {
            violations.push(`${rel} → ${spec}`);
          }
          continue;
        }
        const allowed =
          ALLOWED_BARE.some((pattern) => pattern.test(spec)) ||
          (isTest && ALLOWED_TEST.some((pattern) => pattern.test(spec)));
        if (!allowed) {
          violations.push(`${rel} → ${spec}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
