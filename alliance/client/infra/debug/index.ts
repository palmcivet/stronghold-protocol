import {
  hideAspect,
  isAspectVisible as readAspectVisible,
  resetAspect,
  showAspect as setAspect,
  subscribeAspect,
} from './aspect.js';
import {
  hideBleed,
  isBleedVisible as readBleedVisible,
  resetBleed,
  showBleed as setBleed,
  subscribeBleed,
} from './bleed.js';
import {
  clearHighlightTarget,
  type HighlightTarget,
  getHighlightTarget as readHighlightTarget,
  isHighlighting as readIsHighlighting,
  resetHighlight,
  setHighlightTarget,
  subscribeHighlight,
} from './highlight.js';
import { resetMounts, subscribeMounts } from './mount.js';
import {
  listMountedParts,
  type MountedPartInfo,
  partAtPoint,
  partFromNode,
} from './query.js';

export type { HighlightTarget, MountedPartInfo };

/** DEV debug overlays mixed onto `window.wsde` with the host API. */
export interface WsdeDebugApi {
  highlight(target?: HighlightTarget): void;
  clearHighlight(): void;
  isHighlighting(): boolean;
  getHighlightTarget(): HighlightTarget | null;

  listMountedParts(): readonly MountedPartInfo[];
  partFromNode(node: Node | null): string | null;
  partAtPoint(x: number, y: number): string | null;

  showBleed(): void;
  hideBleed(): void;
  isBleedVisible(): boolean;

  showAspect(): void;
  hideAspect(): void;
  isAspectVisible(): boolean;

  subscribe(listener: () => void): () => void;
}

const api: WsdeDebugApi = {
  highlight(target) {
    setHighlightTarget(target);
  },
  clearHighlight() {
    clearHighlightTarget();
  },
  isHighlighting() {
    return readIsHighlighting();
  },
  getHighlightTarget() {
    return readHighlightTarget();
  },
  listMountedParts,
  partFromNode,
  partAtPoint,
  showBleed() {
    setBleed();
  },
  hideBleed() {
    hideBleed();
  },
  isBleedVisible() {
    return readBleedVisible();
  },
  showAspect() {
    setAspect();
  },
  hideAspect() {
    hideAspect();
  },
  isAspectVisible() {
    return readAspectVisible();
  },
  subscribe(listener) {
    const stops = [
      subscribeMounts(listener),
      subscribeHighlight(listener),
      subscribeBleed(listener),
      subscribeAspect(listener),
    ];
    return () => {
      for (const stop of stops) {
        stop();
      }
    };
  },
};

/** Dev build: debug overlay API; production returns null. */
export function getWsde(): WsdeDebugApi | null {
  return import.meta.env.DEV ? api : null;
}

/** Alias of getWsde(). */
export function getWsdeDebug(): WsdeDebugApi | null {
  return getWsde();
}

/** Test helper: clear mounts + all overlay state. */
export function resetWsde(): void {
  resetMounts();
  resetHighlight();
  resetBleed();
  resetAspect();
}
