/**
 * Viewport / stage: landscape gate, 1920×1080 contain fit, safe-area bleed.
 * `viewportStore` is the live source of truth; root CSS vars and data-* are a projection.
 * Type / space follow `layout.scale`; density tiers are mirrored only (not shell chrome).
 */

import { createStore, type StoreApi } from 'zustand/vanilla';

/** Material 3 window size classes (CSS px width) — debug mirror only; not shell chrome. */
export const WINDOW_SIZE_CLASSES = [
  'compact',
  'medium',
  'expanded',
  'large',
  'xlarge',
] as const;

export type WindowSizeClass = (typeof WINDOW_SIZE_CLASSES)[number];

/** Upper bound (exclusive) for each class except xlarge; compact is below medium. */
export const WINDOW_SIZE_MAX: Readonly<Record<WindowSizeClass, number>> = {
  compact: 600,
  medium: 840,
  expanded: 1200,
  large: 1600,
  xlarge: Number.POSITIVE_INFINITY,
};

/**
 * Fixed design baseline (16:9). Breakpoints do not swap this; page shells use one
 * fixed design-canvas layout (no breakpoint-driven page reflow).
 */
export const DESIGN_SIZE: { readonly width: number; readonly height: number } =
  {
    width: 1920,
    height: 1080,
  };

/** Short-side density tiers — mirrored on the store / data-density; not shell chrome. */
export const DENSITY_TIERS = ['compact', 'comfortable', 'spacious'] as const;

export type DensityTier = (typeof DENSITY_TIERS)[number];

export const DENSITY_FACTOR: Readonly<Record<DensityTier, number>> = {
  compact: 1,
  comfortable: 1.125,
  spacious: 1.25,
};

/** Design-canvas base px for font roles; projected as clamp(11, round(base×layout.scale), 32). */
export const FONT_ROLE_BASE: Readonly<
  Record<'caption' | 'label' | 'body' | 'title' | 'display', number>
> = {
  caption: 11,
  label: 12,
  body: 14,
  title: 18,
  display: 24,
};

/** Design-canvas space ladder bases (px), keys 1–6. */
export const SPACE_BASE: Readonly<Record<1 | 2 | 3 | 4 | 5 | 6, number>> = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 24,
  6: 32,
};

export const TOUCH_MIN_PX = 44;
export const FONT_MIN_PX = 11;
export const FONT_MAX_PX = 32;
export const SPACE_MIN_PX = 4;
export const PADDING_MAX_PX = 48;

/**
 * Uniform contain fit of the design rect into a viewport.
 * Surplus bands are filled with background (map / decor / vignette) — not crop, not barren black letterbox.
 */
export interface FitLayout {
  readonly className: WindowSizeClass;
  readonly design: { readonly width: number; readonly height: number };
  readonly viewport: { readonly width: number; readonly height: number };
  /** Uniform scale so the design fits inside the viewport (no crop). */
  readonly scale: number;
  /** Left edge of the scaled design in viewport CSS px (≥ 0). */
  readonly offsetX: number;
  /** Top edge of the scaled design in viewport CSS px (≥ 0). */
  readonly offsetY: number;
  readonly landscape: boolean;
}

export type SafeAreaMode = 'on' | 'off';

/** Resolved safe-area insets applied to UI (CSS px). Zero when safe-area mode is off. */
export interface SafeInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface ViewportState {
  readonly layout: FitLayout;
  readonly safeArea: SafeAreaMode;
  readonly safeInsets: SafeInsets;
  readonly density: DensityTier;
  readonly densityFactor: number;
}

const ZERO_INSETS: SafeInsets = { top: 0, right: 0, bottom: 0, left: 0 };

function initialLayout(): FitLayout {
  return fitLayout({ width: 1920, height: 1080 });
}

function initialDensity(): {
  readonly density: DensityTier;
  readonly densityFactor: number;
} {
  return densityOf({ width: 1920, height: 1080 });
}

