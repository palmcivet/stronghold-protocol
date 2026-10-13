import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { danglingReferences } from '@wsde/shared/references';
import { describe, expect, test } from 'vitest';
import { parseInventory } from '#case-map/check.js';
import { enumerateNext } from '#case-map/enumerate.js';
import { PACKAGE_ROOT, WORKSPACE_ROOT } from '#case-map/root.js';
import { TRACE_RULES } from '#trace/rules.js';
import { parseTraceRules, TRACE_PACKAGES } from '#trace/schema.js';

describe('trace rules', () => {
  test('the table passes the schema and ids are unique', () => {
    expect(parseTraceRules(TRACE_RULES)).toEqual({ rules: TRACE_RULES });
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
    package: 'mission-core',
    rule: 'r',
    location: 'l',
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
});
