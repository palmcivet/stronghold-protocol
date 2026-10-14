import { describe, expect, test } from 'vitest';
import {
  checkCaseMap,
  globToRegExp,
  hasFailures,
  isValidArea,
  isValidPackageOwner,
  type Mapping,
  mappingOwnership,
  parseInventory,
  parseMapping,
  reasonsWithDocsPaths,
} from '#case-map/check.js';
import { numberDuplicates } from '#case-map/enumerate.js';

function mapping(overrides: Partial<Mapping> = {}): Mapping {
  return {
    upstream: { repo: 'owner/repo', commit: '1db8e510' },
    caseByCase: ['sim/**'],
    rules: [{ match: 'ui/**', status: 'moved', owner: '@alliance/client' }],
    cases: {
      'sim/a.test.js::one': {
        status: 'covered',
        next: ['core/a.test.ts::a > one'],
      },
      'sim/a.test.js::two': { status: 'pending', step: 'ECS 5' },
    },
    ...overrides,
  };
}

describe('globToRegExp', () => {
  test('** crosses directories and * stays inside one', () => {
    expect(globToRegExp('ui/**').test('ui/deep/x.test.js::name')).toBe(true);
    expect(globToRegExp('*.test.js').test('root.test.js::name')).toBe(true);
    expect(globToRegExp('*.test.js').test('ui/x.test.js::name')).toBe(false);
  });

  test('after :: a star matches any characters, slashes included', () => {
    const pattern = globToRegExp('render/assets.test.js::*Spine*');
    expect(pattern.test('render/assets.test.js::loads a/b Spine model')).toBe(
      true,
    );
    expect(pattern.test('render/assets.test.js::loads an image')).toBe(false);
  });

  test('regular expression characters in the pattern are literal', () => {
    expect(globToRegExp('a.test.js::x (y)').test('a.test.js::x (y)')).toBe(
      true,
    );
    expect(globToRegExp('a.test.js::x (y)').test('aXtest.js::x (y)')).toBe(
      false,
    );
  });
});

describe('checkCaseMap', () => {
  const next = ['core/a.test.ts::a > one'];

  test('every case resolved by an entry or a rule passes', () => {
    const report = checkCaseMap({
      mapping: mapping(),
      inventory: null,
      master: ['sim/a.test.js::one', 'sim/a.test.js::two', 'ui/x.test.js::y'],
      next,
    });
    expect(report).toMatchObject({
      total: 3,
      byCase: 2,
      unmapped: [],
      dangling: [],
      notCaseByCase: [],
    });
    expect(report.byStatus).toEqual({
      covered: 1,
      rewritten: 0,
      moved: 1,
      'not-migrated': 0,
      pending: 1,
    });
    expect(report.byRule).toEqual({ 'ui/**': 1 });
    expect(hasFailures(report)).toBe(false);
  });

  test('a case with neither entry nor rule is unmapped', () => {
    const report = checkCaseMap({
      mapping: mapping(),
      inventory: null,
      master: ['match/x.test.js::y'],
      next,
    });
    expect(report.unmapped).toEqual(['match/x.test.js::y']);
    expect(hasFailures(report)).toBe(true);
  });

  test('a reference to a missing next case is dangling', () => {
    const report = checkCaseMap({
      mapping: mapping(),
      inventory: null,
      master: ['sim/a.test.js::one', 'sim/a.test.js::two'],
      next: [],
    });
    expect(report.dangling).toEqual([
      { id: 'sim/a.test.js::one', next: 'core/a.test.ts::a > one' },
    ]);
    expect(hasFailures(report)).toBe(true);
  });

  test('a case-by-case case resolved only by a rule fails', () => {
    const rules: Mapping['rules'] = [
      { match: 'sim/**', status: 'pending', step: 'ECS 6' },
    ];
    const report = checkCaseMap({
      mapping: mapping({ rules }),
      inventory: null,
      master: ['sim/b.test.js::three'],
      next,
    });
    expect(report.notCaseByCase).toEqual(['sim/b.test.js::three']);
    expect(hasFailures(report)).toBe(true);
  });

  test('the inventory gives new and vanished cases, and entries without a case are listed', () => {
    const inventory = {
      commit: '1db8e510',
      cases: ['sim/a.test.js::one', 'sim/a.test.js::gone'],
    };
    const report = checkCaseMap({
      mapping: mapping(),
      inventory,
      master: ['sim/a.test.js::one', 'ui/x.test.js::new'],
      next,
    });
    expect(report.added).toEqual(['ui/x.test.js::new']);
    expect(report.vanished).toEqual(['sim/a.test.js::gone']);
    expect(report.staleEntries).toEqual(['sim/a.test.js::two']);
    expect(hasFailures(report)).toBe(false);
  });

  test('a rule matching nothing is reported', () => {
    const report = checkCaseMap({
      mapping: mapping(),
      inventory: null,
      master: ['sim/a.test.js::one', 'sim/a.test.js::two'],
      next,
    });
    expect(report.unusedRules).toEqual(['ui/**']);
  });
});

