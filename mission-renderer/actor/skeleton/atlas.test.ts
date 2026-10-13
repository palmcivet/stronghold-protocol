import { describe, expect, it } from 'vitest';
import { parseMissionAtlas } from '#actor/skeleton/atlas.js';
import { defined } from '#test/defined.js';

const ATLAS = [
  'unit.png',
  'size: 128,64',
  'format: RGBA8888',
  'filter: Linear,Linear',
  'repeat: none',
  'Arm',
  '  rotate: false',
  '  xy: 32, 16',
  '  size: 16, 8',
  '  orig: 20, 10',
  '  offset: 2, 1',
  '  index: -1',
  'Leg',
  '  rotate: true',
  '  xy: 0, 0',
  '  size: 10, 30',
  '  orig: 10, 30',
  '  offset: 0, 0',
  '  index: 3',
  '',
  'second.png',
  'size: 32,32',
  'format: RGBA8888',
  'filter: Linear,Linear',
  'repeat: none',
  'Head',
  '  rotate: false',
  '  xy: 0, 0',
  '  size: 32, 32',
  '  orig: 32, 32',
  '  offset: 0, 0',
  '  index: -1',
  '',
].join('\n');

describe('skeleton atlas', () => {
  it('reads pages and the regions of each page', () => {
    const atlas = parseMissionAtlas(ATLAS);
    expect(
      atlas.pages.map((page) => [page.name, page.width, page.height]),
    ).toEqual([
      ['unit.png', 128, 64],
      ['second.png', 32, 32],
    ]);
    expect(
      atlas.regions.map((region) => `${region.page.name}:${region.name}`),
    ).toEqual(['unit.png:Arm', 'unit.png:Leg', 'second.png:Head']);
  });

  it('gives the texture coordinates, offsets and original size of a region', () => {
    const arm = defined(parseMissionAtlas(ATLAS).findRegion('Arm'));
    expect([arm.u, arm.v, arm.u2, arm.v2]).toEqual([0.25, 0.25, 0.375, 0.375]);
    expect([
      arm.width,
      arm.height,
      arm.offsetX,
      arm.offsetY,
      arm.originalWidth,
      arm.originalHeight,
    ]).toEqual([16, 8, 2, 1, 20, 10]);
    expect(arm.rotate).toBe(false);
  });

  it('swaps the packed extent of a rotated region', () => {
    const leg = defined(parseMissionAtlas(ATLAS).findRegion('Leg'));
    expect(leg.rotate).toBe(true);
    expect(leg.degrees).toBe(90);
    expect([leg.u2, leg.v2]).toEqual([30 / 128, 10 / 64]);
    expect(leg.index).toBe(3);
    expect(parseMissionAtlas(ATLAS).findRegion('Tail')).toBeNull();
  });
});
