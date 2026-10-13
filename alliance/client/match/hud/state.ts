import { createStore } from 'zustand/vanilla';
import { onMatchReset } from '../../infra/store/frame.js';

interface HudState {
  /** The match information dialog behind the lens. */
  readonly intel: 'info' | 'enemies' | null;
  /** The bond whose detail is open. */
  readonly bond: string | null;
  /** The player chose to pick the reward later. */
  readonly rewardLater: boolean;
}

/** Local state of the HUD. */
export const hudStore = createStore<HudState>(() => ({
  intel: null,
  bond: null,
  rewardLater: false,
}));

onMatchReset(() =>
  hudStore.setState({ intel: null, bond: null, rewardLater: false }),
);
