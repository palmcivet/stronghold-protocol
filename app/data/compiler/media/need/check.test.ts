import { expect, test } from 'vitest';
import { needsPackTypeError } from '#compiler/media/need/check.js';

const list = (type: unknown, extra: Record<string, unknown> = {}): string =>
  JSON.stringify({
    schemaVersion: 1,
    pack: { type, id: 'base' },
    needs: [{ key: 'image:a', required: true }],
    ...extra,
  });

test('base and season lists pass', () => {
  expect(
    needsPackTypeError([
      { path: '/n/base.json', text: list('base') },
      { path: '/n/season.json', text: list('season') },
    ]),
  ).toBeNull();
});

test('another pack type fails with the message the extractor gave before', () => {
  expect(
    needsPackTypeError([
      { path: '/n/base.json', text: list('base') },
      { path: '/n/mod.json', text: list('mod') },
    ]),
  ).toBe(
    'extract: /n/mod.json: invalid needs list: pack.type: expected one of "base", "season"',
  );
});

test('the pack type issue keeps its place among the other issues', () => {
  expect(
    needsPackTypeError([
      {
        path: '/n/x.json',
        text: list('', { schemaVersion: 2, pack: { type: '', id: '' } }),
      },
    ]),
  ).toBe(
    'extract: /n/x.json: invalid needs list: schemaVersion: expected one of 1; pack.type: expected one of "base", "season"; pack.id: expected a non-empty string',
  );
});

test('lists that fail for other reasons first are left to the extractor', () => {
  expect(
    needsPackTypeError([
      { path: '/n/a.json', text: '{' },
      { path: '/n/b.json', text: list('mod') },
    ]),
  ).toBeNull();
  expect(
    needsPackTypeError([
      { path: '/n/a.json', text: list('base', { needs: 'x' }) },
      { path: '/n/b.json', text: list('mod') },
    ]),
  ).toBeNull();
});
