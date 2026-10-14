import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { listWorkspacePackages } from '@wsde/shared/workspace';
import { expect, test } from 'vitest';
import {
  isValidArea,
  isValidPackageOwner,
  mappingDangling,
  mappingOwnership,
  parseMapping,
  reasonsWithDocsPaths,
} from '#case-map/check.js';
import { enumerateNext } from '#case-map/enumerate.js';
import { PACKAGE_ROOT, WORKSPACE_ROOT } from '#case-map/root.js';

function loadMapping() {
  const parsed = parseMapping(
    JSON.parse(
      readFileSync(join(PACKAGE_ROOT, 'case-map/mapping.json'), 'utf8'),
    ),
  );
  if (!('mapping' in parsed)) {
    throw new Error(parsed.issues.join('\n'));
  }
  return parsed.mapping;
}

// The next side of the case map, without a master checkout: every next case that mapping.json names exists.

test('every next case named by mapping.json exists in the enumerated next cases', async () => {
  const mapping = loadMapping();
  const { cases, errors } = await enumerateNext(WORKSPACE_ROOT);
  expect(errors).toEqual([]);
  expect(
    mappingDangling(mapping, cases).map(({ id, next }) => `${id} -> ${next}`),
  ).toEqual([]);
}, 300_000);

test('every moved owner is a workspace package name', () => {
  const mapping = loadMapping();
  const packages = listWorkspacePackages(WORKSPACE_ROOT);
  const names = packages.map((entry) => entry.name);
  const { owners } = mappingOwnership(mapping);
  const invalid = owners.filter((owner) => !isValidPackageOwner(owner, names));
  expect(invalid).toEqual([]);
});

test('every moved area is a workspace directory that holds a package', () => {
  const mapping = loadMapping();
  const packages = listWorkspacePackages(WORKSPACE_ROOT);
  const dirs = packages.map((entry) => entry.dir);
  const { areas } = mappingOwnership(mapping);
  const invalid = areas.filter(
    (area) => !isValidArea(area, dirs, WORKSPACE_ROOT),
  );
  expect(invalid).toEqual([]);
});

test('no reason embeds a docs/ path', () => {
  expect(reasonsWithDocsPaths(loadMapping())).toEqual([]);
});
