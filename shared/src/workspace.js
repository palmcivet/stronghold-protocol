// Workspace root and packages from pnpm itself:
// the root is the directory holding pnpm-workspace.yaml,
// the packages are what `pnpm ls` reports, so the workspace
// globs are never parsed here.

import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** @type {typeof import('../types/workspace.js').findUp} */
export function findUp(start, marker) {
  const from = resolve(start instanceof URL ? fileURLToPath(start) : start);
  let directory =
    existsSync(from) && !statSync(from).isDirectory() ? dirname(from) : from;
  for (;;) {
    if (existsSync(join(directory, marker))) {
      return directory;
    }
    const parent = dirname(directory);
    if (parent === directory) {
      throw new Error(`no ${marker} at or above ${from}`);
    }
    directory = parent;
  }
}

/** @type {typeof import('../types/workspace.js').findWorkspaceRoot} */
export function findWorkspaceRoot(start) {
  return findUp(start, 'pnpm-workspace.yaml');
}

/** @type {typeof import('../types/workspace.js').parsePnpmList} */
export function parsePnpmList(json, root) {
  const top = resolve(root);
  /** @type {readonly { name?: string; path: string }[]} */
  const entries = JSON.parse(json);
  return entries
    .map((entry) => ({ name: entry.name ?? '', dir: resolve(entry.path) }))
    .filter((entry) => entry.name !== '' && entry.dir !== top)
    .sort((a, b) => (a.dir < b.dir ? -1 : a.dir > b.dir ? 1 : 0));
}

/** @type {typeof import('../types/workspace.js').listWorkspacePackages} */
export function listWorkspacePackages(root) {
  const json = execFileSync('pnpm', ['ls', '-r', '--depth', '-1', '--json'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });
  return parsePnpmList(json, root);
}
