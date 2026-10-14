/**
 * Local Unity client art already extracted by `extract.py` into
 * `.cache/assets/sources/local-client/files`. No `--game` probe here: when the cache is empty,
 * locate returns null and the extract run continues without error.
 *
 * Path → key (REMAIN):
 *   map/<theme>/<name>.png|.webp → texture:map/<theme>/<name>
 *   map/<theme>/materials.json   → json:material/<theme>
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  type AssetKey,
  formatAssetKey,
  parseAssetKey,
} from 'arknights-assets-catalog';
import { extractorPackageRoot } from '#package-root.js';
import type {
  AssetSource,
  SourceContext,
  SourceFile,
  SourceHit,
} from '#source/asset-source.js';

/** Subdir under a cache root that holds the Python extract output. */
export const LOCAL_CLIENT_FILES_SUBDIR = join(
  'sources',
  'local-client',
  'files',
);

/** Prefer the extract-cache copy, then the extractor package's own cache (pnpm extract:local default). */
export function localClientFilesDirs(
  cacheDir: string | null | undefined,
): readonly string[] {
  const dirs: string[] = [];
  if (cacheDir) {
    dirs.push(join(cacheDir, LOCAL_CLIENT_FILES_SUBDIR));
  }
  dirs.push(
    join(extractorPackageRoot(), '.cache', 'assets', LOCAL_CLIENT_FILES_SUBDIR),
  );
  return dirs;
}

function firstExistingDir(dirs: readonly string[]): string | null {
  for (const dir of dirs) {
    if (existsSync(dir)) {
      return dir;
    }
  }
  return null;
}

function fileIfExists(path: string): string | null {
  return existsSync(path) ? path : null;
}

/** Prefer PNG (catalog default for textures); fall back to WebP when PNG is absent. */
function textureFiles(
  root: string,
  theme: string,
  name: string,
): SourceFile[] | null {
  const base = join(root, 'map', theme, name);
  const png = fileIfExists(`${base}.png`);
  const webp = fileIfExists(`${base}.webp`);
  const location = png ?? webp;
  return location ? [{ role: 'main', name: null, location }] : null;
}

function materialFiles(root: string, theme: string): SourceFile[] | null {
  const path = fileIfExists(join(root, 'map', theme, 'materials.json'));
  return path ? [{ role: 'main', name: null, location: path }] : null;
}

export function localClientSource(): AssetSource {
  let root: string | null = null;

  return {
    id: 'local-client',
    covers: [
      { kind: 'texture', namespace: 'map' },
      { kind: 'json', namespace: 'material' },
    ],
    async prepare(context: SourceContext) {
      root = firstExistingDir(localClientFilesDirs(context.cacheDir));
    },
    async locate(
      key: AssetKey,
      _context: SourceContext,
    ): Promise<SourceHit | null> {
      if (!root) {
        return null;
      }
      const { kind, segments } = parseAssetKey(key);
      if (kind === 'texture' && segments[0] === 'map' && segments.length >= 3) {
        const theme = segments[1]!;
        const name = segments.slice(2).join('/');
        const files = textureFiles(root, theme, name);
        if (!files) {
          return null;
        }
        return {
          path: `map/${theme}/${name}`,
          revision: null,
          files,
          dependsOn: [],
          repo: null,
        };
      }
      if (
        kind === 'json' &&
        segments[0] === 'material' &&
        segments.length === 2
      ) {
        const theme = segments[1]!;
        const files = materialFiles(root, theme);
        if (!files) {
          return null;
        }
        return {
          path: `map/${theme}/materials.json`,
          revision: null,
          files,
          dependsOn: [],
          repo: null,
        };
      }
      return null;
    },
  };
}

/** Keys the autochess map extract commonly provides (for install / smoke). */
export const AUTOCHESS_MAP_TEXTURE_KEYS: readonly AssetKey[] = Object.freeze([
  formatAssetKey('texture', 'map/autochess/TX_autochessi_D'),
  formatAssetKey('texture', 'map/autochess/TX_autochessi_N_rgb'),
  formatAssetKey('texture', 'map/autochess/TX_autochessi_M_rough'),
  formatAssetKey('texture', 'map/autochess/TX_autochessi_E'),
  formatAssetKey('texture', 'map/autochess/TX_autochessi_common_D'),
  formatAssetKey('texture', 'map/autochess/TX_autochessi_common_E'),
  formatAssetKey('texture', 'map/autochess/TX_autochessi_BG'),
]);
