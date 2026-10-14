import type { Catalog } from '@alliance/contract/catalog.js';
import { modeIdFor } from '@alliance/contract/match.js';
import { has, lookup } from '#infra/text/index.js';

export type RoomMode = 'solo' | 'coop';

/** Battlefield pool size when the catalog mode has no `stages` count (same as master STAGE_POOL). */
export const STAGE_POOL: Readonly<Record<string, number>> = {
  FUNNY: 1,
  NORMAL: 8,
  HARD: 7,
  ABYSS: 7,
};

/**
 * Official battlefield-pool note: one map is fixed ("战场固定为 战场#01"), a larger pool is drawn at random.
 * Catalog only stores the pool size; a single-map pool uses the default 战场#01 label.
 */
export function stageNote(stages: number | null | undefined): string {
  if (!Number.isInteger(stages) || stages === null || stages === undefined) {
    return '';
  }
  if (stages === 1) {
    return lookup('core:lobby.stage.fixed', {
      name: lookup('core:lobby.stage.default'),
    });
  }
  return stages > 1
    ? lookup('core:briefing.poolRandom', { count: stages })
    : '';
}

/** What a difficulty card shows: the mode data when the catalog has it, the built-in text otherwise. */
export function difficultyInfo(
  modes: Catalog['modes'],
  mode: RoomMode,
  difficulty: string,
): {
  readonly code: string | null;
  readonly desc: string;
  readonly effects: readonly string[];
  readonly rounds: number | null;
  readonly hidden: boolean;
  readonly icon: string | null;
  readonly stageNote: string;
} {
  const id = modeIdFor(mode, difficulty);
  const data = modes[id];
  const descKey = `data:mode.${id}.desc`;
  const effectsKey = `data:mode.${id}.effects`;
  const fallback = `core:entry.difficulty.${mode}.${difficulty}`;
  const stages =
    typeof data?.stages === 'number'
      ? data.stages
      : (STAGE_POOL[difficulty] ?? null);
  return {
    code: data?.code ?? null,
    desc: lookup(has(descKey) ? descKey : fallback),
    effects: lookup(has(effectsKey) ? effectsKey : `${fallback}.effects`)
      .split('\n')
      .filter(Boolean),
    rounds: data?.lastRound ?? null,
    hidden: data?.hiddenRound !== undefined,
    icon: data?.icon ?? null,
    stageNote: stageNote(stages),
  };
}

/** Asset key for a difficulty glyph when the catalog mode has no `icon`. */
export function difficultyIconKey(difficulty: string): string {
  return `image:ui/modeIcon/mode_${difficulty.toLowerCase()}_icon`;
}