/** Live layout + safe-area + density mirror. Updated by applyViewport / applySafeArea. */
export const viewportStore: StoreApi<ViewportState> =
  createStore<ViewportState>(() => {
    const density = initialDensity();
    return {
      layout: initialLayout(),
      safeArea: 'on',
      safeInsets: ZERO_INSETS,
      density: density.density,
      densityFactor: density.densityFactor,
    };
  });

/** Window size class for a CSS px width (debug mirror). */
export function windowSizeClass(widthPx: number): WindowSizeClass {
  const width = Math.max(0, widthPx);
  if (width < WINDOW_SIZE_MAX.compact) {
    return 'compact';
  }
  if (width < WINDOW_SIZE_MAX.medium) {
    return 'medium';
  }
  if (width < WINDOW_SIZE_MAX.expanded) {
    return 'expanded';
  }
  if (width < WINDOW_SIZE_MAX.large) {
    return 'large';
  }
  return 'xlarge';
}

/**
 * Short-side density tier (store / data-density mirror only).
 * compact <500, comfortable <800, else spacious.
 */
export function densityOf(viewport: {
  readonly width: number;
  readonly height: number;
}): { readonly density: DensityTier; readonly densityFactor: number } {
  const shortSide = Math.min(
    Math.max(0, viewport.width),
    Math.max(0, viewport.height),
  );
  const density: DensityTier =
    shortSide < 500 ? 'compact' : shortSide < 800 ? 'comfortable' : 'spacious';
  return { density, densityFactor: DENSITY_FACTOR[density] };
}

export function clampFontPx(value: number): number {
  return Math.min(FONT_MAX_PX, Math.max(FONT_MIN_PX, Math.round(value)));
}

export function clampSpacePx(value: number): number {
  return Math.max(SPACE_MIN_PX, Math.round(value));
}

/**
 * Contain fit: scale = min(vw/dw, vh/dh) so the whole design stays visible.
 * Positive offsetX / offsetY are surplus fill bands painted with background.
 * Ignores safeInsets — bleed pads HUD, not the stage.
 */
