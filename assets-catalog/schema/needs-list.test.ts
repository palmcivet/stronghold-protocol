import { expect, test } from 'vitest';
import { isNeedsList, needsListIssues } from '#schema/needs-list.js';

const LIST = {
  schemaVersion: 1,
  pack: { type: 'base', id: 'base' },
  needs: [
    { key: 'image:char/avatar/char_002_amiya', required: true },
    { key: 'image:char/avatar/char_002_amiya_2', required: false },
    {
      key: 'spine:enemy/enemy_1305_mhslim',
      required: false,
      absent: 'not in Ark-Models',
    },
    { key: 'spine:enemy/enemy_1007_slime', required: true },
  ],
};

test('the sample needs list passes', () => {
  expect(needsListIssues(LIST)).toEqual([]);
  expect(isNeedsList(LIST)).toBe(true);
});

test('bad needs lists report each problem with its path', () => {
  expect(needsListIssues(null)).toEqual([
    { path: '$', message: 'expected an object' },
  ]);
  expect(
    needsListIssues({
      schemaVersion: 2,
      pack: { type: '', id: '' },
      needs: [
        { key: 'image:x.png', required: true },
        { key: 'image:a', required: 'yes' },
        { key: 'image:a', required: true },
        { key: 'image:b', required: true, absent: 'only in the client' },
        { key: 'image:c', required: false, absent: '' },
      ],
    }),
  ).toEqual([
    { path: 'schemaVersion', message: 'expected one of 1' },
    { path: 'pack.type', message: 'expected a non-empty string' },
    { path: 'pack.id', message: 'expected a non-empty string' },
    {
      path: 'needs[0].key',
      message:
        "invalid asset key: segment \"x.png\" may only use letters, digits, '_' and '-'",
    },
    { path: 'needs[1].required', message: 'expected a boolean' },
    { path: 'needs[2].key', message: 'image:a is listed twice' },
    {
      path: 'needs[3].absent',
      message: 'a required need cannot be absent upstream',
    },
    { path: 'needs[4].absent', message: 'expected a non-empty string' },
  ]);
  expect(isNeedsList({ ...LIST, needs: undefined })).toBe(false);
});

test('the pack type is any non-empty string named by the pack author', () => {
  expect(
    needsListIssues({ ...LIST, pack: { type: 'mod', id: 'boss-bgm' } }),
  ).toEqual([]);
  expect(needsListIssues({ ...LIST, pack: { type: 3, id: 'base' } })).toEqual([
    { path: 'pack.type', message: 'expected a non-empty string' },
  ]);
});
