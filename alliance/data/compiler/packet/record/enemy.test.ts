import { expect, test } from 'vitest';
import { MODEL_SCALES } from '#compiler/packet/record/enemy.js';

test('enemy model scales from the extractor are recorded in the enemy table', () => {
  expect(MODEL_SCALES.get(0.16)).toEqual(['1005_yokai_3']);
});
