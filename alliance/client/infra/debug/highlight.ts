/** Highlight filter store for the part debug overlay. */

export type HighlightTarget =
  | { readonly type: 'all' }
  | { readonly type: 'part'; readonly id: string }
  | { readonly type: 'parts'; readonly ids: readonly string[] }
  | { readonly type: 'slot'; readonly id: string };

let target: HighlightTarget | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

/** Enable overlay for the target (replaces previous filter). Default: all. */
export function setHighlightTarget(next?: HighlightTarget): void {
  target = next ?? { type: 'all' };
  notify();
}

/** Turn overlay off. */
export function clearHighlightTarget(): void {
  if (target === null) {
    return;
  }
  target = null;
  notify();
}

export function getHighlightTarget(): HighlightTarget | null {
  return target;
}

export function isHighlighting(): boolean {
  return target !== null;
}

export function subscribeHighlight(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Whether a mount record matches the active filter. */
export function matchesHighlight(
  partId: string,
  slotId: string | null,
  filter: HighlightTarget | null = target,
): boolean {
  if (!filter) {
    return false;
  }
  switch (filter.type) {
    case 'all':
      return true;
    case 'part':
      return partId === filter.id;
    case 'parts':
      return filter.ids.includes(partId);
    case 'slot':
      return slotId === filter.id;
  }
}

/** Test helper. */
export function resetHighlight(): void {
  target = null;
  notify();
}
