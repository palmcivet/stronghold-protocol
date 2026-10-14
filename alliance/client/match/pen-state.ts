import { createStore } from 'zustand/vanilla';
import { onMatchReset } from '#infra/store/frame.js';

/** Prep-only enemy preview pen camera (master setCamera('pen')). Shared by field + HUD. */
export interface PenState {
  readonly pen: boolean;
}

export const penStore = createStore<PenState>(() => ({ pen: false }));

onMatchReset(() => penStore.setState({ pen: false }));

export function setPen(on: boolean): void {
  penStore.setState({ pen: on });
}
