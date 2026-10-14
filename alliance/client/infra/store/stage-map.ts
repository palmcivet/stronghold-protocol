import type { StageMap } from '@alliance/compat-upstream';
import { createStore } from 'zustand/vanilla';

/** The boards of the backend's stages by stage id, for the battlefield's ground. */
export interface StageMapState {
  readonly maps: Readonly<Record<string, StageMap>>;
}

export const stageMapStore = createStore<StageMapState>(() => ({ maps: {} }));
