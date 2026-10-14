/**
 * Mounted-part registry for debug highlight and queries.
 * Filled by part boundaries; infra/debug does not import part.
 */

export interface MountRecord {
  readonly partId: string;
  readonly slotId: string | null;
  readonly element: Element;
}

const mounts = new Map<Element, MountRecord>();
const listeners = new Set<() => void>();
let snapshot: readonly MountRecord[] = [];

function notify(): void {
  snapshot = [...mounts.values()];
  for (const listener of listeners) {
    listener();
  }
}

function slotIdOf(element: Element): string | null {
  const slot = element.closest('[data-slot]');
  if (!slot) {
    return null;
  }
  const id = slot.getAttribute('data-slot');
  return id && id.length > 0 ? id : null;
}

/**
 * Registers a `[data-part]` marker. Returns an unregister function.
 * Passing `null` is a no-op (ref not ready); call again once the element exists.
 */
export function registerPartMount(
  partId: string,
  element: Element | null,
): () => void {
  if (!element) {
    return () => {};
  }
  const record: MountRecord = {
    partId,
    slotId: slotIdOf(element),
    element,
  };
  mounts.set(element, record);
  notify();
  return () => {
    if (mounts.get(element) === record) {
      mounts.delete(element);
      notify();
    }
  };
}

export function subscribeMounts(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getMountedSnapshot(): readonly MountRecord[] {
  return snapshot;
}

/** Test helper: drop every mount record. */
export function resetMounts(): void {
  mounts.clear();
  snapshot = [];
  notify();
}
