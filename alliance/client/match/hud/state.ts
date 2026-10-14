import { createStore } from 'zustand/vanilla';
import { onMatchReset } from '#infra/store/frame.js';
import { penStore } from '#match/pen-state.js';
import { selectionStore } from '#match/selection.js';

interface HudState {
  /** The match information drawer behind the lens (master EnemyDrawer tabs). */
  readonly intel: 'info' | 'enemies' | null;
  /** The bond whose detail is open. */
  readonly bond: string | null;
  /** The player chose to pick the reward later. */
  readonly rewardLater: boolean;
  /** The shop bar is folded away. */
  readonly shopCollapsed: boolean;
  /** The bond strip is folded away, as master's bonds-toggle. */
  readonly bondsCollapsed: boolean;
}

/** Local state of the HUD. */
export const hudStore = createStore<HudState>(() => ({
  intel: null,
  bond: null,
  rewardLater: false,
  shopCollapsed: false,
  bondsCollapsed: false,
}));

onMatchReset(() =>
  hudStore.setState({
    intel: null,
    bond: null,
    rewardLater: false,
    shopCollapsed: false,
    bondsCollapsed: false,
  }),
);

/** Picking a piece closes an enemy intel card (master detail exclusivity). */
selectionStore.subscribe((state, prev) => {
  if (
    state.uid !== null &&
    state.uid !== prev.uid &&
    state.enemyDetail !== null
  ) {
    selectionStore.setState({ enemyDetail: null });
  }
});

/** Leaving the pen unfolds the shop again (master folds it while the pen is up). */
penStore.subscribe((state, prev) => {
  if (!state.pen && prev.pen) {
    hudStore.setState({ shopCollapsed: false });
  }
});
