import { useEffect, useState, useSyncExternalStore } from 'react';
import { viewportStore } from '#infra/theme/viewport.js';
import {
  activeAspectFrame,
  isAspectVisible,
  subscribeAspect,
  viewportRatioLabel,
} from './aspect.js';
import {
  isBleedVisible,
  type ResolvedBleedInsets,
  resolveBleedInsets,
  subscribeBleed,
} from './bleed.js';
import './debug.css';
import {
  getHighlightTarget,
  isHighlighting,
  matchesHighlight,
  subscribeHighlight,
} from './highlight.js';
import { getMountedSnapshot, subscribeMounts } from './mount.js';
import { partAtPoint } from './query.js';

interface Box {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly label: string;
}

function unionChildRects(element: Element): Omit<Box, 'label'> | null {
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  let found = false;
  for (const child of element.children) {
    const rect = child.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      continue;
    }
    found = true;
    left = Math.min(left, rect.left);
    top = Math.min(top, rect.top);
    right = Math.max(right, rect.right);
    bottom = Math.max(bottom, rect.bottom);
  }
  if (!found) {
    const self = element.getBoundingClientRect();
    if (self.width <= 0 || self.height <= 0) {
      return null;
    }
    return {
      left: self.left,
      top: self.top,
      width: self.width,
      height: self.height,
    };
  }
  return { left, top, width: right - left, height: bottom - top };
}

function measureHighlightBoxes(): Box[] {
  const filter = getHighlightTarget();
  if (!filter) {
    return [];
  }
  const boxes: Box[] = [];
  for (const record of getMountedSnapshot()) {
    if (!matchesHighlight(record.partId, record.slotId, filter)) {
      continue;
    }
    const box = unionChildRects(record.element);
    if (!box) {
      continue;
    }
    boxes.push({ ...box, label: record.partId });
  }
  return boxes;
}

function bleedBands(
  insets: ResolvedBleedInsets,
  vw: number,
  vh: number,
): Box[] {
  const { top, right, bottom, left } = insets;
  const bands: Box[] = [];
  if (top > 0) {
    bands.push({
      left: 0,
      top: 0,
      width: vw,
      height: top,
      label: 'top',
    });
  }
  if (bottom > 0) {
    bands.push({
      left: 0,
      top: vh - bottom,
      width: vw,
      height: bottom,
      label: 'bottom',
    });
  }
  if (left > 0) {
    bands.push({
      left: 0,
      top,
      width: left,
      height: Math.max(0, vh - top - bottom),
      label: 'left',
    });
  }
  if (right > 0) {
    bands.push({
      left: vw - right,
      top,
      width: right,
      height: Math.max(0, vh - top - bottom),
      label: 'right',
    });
  }
  return bands;
}

function aspectBands(
  frame: { left: number; top: number; width: number; height: number },
  vw: number,
  vh: number,
): Box[] {
  const bands: Box[] = [];
  if (frame.top > 0.5) {
    bands.push({
      left: 0,
      top: 0,
      width: vw,
      height: frame.top,
      label: 'top',
    });
    bands.push({
      left: 0,
      top: frame.top + frame.height,
      width: vw,
      height: Math.max(0, vh - frame.top - frame.height),
      label: 'bottom',
    });
  }
  if (frame.left > 0.5) {
    bands.push({
      left: 0,
      top: frame.top,
      width: frame.left,
      height: frame.height,
      label: 'left',
    });
    bands.push({
      left: frame.left + frame.width,
      top: frame.top,
      width: Math.max(0, vw - frame.left - frame.width),
      height: frame.height,
      label: 'right',
    });
  }
  return bands;
}

function subscribeOverlay(listener: () => void): () => void {
  const stops = [
    subscribeMounts(listener),
    subscribeHighlight(listener),
    subscribeBleed(listener),
    subscribeAspect(listener),
    viewportStore.subscribe(listener),
  ];
  return () => {
    for (const stop of stops) {
      stop();
    }
  };
}

