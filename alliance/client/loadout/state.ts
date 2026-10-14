import type { CatalogChess } from '@alliance/contract/catalog.js';
import type { DiyPick } from '@alliance/contract/message.js';
import * as v from 'valibot';
import { createStore } from 'zustand/vanilla';
import { CORE_OWNER, defineItem } from '#infra/storage/index.js';
import {
  type Entries,
  type LoadoutChoice,
  type Ops,
  type OpsChoice,
  setChoice,
  setOps,
} from './model.js';

export type { LoadoutChoice, OpsChoice } from './model.js';

export type DiyPicks = Readonly<Record<string, DiyPick>>;

/** The loadout page's working copy, shared by its roster and detail parts. Local to this domain. */
export interface LoadoutState {
  readonly selected: string | null;
  readonly query: string;
  readonly tier: number | null;
  readonly changedOnly: boolean;
  /** Skill and module by base chess, defaults left out (`room.loadout.entries`). */
  readonly entries: Entries;
  /** Potential and cultivation by operator, defaults left out (`room.loadout.ops`). */
  readonly ops: Ops;
  /** Base chess marked as not owned (`room.ownership`). */
  readonly notOwned: readonly string[];
  /** Custom squad picks by slot id (`room.diy`), master's `{ charId, skillIndex?, uniEquipId? }`; a missing slot is empty. */
  readonly diy: DiyPicks;
}

export const loadoutStore = createStore<LoadoutState>(() => ({
  selected: null,
  query: '',
  tier: null,
  changedOnly: false,
  entries: {},
  ops: {},
  notOwned: [],
  diy: {},
}));

export function chooseLoadout(
  chess: CatalogChess,
  change: LoadoutChoice,
): void {
  loadoutStore.setState((state) => ({
    entries: setChoice(state.entries, chess, change),
  }));
}

export function chooseOps(charId: string, change: OpsChoice): void {
  loadoutStore.setState((state) => ({
    ops: setOps(state.ops, charId, change),
  }));
}

/** Back to the defaults for one chess: its skill and module, and its operator's potential and cultivation. */
export function resetChess(chess: CatalogChess): void {
  loadoutStore.setState((state) => {
    const { [chess.id]: _entry, ...entries } = state.entries;
    const ops = chess.charId
      ? (({ [chess.charId as string]: _ops, ...rest }) => rest)(state.ops)
      : state.ops;
    return { entries, ops };
  });
}

const Choice = v.object({
  skill: v.exactOptional(v.pipe(v.number(), v.integer())),
  module: v.exactOptional(v.string()),
});
const DiyPickSchema = v.object({
  charId: v.string(),
  skillIndex: v.exactOptional(v.nullable(v.pipe(v.number(), v.integer()))),
  uniEquipId: v.exactOptional(v.nullable(v.string())),
});
const OpsEntry = v.object({
  potential: v.exactOptional(v.pipe(v.number(), v.integer())),
  cultivate: v.exactOptional(v.pipe(v.number(), v.integer())),
});

/** What the player set up, as master keeps it: entries and ops (`room.loadout`), ownership and custom picks. */
export interface SavedLoadout {
  readonly entries: Entries;
  readonly ops: Ops;
  readonly notOwned: readonly string[];
  readonly diy: DiyPicks;
}

/** The working copy on the current server; boot re-sends it after every `welcome`, as master does. */
export const loadoutItem = defineItem<SavedLoadout>({
  scope: 'server',
  owner: CORE_OWNER,
  key: 'loadout',
  schema: v.object({
    entries: v.record(v.string(), Choice),
    ops: v.record(v.string(), OpsEntry),
    notOwned: v.array(v.string()),
    diy: v.record(v.string(), DiyPickSchema),
  }),
  version: 2,
  // version 1 kept a bare charId per slot
  migrations: {
    1: (data) => {
      const old = data as { diy?: Record<string, unknown> };
      return {
        ...old,
        diy: Object.fromEntries(
          Object.entries(old.diy ?? {}).map(([slot, charId]) => [
            slot,
            { charId },
          ]),
        ),
      };
    },
  },
  fallback: () => ({ entries: {}, ops: {}, notOwned: [], diy: {} }),
});

export const savedOf = (state: LoadoutState): SavedLoadout => ({
  entries: state.entries,
  ops: state.ops,
  notOwned: state.notOwned,
  diy: state.diy,
});
