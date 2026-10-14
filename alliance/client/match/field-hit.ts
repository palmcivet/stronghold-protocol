/**
 * Prep-stage hit testing for HUD gestures that start outside the canvas (shop → board). The stage registers while
 * mounted; shop drag reads the latest pickers.
 */
import { createStore } from 'zustand/vanilla';
import type { DragTile } from '#match/field/pointer-drag.js';

export interface FieldHitApi {
  /** Board / hand / temp tile under a viewport point, or null. */
  readonly pickTile: (clientX: number, clientY: number) => DragTile | null;
  /** Whether the point lies over the stage host. */
  readonly contains: (clientX: number, clientY: number) => boolean;
}

export const fieldHitStore = createStore<{
  readonly api: FieldHitApi | null;
}>(() => ({ api: null }));

export function setFieldHitApi(api: FieldHitApi | null): void {
  fieldHitStore.setState({ api });
}

export function pickFieldTile(
  clientX: number,
  clientY: number,
): DragTile | null {
  return fieldHitStore.getState().api?.pickTile(clientX, clientY) ?? null;
}

export function fieldContains(clientX: number, clientY: number): boolean {
  return fieldHitStore.getState().api?.contains(clientX, clientY) ?? false;
}
