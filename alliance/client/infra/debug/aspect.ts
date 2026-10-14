/** Aspect visibility — design stage outline vs fill bands from viewportStore.layout. */

import { type FitLayout, viewportStore } from '#infra/theme/viewport.js';

export interface AspectFrame {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

let visible = false;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

/** Show aspect overlay for the live stage frame in viewportStore. */
export function showAspect(): void {
  visible = true;
  notify();
}

export function hideAspect(): void {
  if (!visible) {
    return;
  }
  visible = false;
  notify();
}

export function isAspectVisible(): boolean {
  return visible;
}

export function subscribeAspect(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function gcd(a: number, b: number): number {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y !== 0) {
    const next = x % y;
    x = y;
    y = next;
  }
  return x || 1;
}

/** Ratio label: reduced integers when near-integers, else one-decimal. */
export function viewportRatioLabel(
  width: number,
  height: number,
): { readonly ratio: string; readonly size: string } {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const rw = Math.round(w);
  const rh = Math.round(h);
  const nearInt = Math.abs(w - rw) < 0.5 && Math.abs(h - rh) < 0.5;
  let ratio: string;
  if (nearInt) {
    const g = gcd(rw, rh);
    ratio = `${rw / g}:${rh / g}`;
  } else {
    ratio = `${(w / h).toFixed(1)}:1`;
  }
  return {
    ratio,
    size: `${Math.round(w)}×${Math.round(h)}`,
  };
}

/**
 * Live stage frame from contain layout (same geometry as .wsde-layout-stage).
 * Surplus outside this frame is fill-band background (map / decor / vignette).
 */
export function activeAspectFrame(
  layout: FitLayout = viewportStore.getState().layout,
): AspectFrame {
  return {
    left: layout.offsetX,
    top: layout.offsetY,
    width: layout.design.width * layout.scale,
    height: layout.design.height * layout.scale,
  };
}

/** Test helper. */
export function resetAspect(): void {
  visible = false;
  notify();
}
