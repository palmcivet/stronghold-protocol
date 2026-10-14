import { expect, test } from 'vitest';
import {
  attackRangeFromRadius,
  MODEL_SCALES,
} from '#compiler/packet/record/enemy.js';

test('enemy model scales from the extractor are recorded in the enemy table', () => {
  expect(MODEL_SCALES.get(0.16)).toEqual(['1005_yokai_3']);
});

test('attackRangeFromRadius expands a circle into facing-RIGHT cells', () => {
  expect(attackRangeFromRadius(0)).toEqual([[1, 0]]);
  expect(attackRangeFromRadius(1)).toEqual(
    expect.arrayContaining([
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]),
  );
});
