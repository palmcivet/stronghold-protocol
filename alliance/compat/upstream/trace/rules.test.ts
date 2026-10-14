import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { danglingReferences } from '@wsde/shared/references';
import { describe, expect, test } from 'vitest';
import { parseInventory } from '#case-map/check.js';
import { enumerateNext } from '#case-map/enumerate.js';
import { PACKAGE_ROOT, WORKSPACE_ROOT } from '#case-map/root.js';
import { contentHasSymbol } from '#trace/location.js';
import { TRACE_RULES } from '#trace/rules.js';
import {
  formatTraceLocation,
  parseTraceRules,
  TRACE_PACKAGES,
} from '#trace/schema.js';

describe('trace rules', () => {
  test('the table passes the schema and ids are unique', () => {
    expect(parseTraceRules(TRACE_RULES)).toEqual({ rules: TRACE_RULES });
  });

  test('every location file exists under the rule package', () => {
    const missing = TRACE_RULES.flatMap((entry) =>
      entry.location
        .map((loc) => join(WORKSPACE_ROOT, entry.package, loc.file))
        .filter((path) => !existsSync(path))
        .map((path) => `${entry.id} -> ${path}`),
    );
    expect(missing).toEqual([]);
  });

  test('every location symbol appears in its file', () => {
    const missing = TRACE_RULES.flatMap((entry) =>
      entry.location.flatMap((loc) => {
        if (loc.symbol === undefined) {
          return [];
        }
        const path = join(WORKSPACE_ROOT, entry.package, loc.file);
        const content = readFileSync(path, 'utf8');
        if (contentHasSymbol(content, loc.symbol)) {
          return [];
        }
        return [`${entry.id} -> ${loc.file}#${loc.symbol}`];
      }),
    );
    expect(missing).toEqual([]);
  });

  test('every next case belongs to the package of its rule', () => {
    const outside = TRACE_RULES.flatMap((entry) =>
      entry.next
        .filter((id) => !id.startsWith(`${entry.package}/`))
        .map((id) => `${entry.id} -> ${id}`),
    );
    expect(outside).toEqual([]);
  });

  test('every upstream case is in inventory.json', () => {
    const parsed = parseInventory(
      JSON.parse(
        readFileSync(join(PACKAGE_ROOT, 'case-map/inventory.json'), 'utf8'),
      ),
    );
    if (!('inventory' in parsed)) {
      throw new Error(parsed.issues.join('\n'));
    }
    const known = new Set(parsed.inventory.cases);
    const missing = TRACE_RULES.flatMap((entry) =>
      (entry.upstreamCases ?? [])
        .filter((id) => !known.has(id))
        .map((id) => `${entry.id} -> ${id}`),
    );
    expect(missing).toEqual([]);
  });

  test('every next case exists in the enumerated next cases', async () => {
    const { cases, errors } = await enumerateNext(WORKSPACE_ROOT, [
      ...TRACE_PACKAGES,
    ]);
    expect(errors).toEqual([]);
    const dangling = danglingReferences(
      TRACE_RULES.flatMap((entry) =>
        entry.next.map((id) => [entry.id, id] as const),
      ),
      cases,
    ).map(({ id, reference }) => `${id} -> ${reference}`);
    expect(dangling).toEqual([]);
  }, 300_000);
});

describe('trace schema', () => {
  const base = {
    id: 'source/a',
    package: 'mission-core' as const,
    rule: 'r',
    location: [{ file: 'x.ts', symbol: 'y' }],
    source: 's',
    basis: 'b',
    verified: 'v',
  };

  test('an entry without next cases needs a gap', () => {
    expect(parseTraceRules([{ ...base, next: [] }])).toHaveProperty('issues');
    expect(parseTraceRules([{ ...base, next: [], gap: 'g' }])).toHaveProperty(
      'rules',
    );
  });

  test('ids follow kind/name and are unique', () => {
    expect(
      parseTraceRules([{ ...base, id: 'interim/a', next: ['x'] }]),
    ).toHaveProperty('issues');
    expect(
      parseTraceRules([
        { ...base, next: ['x'] },
        { ...base, next: ['y'] },
      ]),
    ).toEqual({ issues: ['duplicate id: source/a'] });
  });

  test('location must list at least one file', () => {
    expect(
      parseTraceRules([{ ...base, location: [], next: ['x'] }]),
    ).toHaveProperty('issues');
  });
});

describe('formatTraceLocation and contentHasSymbol', () => {
  test('formatTraceLocation joins file and optional symbol', () => {
    expect(
      formatTraceLocation([{ file: 'a.ts', symbol: 'foo' }, { file: 'b.ts' }]),
    ).toBe('`a.ts`（`foo`）、`b.ts`');
  });

  test('contentHasSymbol matches identifiers, dotted paths, and id strings', () => {
    expect(
      contentHasSymbol('export const freezeFromCold = 1', 'freezeFromCold'),
    ).toBe(true);
    expect(
      contentHasSymbol(
        'export interface UnitSpec {\n  readonly immunity?: string[];\n}',
        'UnitSpec.immunity',
      ),
    ).toBe(true);
    expect(contentHasSymbol("id: 'engine:max-hp'", 'engine:max-hp')).toBe(true);
    expect(
      contentHasSymbol('const a = obj.freezeFromCold', 'obj.freezeFromCold'),
    ).toBe(true);
    expect(contentHasSymbol('// freezeFromCold', 'freezeFromCold')).toBe(false);
    expect(contentHasSymbol(' const x = 1', 'missing')).toBe(false);
  });
});
