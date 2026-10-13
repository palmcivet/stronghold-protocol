#!/usr/bin/env node
// 把 .cache/needs 下的全部需求清单交给 assets-extractor，结果写进提取缓存。
// 其余参数原样传给 `extract` 命令，例如 --offline、--force、--proxy <url>。

import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { extractCommand } from 'arknights-assets-extractor';
import { needsPackTypeError } from '#compiler/media/need/check.js';
import { dataWorkspace } from '#workspace.js';

const workspace = dataWorkspace();

function needListFiles(): string[] {
  try {
    return readdirSync(workspace.needsDir)
      .filter((name) => name.endsWith('.json'))
      .sort()
      .map((name) => join(workspace.needsDir, name));
  } catch {
    return [];
  }
}

/** Unreadable lists are left to the extractor, which reports them as before. */
function readText(path: string): string {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
}

const needs = needListFiles();
const packTypeError = needsPackTypeError(
  needs.map((path) => ({ path: resolve(path), text: readText(path) })),
);
if (needs.length === 0) {
  console.error(
    `extract:media: no need lists in ${workspace.needsDir}; run pnpm compile:needs first`,
  );
  process.exitCode = 2;
} else if (packTypeError !== null) {
  console.error(packTypeError);
  process.exitCode = 2;
} else {
  extractCommand([
    '--needs',
    ...needs,
    '--cache',
    workspace.extractCacheDir,
    ...process.argv.slice(2),
  ]).then(
    (code) => {
      process.exitCode = code;
    },
    (cause: unknown) => {
      console.error(cause instanceof Error ? cause.message : String(cause));
      process.exitCode = 2;
    },
  );
}
