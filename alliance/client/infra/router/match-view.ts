import { PHASE } from '@alliance/contract/match.js';

export type MatchView = 'briefing' | 'strategy' | 'match' | 'result';

/** The part of the match page the phase shows. */
export function matchViewOf(
  phase: string | undefined,
  finished: boolean,
): MatchView {
  if (finished || phase === PHASE.RESULT) {
    return 'result';
  }
  if (
    phase === undefined ||
    phase === PHASE.LOBBY ||
    phase === PHASE.INFO_CHECK
  ) {
    return 'briefing';
  }
  return phase === PHASE.BAND_DRAFT ? 'strategy' : 'match';
}
