import { type Catalog, EMPTY_CATALOG } from '@alliance/contract/catalog.js';
import { createStore } from 'zustand/vanilla';

export interface CatalogState {
  readonly catalog: Catalog;
  readonly loaded: boolean;
}

export const catalogStore = createStore<CatalogState>(() => ({
  catalog: EMPTY_CATALOG,
  loaded: false,
}));
