import { getMountedSnapshot, type MountRecord } from './mount.js';

export interface MountedPartInfo {
  /** Part id from data-part. */
  readonly partId: string;
  /** Nearest ancestor [data-slot], if any. */
  readonly slotId: string | null;
  /** The data-part marker element (display: contents). */
  readonly element: Element;
}

function toInfo(record: MountRecord): MountedPartInfo {
  return {
    partId: record.partId,
    slotId: record.slotId,
    element: record.element,
  };
}

/** Currently mounted parts (registry snapshot). */
export function listMountedParts(): readonly MountedPartInfo[] {
  return getMountedSnapshot().map(toInfo);
}

/** Walk to the nearest [data-part] ancestor (or self). */
export function partFromNode(node: Node | null): string | null {
  if (!node) {
    return null;
  }
  const el =
    node.nodeType === Node.ELEMENT_NODE
      ? (node as Element)
      : node.parentElement;
  const part = el?.closest('[data-part]');
  if (!part) {
    return null;
  }
  const id = part.getAttribute('data-part');
  return id && id.length > 0 ? id : null;
}

/** Topmost part under a viewport point (elementsFromPoint + partFromNode). */
export function partAtPoint(x: number, y: number): string | null {
  const doc = globalThis.document;
  if (!doc || typeof doc.elementsFromPoint !== 'function') {
    return null;
  }
  for (const el of doc.elementsFromPoint(x, y)) {
    const id = partFromNode(el);
    if (id) {
      return id;
    }
  }
  return null;
}
