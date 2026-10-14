// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import {
  fitLayout,
  resetViewportStore,
  viewportStore,
} from '#infra/theme/viewport.js';
import {
  activeAspectFrame,
  hideAspect,
  isAspectVisible,
  showAspect,
  viewportRatioLabel,
} from './aspect.js';
import { getWsde, resetWsde } from './index.js';

afterEach(() => {
  resetWsde();
  resetViewportStore();
});

describe('aspect', () => {
  it('showAspect / hideAspect toggles visibility', () => {
    const api = getWsde()!;
    expect(api.isAspectVisible()).toBe(false);
    api.showAspect();
    expect(api.isAspectVisible()).toBe(true);
    expect(isAspectVisible()).toBe(true);
    api.hideAspect();
    expect(api.isAspectVisible()).toBe(false);
  });

  it('draws the live contain+bleed stage from layout', () => {
    const layout = fitLayout(
      { width: 1600, height: 1000 },
      { width: 16, height: 9 },
      'large',
    );
    viewportStore.setState({ layout });
    showAspect();
    const frame = activeAspectFrame();
    // contain: min(1600/16, 1000/9) = 100 → 1600×900 letterboxed
    expect(frame.width).toBeCloseTo(1600, 5);
    expect(frame.height).toBeCloseTo(900, 5);
    expect(frame.left).toBeCloseTo(0, 5);
    expect(frame.top).toBeCloseTo(50, 5);
    hideAspect();
  });

  it('pillarboxes when the viewport is wider than the design', () => {
    const layout = fitLayout(
      { width: 1600, height: 900 },
      { width: 1440, height: 900 },
      'large',
    );
    const frame = activeAspectFrame(layout);
    expect(frame.width).toBeCloseTo(1440, 5);
    expect(frame.height).toBeCloseTo(900, 5);
    expect(frame.left).toBeCloseTo(80, 5);
    expect(frame.top).toBeCloseTo(0, 5);
  });

  it('labels the current viewport ratio', () => {
    const label = viewportRatioLabel(1920, 1080);
    expect(label.ratio).toBe('16:9');
    expect(label.size).toBe('1920×1080');
  });
});
