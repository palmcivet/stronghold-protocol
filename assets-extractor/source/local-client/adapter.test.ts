import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { extractorPackageRoot } from '#package-root.js';
import {
  AUTOCHESS_MAP_TEXTURE_KEYS,
  localClientFilesDirs,
  localClientSource,
} from '#source/local-client/adapter.js';
import type { SourceContext } from '#source/asset-source.js';

const filesRoot = join(
  extractorPackageRoot(),
  '.cache/assets/sources/local-client/files',
);
const hasCache = existsSync(join(filesRoot, 'map/autochess/TX_autochessi_D.png'));

function stubContext(cacheDir: string): SourceContext {
  return {
    cacheDir,
    files: {} as SourceContext['files'],
    repos: {} as SourceContext['repos'],
    offline: true,
    refreshIndex: false,
    ambiguous() {},
  };
}

test('localClientFilesDirs lists cache then package defaults', () => {
  const dirs = localClientFilesDirs('/tmp/extract-cache');
  expect(dirs[0]).toBe(
    join('/tmp/extract-cache', 'sources/local-client/files'),
  );
  expect(dirs[1]).toContain('sources/local-client/files');
});

test.skipIf(!hasCache)(
  'locate resolves autochess map textures from the extract cache',
  async () => {
    const source = localClientSource();
    const context = stubContext(join(extractorPackageRoot(), '.cache/assets'));
    await source.prepare(context);
    for (const key of AUTOCHESS_MAP_TEXTURE_KEYS) {
      const hit = await source.locate(key, context);
      expect(hit, key).not.toBeNull();
      expect(hit?.repo).toBeNull();
      expect(hit?.files[0]?.location).toMatch(/TX_autochessi_/);
    }
    const material = await source.locate(
      'json:material/autochess',
      context,
    );
    expect(material?.files[0]?.location).toMatch(/materials\.json$/);
  },
);
