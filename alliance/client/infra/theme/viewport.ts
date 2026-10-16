/**
 * Viewport / stage: landscape gate and a 1920×1080 contain fit.
 * When safe-area mode is on, the canvas sits in the viewport minus the insets.
 * `viewportStore` is the live source of truth; root CSS vars and data-* are a projection.
 */

import { createStore, type StoreApi } from 'zustand/vanilla';

/**
 * Fixed design canvas (16:9). Pages lay out once on this canvas; the canvas
 * scales to fit the viewport.
 */
export const DESIGN_SIZE: { readonly width: number; readonly height: number } =
  {
    width: 1920,
    height: 1080,
  };

/**
 * Uniform contain fit of the design rect into a viewport, optionally inset by a safe rect.
 * Surplus bands stay in the viewport and are painted by the backdrop.
 */
export interface FitLayout {
  readonly design: { readonly width: number; readonly height: number };
  readonly viewport: { readonly width: number; readonly height: number };
  /** Uniform scale so the design fits inside the safe rect (no crop). */
  readonly scale: number;
  /** Left edge of the scaled design in viewport CSS px (≥ 0). */
  readonly offsetX: number;
  /** Top edge of the scaled design in viewport CSS px (≥ 0). */
  readonly offsetY: number;
  readonly landscape: boolean;
}

export type SafeAreaMode = 'on' | 'off';

/** Resolved safe-area insets (CSS px). Zero when safe-area mode is off. */
export interface SafeInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface ViewportSize {
  readonly width: number;
  readonly height: number;
}

export interface ViewportState {
  readonly layout: FitLayout;
  readonly safeArea: SafeAreaMode;
  readonly safeInsets: SafeInsets;
}

const ZERO_INSETS: SafeInsets = { top: 0, right: 0, bottom: 0, left: 0 };

function initialLayout(): FitLayout {
  return fitLayout({ width: 1920, height: 1080 });
}

/** Live layout + safe-area. Updated by applyViewport / applySafeArea. */
export const viewportStore: StoreApi<ViewportState> =
  createStore<ViewportState>(() => ({
    layout: initialLayout(),
    safeArea: 'on',
    safeInsets: ZERO_INSETS,
  }));

/**
 * Contain fit: scale = min(innerW/dw, innerH/dh) so the whole design stays visible.
 * Insets shrink the rect the canvas is fit into; offset includes that inset plus centering.
 */
export function fitLayout(
  viewport: ViewportSize,
  design: {
    readonly width: number;
    readonly height: number;
  } = DESIGN_SIZE,
  insets: SafeInsets = ZERO_INSETS,
): FitLayout {
  const vw = Math.max(1, viewport.width);
  const vh = Math.max(1, viewport.height);
  const left = Math.max(0, insets.left);
  const right = Math.max(0, insets.right);
  const top = Math.max(0, insets.top);
  const bottom = Math.max(0, insets.bottom);
  const innerW = Math.max(1, vw - left - right);
  const innerH = Math.max(1, vh - top - bottom);
  const dw = Math.max(1, design.width);
  const dh = Math.max(1, design.height);
  const scale = Math.min(innerW / dw, innerH / dh);
  return {
    design: { width: dw, height: dh },
    viewport: { width: vw, height: vh },
    scale,
    offsetX: left + (innerW - dw * scale) / 2,
    offsetY: top + (innerH - dh * scale) / 2,
    landscape: vw >= vh,
  };
}

/** Map a client (viewport) point into design CSS px by undoing the fit scale. */
export function clientToDesign(
  clientX: number,
  clientY: number,
  layout: FitLayout,
  hostLeft = 0,
  hostTop = 0,
): { readonly x: number; readonly y: number } {
  return {
    x: (clientX - hostLeft - layout.offsetX) / layout.scale,
    y: (clientY - hostTop - layout.offsetY) / layout.scale,
  };
}

/** Current window size in CSS px. */
export function measureViewport(
  target: Window = globalThis.window,
): ViewportSize {
  return { width: target.innerWidth, height: target.innerHeight };
}

function parsePx(raw: string): number {
  const trimmed = raw.trim();
  if (!trimmed) {
    return 0;
  }
  const value = Number.parseFloat(trimmed);
  return Number.isFinite(value) ? value : 0;
}

/**
 * Resolve live safe-area insets.
 * Off → zeros. On → computed `--wsde-safe-*`, which track `env(safe-area-inset-*)`.
 * Components do not read those variables; the canvas offset already includes the inset.
 */
export function measureSafeInsets(
  mode: SafeAreaMode,
  target: Document = document,
): SafeInsets {
  if (mode === 'off') {
    return ZERO_INSETS;
  }
  const root = target.documentElement;
  if (!root) {
    return ZERO_INSETS;
  }
  const style = getComputedStyle(root);
  return {
    top: parsePx(style.getPropertyValue('--wsde-safe-top')),
    right: parsePx(style.getPropertyValue('--wsde-safe-right')),
    bottom: parsePx(style.getPropertyValue('--wsde-safe-bottom')),
    left: parsePx(style.getPropertyValue('--wsde-safe-left')),
  };
}

function writeLayout(layout: FitLayout, target: Document): void {
  const root = target.documentElement;
  root.dataset['orientation'] = layout.landscape ? 'landscape' : 'portrait';
  root.style.setProperty('--wsde-scale', String(layout.scale));
  root.style.setProperty('--wsde-offset-x', `${layout.offsetX}px`);
  root.style.setProperty('--wsde-offset-y', `${layout.offsetY}px`);
  root.style.setProperty('--wsde-design-width', String(layout.design.width));
  root.style.setProperty('--wsde-design-height', String(layout.design.height));
}

/** Fits the canvas and updates viewportStore. Safe-area mode is applied before the fit. */
export function applyViewport(
  viewport: ViewportSize,
  safeArea: SafeAreaMode,
  target: Document = document,
): void {
  const root = target.documentElement;
  root.dataset['safeArea'] = safeArea;
  const safeInsets = measureSafeInsets(safeArea, target);
  const layout = fitLayout(viewport, DESIGN_SIZE, safeInsets);
  writeLayout(layout, target);
  viewportStore.setState({ layout, safeArea, safeInsets });
}

/** Safe-area mode on the root; refits the canvas into the new rect. */
export function applySafeArea(
  mode: SafeAreaMode,
  target: Document = document,
): void {
  const { layout } = viewportStore.getState();
  applyViewport(layout.viewport, mode, target);
}

/**
 * Keeps the root and viewportStore in step with the window and the safe-area setting.
 * Returns a stop function.
 */
export function installViewport(
  safeArea: () => boolean,
  target: Window = globalThis.window,
): () => void {
  const doc = target.document;
  const paint = (): void => {
    applyViewport(measureViewport(target), safeArea() ? 'on' : 'off', doc);
  };
  paint();
  target.addEventListener('resize', paint);
  target.addEventListener('orientationchange', paint);
  return () => {
    target.removeEventListener('resize', paint);
    target.removeEventListener('orientationchange', paint);
  };
}

/** Test helper: restore default store state (does not clear DOM). */
export function resetViewportStore(): void {
  viewportStore.setState({
    layout: initialLayout(),
    safeArea: 'on',
    safeInsets: ZERO_INSETS,
  });
}