export function fitLayout(
  viewport: { readonly width: number; readonly height: number },
  design: {
    readonly width: number;
    readonly height: number;
  } = DESIGN_SIZE,
  className: WindowSizeClass = windowSizeClass(viewport.width),
): FitLayout {
  const vw = Math.max(1, viewport.width);
  const vh = Math.max(1, viewport.height);
  const dw = Math.max(1, design.width);
  const dh = Math.max(1, design.height);
  const scale = Math.min(vw / dw, vh / dh);
  return {
    className,
    design: { width: dw, height: dh },
    viewport: { width: vw, height: vh },
    scale,
    offsetX: (vw - dw * scale) / 2,
    offsetY: (vh - dh * scale) / 2,
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

/** Contain layout of the current window against the fixed design baseline. */
export function measureViewport(target: Window = globalThis.window): FitLayout {
  const width = target.innerWidth;
  const height = target.innerHeight;
  return fitLayout({ width, height }, DESIGN_SIZE, windowSizeClass(width));
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
 * Resolve live safe-area insets for the store.
 * Off → zeros. On → computed `--wsde-safe-*` (which track env(safe-area-inset-*)).
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

/** Project font / space / touch CSS vars from the contain layout scale. */
export function projectTypeSpaceCss(
  scale: number,
  target: Document = document,
): void {
  const root = target.documentElement;
  const factor = Math.max(0, scale);

  const caption = clampFontPx(FONT_ROLE_BASE.caption * factor);
  const label = clampFontPx(FONT_ROLE_BASE.label * factor);
  const body = clampFontPx(FONT_ROLE_BASE.body * factor);
  const title = clampFontPx(FONT_ROLE_BASE.title * factor);
  const display = clampFontPx(FONT_ROLE_BASE.display * factor);

  root.style.setProperty('--wsde-font-size-caption', `${caption}px`);
  root.style.setProperty('--wsde-font-size-label', `${label}px`);
  root.style.setProperty('--wsde-font-size-body', `${body}px`);
  root.style.setProperty('--wsde-font-size-title', `${title}px`);
  root.style.setProperty('--wsde-font-size-display', `${display}px`);
  root.style.setProperty('--wsde-font-size-xs', `${caption}px`);
  root.style.setProperty('--wsde-font-size-sm', `${label}px`);
  root.style.setProperty('--wsde-font-size-md', `${body}px`);
  root.style.setProperty('--wsde-font-size-lg', `${title}px`);
  root.style.setProperty('--wsde-font-size-xl', `${display}px`);
  root.style.setProperty('--wsde-font-size-2xl', `${display}px`);

  const s1 = clampSpacePx(SPACE_BASE[1] * factor);
  const s2 = clampSpacePx(SPACE_BASE[2] * factor);
  const s3 = clampSpacePx(SPACE_BASE[3] * factor);
  const s4 = clampSpacePx(SPACE_BASE[4] * factor);
  const s5 = clampSpacePx(SPACE_BASE[5] * factor);
  const s6 = clampSpacePx(SPACE_BASE[6] * factor);
  root.style.setProperty('--wsde-space-1', `${s1}px`);
  root.style.setProperty('--wsde-space-2', `${s2}px`);
  root.style.setProperty('--wsde-space-3', `${s3}px`);
  root.style.setProperty('--wsde-space-4', `${s4}px`);
  root.style.setProperty('--wsde-space-5', `${s5}px`);
  // `--wsde-space-6` is ladder step 5; `--wsde-space-8` is ladder step 6.
  root.style.setProperty('--wsde-space-6', `${s5}px`);
  root.style.setProperty('--wsde-space-8', `${s6}px`);

  root.style.setProperty('--wsde-size-touch', `${TOUCH_MIN_PX}px`);
  root.style.setProperty('--wsde-padding-max', `${PADDING_MAX_PX}px`);
}

function projectViewport(
  layout: FitLayout,
  safeArea: SafeAreaMode,
  density: DensityTier,
  densityFactor: number,
  target: Document,
): SafeInsets {
  const root = target.documentElement;
  root.dataset['breakpoint'] = layout.className;
  root.dataset['orientation'] = layout.landscape ? 'landscape' : 'portrait';
  root.dataset['safeArea'] = safeArea;
  root.dataset['density'] = density;
  root.style.setProperty('--wsde-layout-scale', String(layout.scale));
  root.style.setProperty('--wsde-design-width', String(layout.design.width));
  root.style.setProperty('--wsde-design-height', String(layout.design.height));
  root.style.setProperty('--wsde-layout-offset-x', `${layout.offsetX}px`);
  root.style.setProperty('--wsde-layout-offset-y', `${layout.offsetY}px`);
  root.style.setProperty('--wsde-density-factor', String(densityFactor));
  // Geometry and type/space share layout.scale; density is mirror-only.
  projectTypeSpaceCss(layout.scale, target);
  // Read after data-safe-area so --wsde-safe-* resolve against the active mode.
  return measureSafeInsets(safeArea, target);
}

/** Writes fit + type/space CSS and updates viewportStore. */
export function applyViewport(
  layout: FitLayout,
  safeArea: SafeAreaMode,
  target: Document = document,
): void {
  const { density, densityFactor } = densityOf(layout.viewport);
  const safeInsets = projectViewport(
    layout,
    safeArea,
    density,
    densityFactor,
    target,
  );
  viewportStore.setState({
    layout,
    safeArea,
    safeInsets,
    density,
    densityFactor,
  });
}

/** Safe-area mode on the root; refreshes store insets (layout + density unchanged). */
export function applySafeArea(
  mode: SafeAreaMode,
  target: Document = document,
): void {
  const { layout, density, densityFactor } = viewportStore.getState();
  const safeInsets = projectViewport(
    layout,
    mode,
    density,
    densityFactor,
    target,
  );
  viewportStore.setState({ safeArea: mode, safeInsets });
}

/**
 * Keeps the root and viewportStore in step with the window and the safe-area setting. Returns a stop function.
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
  const density = initialDensity();
  viewportStore.setState({
    layout: initialLayout(),
    safeArea: 'on',
    safeInsets: ZERO_INSETS,
    density: density.density,
    densityFactor: density.densityFactor,
  });
}
