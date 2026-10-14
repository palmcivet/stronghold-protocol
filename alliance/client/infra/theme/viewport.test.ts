// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import {
  applySafeArea,
  applyViewport,
  clampFontPx,
  clampSpacePx,
  clientToDesign,
  DENSITY_FACTOR,
  DESIGN_SIZE,
  densityOf,
  FONT_ROLE_BASE,
  fitLayout,
  projectTypeSpaceCss,
  resetViewportStore,
  SPACE_BASE,
  viewportStore,
  windowSizeClass,
} from './viewport.js';

describe('windowSizeClass', () => {
  it('maps Material 3 CSS px bands', () => {
    expect(windowSizeClass(375)).toBe('compact');
    expect(windowSizeClass(599)).toBe('compact');
    expect(windowSizeClass(600)).toBe('medium');
    expect(windowSizeClass(839)).toBe('medium');
    expect(windowSizeClass(840)).toBe('expanded');
    expect(windowSizeClass(1199)).toBe('expanded');
    expect(windowSizeClass(1200)).toBe('large');
    expect(windowSizeClass(1599)).toBe('large');
    expect(windowSizeClass(1600)).toBe('xlarge');
  });
});

describe('DESIGN_SIZE', () => {
  it('is the fixed 1920×1080 baseline', () => {
    expect(DESIGN_SIZE).toEqual({ width: 1920, height: 1080 });
  });
});