describe('parseMapping', () => {
  test('accepts a complete mapping and fills caseByCase', () => {
    const { caseByCase: _ignored, ...rest } = mapping();
    const parsed = parseMapping(rest);
    expect(parsed).toEqual({ mapping: { ...mapping(), caseByCase: [] } });
  });

  test('each status needs its own field', () => {
    const parsed = parseMapping({
      ...mapping(),
      cases: {
        'a::1': { status: 'rewritten', next: ['x::y'] },
        'a::2': { status: 'not-migrated', reason: ' ' },
        'a::3': { status: 'pending' },
        'a::4': { status: 'covered', next: [] },
      },
    });
    expect('issues' in parsed && parsed.issues.length).toBe(4);
  });

  test('moved without owner or area fails', () => {
    const parsed = parseMapping({
      ...mapping(),
      cases: { 'a::1': { status: 'moved' } },
    });
    expect('issues' in parsed && parsed.issues).toEqual([
      'cases.a::1: moved needs owner and/or area',
    ]);
  });

  test('rules cannot claim coverage', () => {
    const parsed = parseMapping({
      ...mapping(),
      rules: [{ match: 'ui/**', status: 'covered', next: ['x::y'] }],
    });
    expect('issues' in parsed).toBe(true);
  });

  test('moved accepts owner, area, or both', () => {
    expect(
      parseMapping({
        ...mapping(),
        cases: {
          'a::1': { status: 'moved', owner: '@alliance/data' },
          'a::2': { status: 'moved', area: 'alliance' },
          'a::3': {
            status: 'moved',
            owner: '@alliance/client',
            area: 'alliance',
          },
        },
      }),
    ).toHaveProperty('mapping');
  });

  test('the inventory needs a commit and a case list', () => {
    expect(parseInventory({ commit: '1db8e510', cases: ['a::b'] })).toEqual({
      inventory: { commit: '1db8e510', cases: ['a::b'] },
    });
    expect('issues' in parseInventory({ cases: [] })).toBe(true);
  });
});

describe('enumeration helpers', () => {
  test('same names in one file get #2, #3 in order', () => {
    expect(numberDuplicates(['a', 'b', 'a', 'a > c', 'a'])).toEqual([
      'a',
      'b',
      'a #2',
      'a > c',
      'a #3',
    ]);
  });
});

describe('owner, area and reason checks', () => {
  const workspaceRoot = '/ws';
  const packageDirs = [
    '/ws/alliance/client',
    '/ws/alliance/data',
    '/ws/alliance/server',
    '/ws/assets-extractor',
  ];
  const packageNames = [
    '@alliance/client',
    '@alliance/data',
    '@alliance/server',
    'arknights-assets-extractor',
  ];

  test('owner is a workspace package name; area is a directory that holds packages', () => {
    expect(isValidPackageOwner('@alliance/client', packageNames)).toBe(true);
    expect(isValidPackageOwner('alliance/client', packageNames)).toBe(false);
    expect(isValidArea('alliance', packageDirs, workspaceRoot)).toBe(true);
    expect(isValidArea('missing', packageDirs, workspaceRoot)).toBe(false);
    expect(isValidArea('alliance/client', packageDirs, workspaceRoot)).toBe(
      true,
    );
  });

  test('mappingOwnership collects moved owners and areas', () => {
    expect(
      mappingOwnership(
        mapping({
          rules: [
            { match: 'ui/**', status: 'moved', owner: '@alliance/client' },
            { match: '*.test.js', status: 'moved', area: 'alliance' },
            {
              match: 'content/**',
              status: 'not-migrated',
              reason: 'later',
            },
          ],
          cases: {
            'a::1': { status: 'moved', owner: '@alliance/data' },
            'a::2': {
              status: 'covered',
              next: ['core/a.test.ts::a > one'],
            },
          },
        }),
      ),
    ).toEqual({
      owners: ['@alliance/client', '@alliance/data'],
      areas: ['alliance'],
    });
  });

  test('reasonsWithDocsPaths flags docs/ paths and ignores prose without them', () => {
    const withDocs = mapping({
      cases: {
        'a::1': {
          status: 'not-migrated',
          reason: '核心的限伤写在 docs/mission-core/06-damage.md',
        },
        'a::2': {
          status: 'not-migrated',
          reason: '限伤的行为由 mission-core 记载与实现',
        },
      },
    });
    expect(reasonsWithDocsPaths(withDocs)).toEqual([
      'case a::1: 核心的限伤写在 docs/mission-core/06-damage.md',
    ]);
    expect(
      reasonsWithDocsPaths(
        mapping({
          rules: [
            {
              match: 'x/**',
              status: 'not-migrated',
              reason: '见 docs/mission-core',
            },
          ],
        }),
      ),
    ).toEqual(['rule x/**: 见 docs/mission-core']);
  });
});
