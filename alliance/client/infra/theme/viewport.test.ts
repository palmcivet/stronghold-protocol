// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import {
  applySafeArea,
  applyViewport,
  clientToDesign,
  DESIGN_SIZE,
  fitLayout,
  resetViewportStore,
  viewportStore,
} from './viewport.js';

describe('DESIGN_SIZE', () => {
  it('is the fixed 1920×1080 baseline', () => {
    expect(DESIGN_SIZE).toEqual({ width: 1920, height: 1080 });
  });
});

describe('fitLayout', () => {
  it('scales uniformly to contain with surplus fill bands', () => {
    const layout = fitLayout({ width: 2560, height: 1080 });
    expect(layout.scale).toBeCloseTo(1);
    expect(layout.offsetX).toBeCloseTo((2560 - 1920) / 2);
    expect(layout.offsetY).toBeCloseTo(0);
    expect(layout.landscape).toBe(true);
  });

  it('fills top and bottom when the viewport is taller than the design', () => {
    const layout = fitLayout({ width: 1920, height: 1200 });
    expect(layout.scale).toBeCloseTo(1);
    expect(layout.offsetX).toBeCloseTo(0);
    expect(layout.offsetY).toBeCloseTo((1200 - 1080) / 2);
    expect(layout.landscape).toBe(true);
  });

  it('uses the fixed design baseline by default', () => {
    const phone = fitLayout({ width: 812, height: 375 });
    expect(phone.design).toEqual(DESIGN_SIZE);
    expect(phone.scale).toBeCloseTo(375 / 1080);
    expect(phone.offsetY).toBeCloseTo(0);
    expect(phone.offsetX).toBeGreaterThan(0);
    expect(phone.landscape).toBe(true);

    const exact = fitLayout(DESIGN_SIZE);
    expect(exact.scale).toBe(1);
    expect(exact.offsetX).toBe(0);
    expect(exact.offsetY).toBe(0);
  });

  it('keeps the full design visible on ultrawide and tall fixtures', () => {
    const wide = fitLayout({ width: 2560, height: 1080 });
    expect(wide.design.width * wide.scale).toBeCloseTo(1920);
    expect(wide.design.height * wide.scale).toBeCloseTo(1080);

    const tall = fitLayout({ width: 1920, height: 1200 });
    expect(tall.design.width * tall.scale).toBeCloseTo(1920);
    expect(tall.design.height * tall.scale).toBeCloseTo(1080);
  });

  it('fits the canvas inside the safe rect', () => {
    const layout = fitLayout({ width: 2000, height: 1100 }, DESIGN_SIZE, {
      top: 20,
      right: 40,
      bottom: 0,
      left: 40,
    });
    const innerW = 2000 - 80;
    const innerH = 1100 - 20;
    const scale = Math.min(innerW / 1920, innerH / 1080);
    expect(layout.scale).toBeCloseTo(scale);
    expect(layout.offsetX).toBeCloseTo(40 + (innerW - 1920 * scale) / 2);
    expect(layout.offsetY).toBeCloseTo(20 + (innerH - 1080 * scale) / 2);
  });

  it('marks portrait from the full viewport', () => {
    expect(fitLayout({ width: 390, height: 844 }).landscape).toBe(false);
  });
});

describe('clientToDesign', () => {
  it('unscales by the same fit factor', () => {
    const layout = fitLayout(DESIGN_SIZE);
    expect(layout.scale).toBe(1);
    expect(clientToDesign(100, 50, layout)).toEqual({ x: 100, y: 50 });
    expect(clientToDesign(100, 50, layout, 20, 10)).toEqual({ x: 80, y: 40 });
  });

  it('round-trips a phone contain scale', () => {
    const layout = fitLayout({ width: 812, height: 375 });
    const design = clientToDesign(
      layout.offsetX + 100 * layout.scale,
      layout.offsetY + 50 * layout.scale,
      layout,
    );
    expect(design.x).toBeCloseTo(100);
    expect(design.y).toBeCloseTo(50);
  });
});

describe('applyViewport', () => {
  afterEach(() => {
    resetViewportStore();
    const root = document.documentElement;
    delete root.dataset['orientation'];
    delete root.dataset['safeArea'];
    for (const prop of [
      '--wsde-scale',
      '--wsde-offset-x',
      '--wsde-offset-y',
      '--wsde-safe-top',
      '--wsde-safe-right',
      '--wsde-safe-bottom',
      '--wsde-safe-left',
    ]) {
      root.style.removeProperty(prop);
    }
  });

  it('writes scale, offsets and orientation', () => {
    applyViewport({ width: 2560, height: 1080 }, 'off');
    const root = document.documentElement;
    expect(root.dataset['orientation']).toBe('landscape');
    expect(root.dataset['safeArea']).toBe('off');
    expect(root.dataset['breakpoint']).toBeUndefined();
    expect(root.dataset['density']).toBeUndefined();
    expect(root.style.getPropertyValue('--wsde-scale')).toBe('1');
    expect(root.style.getPropertyValue('--wsde-offset-x')).toBe('320px');
    expect(root.style.getPropertyValue('--wsde-offset-y')).toBe('0px');
    expect(viewportStore.getState().safeInsets).toEqual({
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    });
  });

  it('insets the canvas when safe-area probes are set', () => {
    const root = document.documentElement;
    root.style.setProperty('--wsde-safe-top', '12px');
    root.style.setProperty('--wsde-safe-right', '8px');
    root.style.setProperty('--wsde-safe-bottom', '0px');
    root.style.setProperty('--wsde-safe-left', '8px');
    applyViewport({ width: 1920, height: 1080 }, 'on');
    const layout = viewportStore.getState().layout;
    expect(viewportStore.getState().safeInsets).toEqual({
      top: 12,
      right: 8,
      bottom: 0,
      left: 8,
    });
    expect(layout.offsetX).toBeGreaterThanOrEqual(8);
    expect(layout.offsetY).toBeGreaterThanOrEqual(12);
    expect(layout.scale).toBeLessThan(1);
  });

  it('ignores safe-area probes when the mode is off', () => {
    const root = document.documentElement;
    root.style.setProperty('--wsde-safe-top', '40px');
    applyViewport({ width: 1920, height: 1080 }, 'off');
    expect(viewportStore.getState().safeInsets.top).toBe(0);
    expect(viewportStore.getState().layout.scale).toBe(1);
  });

  it('refits when the safe-area mode changes', () => {
    const root = document.documentElement;
    root.style.setProperty('--wsde-safe-left', '30px');
    root.style.setProperty('--wsde-safe-right', '30px');
    applyViewport({ width: 1920, height: 1080 }, 'off');
    applySafeArea('on');
    expect(viewportStore.getState().safeArea).toBe('on');
    expect(viewportStore.getState().layout.scale).toBeLessThan(1);
  });
});
