import { createStore } from 'zustand/vanilla';
import { onMatchReset } from '#infra/store/frame.js';

/** Season config bits the match HUD reads (OT drain, LP cap). Loaded with the catalog. */
export interface MatchRulesState {
  readonly bossOvertimeDrainPerSec: number;
  readonly lpCapPerRound: number;
}

export const matchRulesStore = createStore<MatchRulesState>(() => ({
  bossOvertimeDrainPerSec: 1,
  lpCapPerRound: 10,
}));

onMatchReset(() =>
  matchRulesStore.setState({
    bossOvertimeDrainPerSec: 1,
    lpCapPerRound: 10,
  }),
);

/** Apply master's config.json OT / LP fields when the catalog loads. */
export function applyMatchRules(config: unknown): void {
  if (!config || typeof config !== 'object') {
    return;
  }
  const record = config as Record<string, unknown>;
  const drain = record.bossOvertimeDrainPerSec;
  const cap = record.lpCapPerRound;
  matchRulesStore.setState({
    bossOvertimeDrainPerSec:
      typeof drain === 'number' && Number.isFinite(drain) && drain >= 0
        ? drain
        : 1,
    lpCapPerRound:
      typeof cap === 'number' && Number.isFinite(cap) && cap > 0 ? cap : 10,
  });
}
