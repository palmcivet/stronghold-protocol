import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { mappingDangling, parseMapping } from '#case-map/check.js';
import { enumerateNext } from '#case-map/enumerate.js';
import { PACKAGE_ROOT, WORKSPACE_ROOT } from '#case-map/root.js';

// The next side of the case map, without a master checkout: every next case that mapping.json names exists.

test('every next case named by mapping.json exists in the enumerated next cases', async () => {
  const parsed = parseMapping(
    JSON.parse(
      readFileSync(join(PACKAGE_ROOT, 'case-map/mapping.json'), 'utf8'),
    ),
  );
  if (!('mapping' in parsed)) {
    throw new Error(parsed.issues.join('\n'));
  }
  const { cases, errors } = await enumerateNext(WORKSPACE_ROOT);
  expect(errors).toEqual([]);
  expect(
    mappingDangling(parsed.mapping, cases).map(
      ({ id, next }) => `${id} -> ${next}`,
    ),
  ).toEqual([]);
}, 300_000);