function overlayVersion(): string {
  const { layout, safeArea, safeInsets } = viewportStore.getState();
  void getHighlightTarget();
  return [
    isHighlighting() ? 1 : 0,
    isBleedVisible() ? 2 : 0,
    isAspectVisible() ? 4 : 0,
    getMountedSnapshot().length,
    layout.viewport.width,
    layout.viewport.height,
    layout.scale,
    layout.offsetX,
    layout.offsetY,
    layout.design.width,
    layout.design.height,
    safeArea,
    safeInsets.top,
    safeInsets.right,
    safeInsets.bottom,
    safeInsets.left,
  ].join('|');
}

interface PaintState {
  readonly boxes: Box[];
  readonly bleed: {
    readonly insets: ResolvedBleedInsets;
    readonly bands: Box[];
    readonly frame: Box;
  } | null;
  readonly aspect: {
    readonly label: string;
    readonly frame: Box;
    readonly bands: Box[];
  } | null;
}

/**
 * Renders active debug overlay chrome.
 * Mount only in DEV. Inactive modes attach no resize/scroll listeners.
 * Bleed / aspect paint from viewportStore (live layout + safeInsets).
 */
export function Overlays() {
  const version = useSyncExternalStore(
    subscribeOverlay,
    overlayVersion,
    overlayVersion,
  );
  const highlighting = isHighlighting();
  const bleedOn = isBleedVisible();
  const aspectOn = isAspectVisible();
  const active = highlighting || bleedOn || aspectOn;

  const [paint, setPaint] = useState<PaintState>({
    boxes: [],
    bleed: null,
    aspect: null,
  });
  /** Part under the pointer while highlighting (DevTools-style inspect). */
  const [hoveredPartId, setHoveredPartId] = useState<string | null>(null);

  // `version` is the overlay-store generation. Targets can change while the mode flags stay on.
  // biome-ignore lint/correctness/useExhaustiveDependencies: version retriggers measurement; the effect reads the store, not the number
  useEffect(() => {
    const root = document.documentElement;
    if (!active) {
      setPaint({ boxes: [], bleed: null, aspect: null });
      root.removeAttribute('data-wsde-debug-highlight');
      root.removeAttribute('data-wsde-debug-bleed');
      root.removeAttribute('data-wsde-debug-aspect');
      return;
    }

    let frame = 0;
    const refresh = (): void => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const { layout, safeInsets } = viewportStore.getState();
        const vw = layout.viewport.width;
        const vh = layout.viewport.height;

        let boxes: Box[] = [];
        if (highlighting) {
          root.setAttribute('data-wsde-debug-highlight', '');
          boxes = measureHighlightBoxes();
        } else {
          root.removeAttribute('data-wsde-debug-highlight');
        }

        let bleed: PaintState['bleed'] = null;
        if (bleedOn) {
          root.setAttribute('data-wsde-debug-bleed', '');
          const insets = resolveBleedInsets({ safeInsets });
          bleed = {
            insets,
            bands: bleedBands(insets, vw, vh),
            frame: {
              left: insets.left,
              top: insets.top,
              width: Math.max(0, vw - insets.left - insets.right),
              height: Math.max(0, vh - insets.top - insets.bottom),
              label: '',
            },
          };
        } else {
          root.removeAttribute('data-wsde-debug-bleed');
        }

        let aspect: PaintState['aspect'] = null;
        if (aspectOn) {
          root.setAttribute('data-wsde-debug-aspect', '');
          const viewport = viewportRatioLabel(vw, vh);
          const stage = activeAspectFrame(layout);
          const design = viewportRatioLabel(
            layout.design.width,
            layout.design.height,
          );
          const stageSize = `${Math.round(stage.width)}×${Math.round(stage.height)}`;
          const { density, densityFactor } = viewportStore.getState();
          aspect = {
            label: `viewport ${viewport.size} (${viewport.ratio}) · stage ${stageSize} (${design.ratio}) · scale ${layout.scale.toFixed(3)} · ${density}×${densityFactor}`,
            frame: {
              left: stage.left,
              top: stage.top,
              width: stage.width,
              height: stage.height,
              label: '',
            },
            bands: aspectBands(stage, vw, vh),
          };
        } else {
          root.removeAttribute('data-wsde-debug-aspect');
        }

        setPaint({ boxes, bleed, aspect });
      });
    };

    refresh();
    // Layout updates come from viewportStore (installViewport resize).
    // Still listen for scroll so highlight boxes track.
    window.addEventListener('scroll', refresh, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', refresh, true);
      root.removeAttribute('data-wsde-debug-highlight');
      root.removeAttribute('data-wsde-debug-bleed');
      root.removeAttribute('data-wsde-debug-aspect');
    };
  }, [active, highlighting, bleedOn, aspectOn, version]);

  // Hit-test via document mousemove + partAtPoint (elementsFromPoint skips the
  // capture sheet). Highlight layer uses pointer-events: auto to block underlying UI;
  // bleed/aspect layers stay non-blocking.
  useEffect(() => {
    if (!highlighting) {
      setHoveredPartId(null);
      return;
    }
    const onMove = (event: MouseEvent): void => {
      const id = partAtPoint(event.clientX, event.clientY);
      setHoveredPartId((prev) => (prev === id ? prev : id));
    };
    const onLeave = (): void => {
      setHoveredPartId(null);
    };
    document.addEventListener('mousemove', onMove, { passive: true });
    document.documentElement.addEventListener('mouseleave', onLeave);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.documentElement.removeEventListener('mouseleave', onLeave);
      setHoveredPartId(null);
    };
  }, [highlighting]);

  if (!active) {
    return null;
  }

  return (
    <div className="wsde-debug-root" aria-hidden="true">
      {paint.aspect ? (
        <div className="wsde-debug-aspect-layer">
          {paint.aspect.bands.map((band) => (
            <div
              key={band.label}
              className="wsde-debug-aspect-band"
              style={{
                left: band.left,
                top: band.top,
                width: band.width,
                height: band.height,
              }}
            />
          ))}
          <div
            className="wsde-debug-aspect-frame"
            style={{
              left: paint.aspect.frame.left,
              top: paint.aspect.frame.top,
              width: paint.aspect.frame.width,
              height: paint.aspect.frame.height,
            }}
          />
          <div className="wsde-debug-aspect-label">{paint.aspect.label}</div>
        </div>
      ) : null}

      {paint.bleed ? (
        <div className="wsde-debug-bleed-layer">
          {paint.bleed.bands.map((band) => (
            <div
              key={band.label}
              className="wsde-debug-bleed-band"
              style={{
                left: band.left,
                top: band.top,
                width: band.width,
                height: band.height,
              }}
            />
          ))}
          <div
            className="wsde-debug-bleed-frame"
            style={{
              left: paint.bleed.frame.left,
              top: paint.bleed.frame.top,
              width: paint.bleed.frame.width,
              height: paint.bleed.frame.height,
            }}
          />
          <div
            className="wsde-debug-bleed-label"
            style={{ left: paint.bleed.frame.left, top: paint.bleed.frame.top }}
          >
            {`safe T${Math.round(paint.bleed.insets.top)} R${Math.round(paint.bleed.insets.right)} B${Math.round(paint.bleed.insets.bottom)} L${Math.round(paint.bleed.insets.left)}`}
          </div>
        </div>
      ) : null}

      {highlighting ? (
        <div className="wsde-debug-highlight-layer">
          {paint.boxes.map((box) => {
            const hovered =
              hoveredPartId !== null && box.label === hoveredPartId;
            return (
              <div
                key={`${box.label}:${box.left}:${box.top}`}
                className={
                  hovered
                    ? 'wsde-debug-highlight-box wsde-debug-highlight-box-hovered'
                    : 'wsde-debug-highlight-box'
                }
                style={{
                  left: box.left,
                  top: box.top,
                  width: box.width,
                  height: box.height,
                }}
              >
                <span className="wsde-debug-highlight-label">{box.label}</span>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