describe('fitLayout', () => {
  it('scales uniformly to contain with surplus fill bands', () => {
    const layout = fitLayout(
      { width: 2560, height: 1080 },
      DESIGN_SIZE,
      'xlarge',
    );
    expect(layout.scale).toBeCloseTo(1);
    expect(layout.offsetX).toBeCloseTo((2560 - 1920) / 2);
    expect(layout.offsetY).toBeCloseTo(0);
    expect(layout.landscape).toBe(true);
  });

  it('fills top/bottom when the viewport is taller than the design', () => {
    const layout = fitLayout(
      { width: 1920, height: 1200 },
      DESIGN_SIZE,
      'xlarge',
    );
    expect(layout.scale).toBeCloseTo(1);
    expect(layout.offsetX).toBeCloseTo(0);
    expect(layout.offsetY).toBeCloseTo((1200 - 1080) / 2);
  });

  it('always uses the fixed design baseline by default', () => {
    const phone = fitLayout({ width: 812, height: 375 });
    expect(phone.className).toBe('medium');
    expect(phone.design).toEqual(DESIGN_SIZE);
    // contain: min(812/1920, 375/1080) = 375/1080
    expect(phone.scale).toBeCloseTo(375 / 1080);
    expect(phone.offsetY).toBeCloseTo(0);
    expect(phone.offsetX).toBeGreaterThan(0);

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
});

describe('densityOf', () => {
  it('tiers from the short side', () => {
    expect(densityOf({ width: 812, height: 375 })).toEqual({
      density: 'compact',
      densityFactor: 1,
    });
    expect(densityOf({ width: 800, height: 360 })).toEqual({
      density: 'compact',
      densityFactor: 1,
    });
    expect(densityOf({ width: 1000, height: 600 })).toEqual({
      density: 'comfortable',
      densityFactor: 1.125,
    });
    expect(densityOf({ width: 1194, height: 834 })).toEqual({
      density: 'spacious',
      densityFactor: 1.25,
    });
    expect(densityOf({ width: 1920, height: 1080 })).toEqual({
      density: 'spacious',
      densityFactor: 1.25,
    });
  });

  it('ignores which edge is short', () => {
    expect(densityOf({ width: 375, height: 812 }).density).toBe('compact');
  });
});

describe('density clamps', () => {
  it('clamps font roles to 11–32', () => {
    expect(clampFontPx(10)).toBe(11);
    expect(clampFontPx(40)).toBe(32);
    expect(clampFontPx(FONT_ROLE_BASE.display * DENSITY_FACTOR.spacious)).toBe(
      30,
    );
  });

  it('clamps space to ≥4', () => {
    expect(clampSpacePx(2)).toBe(4);
    expect(clampSpacePx(SPACE_BASE[1] * 1)).toBe(4);
    expect(clampSpacePx(SPACE_BASE[6] * 1.25)).toBe(40);
  });
});

describe('clientToDesign', () => {
  it('unscales by the same fit factor', () => {
    const layout = fitLayout(
      { width: 1920, height: 1080 },
      DESIGN_SIZE,
      'xlarge',
    );
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
    delete root.dataset['breakpoint'];
    delete root.dataset['orientation'];
    delete root.dataset['safeArea'];
    delete root.dataset['density'];
    for (const prop of [
      '--wsde-layout-scale',
      '--wsde-design-width',
      '--wsde-design-height',
      '--wsde-layout-offset-x',
      '--wsde-layout-offset-y',
      '--wsde-density-factor',
      '--wsde-font-size-body',
      '--wsde-space-2',
      '--wsde-size-touch',
    ]) {
      root.style.removeProperty(prop);
    }
  });

  it('writes fit CSS and projects type/space from layout.scale', () => {
    const layout = fitLayout({ width: 1440, height: 900 });
    applyViewport(layout, 'on');
    const root = document.documentElement;
    expect(root.dataset['breakpoint']).toBe('large');
    expect(root.dataset['orientation']).toBe('landscape');
    expect(root.dataset['safeArea']).toBe('on');
    expect(root.dataset['density']).toBe('spacious');
    expect(root.style.getPropertyValue('--wsde-layout-scale')).toBe(
      String(layout.scale),
    );
    expect(root.style.getPropertyValue('--wsde-design-width')).toBe('1920');
    expect(root.style.getPropertyValue('--wsde-design-height')).toBe('1080');
    // Density mirrored only; type follows layout.scale.
    expect(root.style.getPropertyValue('--wsde-density-factor')).toBe('1.25');
    expect(root.style.getPropertyValue('--wsde-font-size-body')).toBe(
      `${clampFontPx(FONT_ROLE_BASE.body * layout.scale)}px`,
    );
    expect(root.style.getPropertyValue('--wsde-size-touch')).toBe('44px');
    const state = viewportStore.getState();
    expect(state.layout).toEqual(layout);
    expect(state.safeArea).toBe('on');
    expect(state.density).toBe('spacious');
    expect(state.densityFactor).toBe(1.25);
  });

  it('applySafeArea refreshes store mode and zeros insets when off without changing density', () => {
    const layout = fitLayout({ width: 812, height: 375 });
    applyViewport(layout, 'on');
    expect(viewportStore.getState().density).toBe('compact');
    applySafeArea('off');
    expect(document.documentElement.dataset['safeArea']).toBe('off');
    expect(viewportStore.getState().safeArea).toBe('off');
    expect(viewportStore.getState().safeInsets).toEqual({
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    });
    expect(viewportStore.getState().density).toBe('compact');
    expect(viewportStore.getState().densityFactor).toBe(1);
  });

  it('scales shell fonts with layout.scale across viewports', () => {
    const phone = fitLayout({ width: 812, height: 375 });
    applyViewport(phone, 'on');
    const bodyPhone = document.documentElement.style.getPropertyValue(
      '--wsde-font-size-body',
    );
    const scalePhone = Number(
      document.documentElement.style.getPropertyValue('--wsde-layout-scale'),
    );
    const desk = fitLayout({ width: 1920, height: 1080 });
    applyViewport(desk, 'on');
    const bodyDesk = document.documentElement.style.getPropertyValue(
      '--wsde-font-size-body',
    );
    const scaleDesk = Number(
      document.documentElement.style.getPropertyValue('--wsde-layout-scale'),
    );
    expect(bodyPhone).toBe(
      `${clampFontPx(FONT_ROLE_BASE.body * phone.scale)}px`,
    );
    expect(bodyDesk).toBe(`${clampFontPx(FONT_ROLE_BASE.body * desk.scale)}px`);
    expect(scalePhone).toBeLessThan(scaleDesk);
    // Density still mirrored, but does not drive type.
    expect(viewportStore.getState().density).toBe('spacious');
    expect(viewportStore.getState().densityFactor).toBe(1.25);
  });

  it('phone contain scale floors body to the font minimum', () => {
    const phone = fitLayout({ width: 800, height: 360 });
    applyViewport(phone, 'off');
    expect(viewportStore.getState().density).toBe('compact');
    expect(phone.scale).toBeLessThan(1);
    expect(
      document.documentElement.style.getPropertyValue('--wsde-font-size-body'),
    ).toBe(`${clampFontPx(FONT_ROLE_BASE.body * phone.scale)}px`);
  });
});

describe('projectTypeSpaceCss', () => {
  it('projects rounded role and space ladders from scale', () => {
    projectTypeSpaceCss(1.125);
    const root = document.documentElement;
    expect(root.style.getPropertyValue('--wsde-font-size-caption')).toBe(
      '12px',
    );
    expect(root.style.getPropertyValue('--wsde-font-size-label')).toBe('14px');
    expect(root.style.getPropertyValue('--wsde-font-size-body')).toBe('16px');
    expect(root.style.getPropertyValue('--wsde-font-size-title')).toBe('20px');
    expect(root.style.getPropertyValue('--wsde-font-size-display')).toBe(
      '27px',
    );
    expect(root.style.getPropertyValue('--wsde-space-1')).toBe('5px');
    expect(root.style.getPropertyValue('--wsde-space-2')).toBe('9px');
    expect(root.style.getPropertyValue('--wsde-space-8')).toBe('36px');
  });

  it('floors fonts at 11px when scale is small', () => {
    projectTypeSpaceCss(0.3);
    expect(
      document.documentElement.style.getPropertyValue('--wsde-font-size-body'),
    ).toBe('11px');
  });
});
