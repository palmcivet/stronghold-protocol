import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SyntaxKind } from 'typescript/unstable/ast';
import { describe, expect, test } from 'vitest';
import {
  PACKAGE_ROOT,
  packageSources,
  type SourceToken,
  tokenize,
} from '#test/source.js';

const REPOSITORY_ROOT = join(PACKAGE_ROOT, '..');
const TRACE_TABLE = join(REPOSITORY_ROOT, 'docs/mission-core/14-trace.md');
const PACKAGE_SECTION = 'mission-core';

const TRACE_KINDS = ['assumed', 'source'] as const;
const MARKER = /^\/\/ TRACE: ([a-z]+\/[a-z0-9-]+(?:, ?[a-z]+\/[a-z0-9-]+)*)$/;
const TRACE_ID = /^(assumed|source)\/[a-z0-9-]+$/;

function isComment(token: SourceToken): boolean {
  return (
    token.kind === SyntaxKind.SingleLineCommentTrivia ||
    token.kind === SyntaxKind.MultiLineCommentTrivia
  );
}

interface TraceUse {
  readonly id: string;
  readonly line: number;
}

/** 文件里的追溯标记，以及写法不对的 TRACE 注释。 */
function traceMarkers(text: string): {
  readonly uses: readonly TraceUse[];
  readonly malformed: readonly string[];
} {
  const uses: TraceUse[] = [];
  const malformed: string[] = [];
  const lines = text.split('\n');
  for (const token of tokenize(text)) {
    if (!isComment(token) || !token.text.includes('TRACE:')) {
      continue;
    }
    const match = MARKER.exec(token.text);
    const lineText = (lines[token.line - 1] ?? '').trim();
    if (!match || lineText !== token.text) {
      malformed.push(`${token.line}: ${token.text}`);
      continue;
    }
    for (const id of (match[1] ?? '').split(',')) {
      uses.push({ id: id.trim(), line: token.line });
    }
  }
  return { uses, malformed };
}

/** 说明表里某个包一节的 id。 */
function tableIds(markdown: string, section: string): readonly string[] {
  const ids: string[] = [];
  let inside = false;
  for (const line of markdown.split('\n')) {
    if (line.startsWith('## ')) {
      inside = line.slice(3).trim().replaceAll('`', '') === section;
    }
    if (!inside) {
      continue;
    }
    const cell = /^\|\s*`([^`]+)`\s*\|/.exec(line);
    if (cell?.[1] !== undefined) {
      ids.push(cell[1]);
    }
  }
  return ids;
}

describe('trace markers', () => {
  const sources = packageSources();

  test('markers stand alone on their line in the documented form', () => {
    const found = sources.flatMap((file) =>
      traceMarkers(file.text).malformed.map((item) => `${file.path}:${item}`),
    );
    expect(found).toEqual([]);
  });

  test('every assumed and source id is in the table and every table row is referenced', () => {
    const table = tableIds(readFileSync(TRACE_TABLE, 'utf8'), PACKAGE_SECTION);
    for (const id of table) {
      expect(TRACE_ID.test(id), id).toBe(true);
    }
    const used = new Set(
      sources.flatMap((file) =>
        traceMarkers(file.text).uses.map((use) => use.id),
      ),
    );
    expect([...used].filter((id) => !table.includes(id))).toEqual([]);
    expect(table.filter((id) => !used.has(id))).toEqual([]);
  });

  test('every marker id has a known kind', () => {
    const ids = sources.flatMap((file) =>
      traceMarkers(file.text).uses.map((use) => use.id),
    );
    expect(
      ids.filter(
        (id) =>
          !TRACE_KINDS.some((kind) => id.startsWith(`${kind}/`)) ||
          !TRACE_ID.test(id),
      ),
    ).toEqual([]);
  });
});

describe('trace scanner', () => {
  test('accepts only a marker alone on its line', () => {
    const text = [
      '// TRACE: source/a, assumed/b',
      'const x = 1 // TRACE: source/c',
      '// TRACE: see the docs',
    ].join('\n');
    const { uses, malformed } = traceMarkers(text);
    expect(uses.map((use) => use.id)).toEqual(['source/a', 'assumed/b']);
    expect(malformed).toEqual([
      '2: // TRACE: source/c',
      '3: // TRACE: see the docs',
    ]);
  });

  test('reads the ids of one package section', () => {
    const markdown = [
      '## mission-core',
      '| id | rule |',
      '|---|---|',
      '| `source/a` | x |',
      '## mission-renderer',
      '| `source/b` | y |',
    ].join('\n');
    expect(tableIds(markdown, 'mission-core')).toEqual(['source/a']);
  });
});
