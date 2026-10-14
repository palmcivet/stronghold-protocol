import { settings } from '@pixi-spine/base';
import { afterEach, describe, expect, it } from 'vitest';
import { boardScaleY } from '#actor/skeleton/index.js';

const initial = settings.yDown;

/** pixi-spine 的全局 yDown 会翻转世界 y；骨骼的 scaleY 要抵消它，保持棋盘上 y 朝上。 */
describe('skeleton orientation', () => {
  afterEach(() => {
    settings.yDown = initial;
  });

  it('cancels the flip with -1 while yDown is set', () => {
    settings.yDown = true;
    expect(boardScaleY()).toBe(-1);
  });

  it('keeps 1 while yDown is off', () => {
    settings.yDown = false;
    expect(boardScaleY()).toBe(1);
  });
});
