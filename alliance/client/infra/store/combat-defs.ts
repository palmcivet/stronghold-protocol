import type { CombatDefs } from '@alliance/compat-upstream';
import { createStore } from 'zustand/vanilla';

export const emptyCombatDefs = (): CombatDefs => ({
  chess: {},
  enemies: {},
});

export interface CombatDefsState {
  readonly defs: CombatDefs;
}

export const combatDefsStore = createStore<CombatDefsState>(() => ({
  defs: emptyCombatDefs(),
}));
