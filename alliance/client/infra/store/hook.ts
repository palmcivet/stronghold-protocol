import type { Catalog } from '@alliance/contract/catalog.js';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/shallow';
import { assetsStore } from './assets.js';
import { type CatalogState, catalogStore } from './catalog.js';
import { type MatchState, matchStore } from './match.js';
import { type RoomState, roomStore } from './room.js';
import { type SessionState, sessionStore } from './session.js';
import { type SettingsState, settingsStore } from './settings.js';
import { type StreamState, streamStore } from './stream.js';

export const useSession = <T>(select: (state: SessionState) => T): T =>
  useStore(sessionStore, useShallow(select));
export const useRoom = <T>(select: (state: RoomState) => T): T =>
  useStore(roomStore, useShallow(select));
export const useMatch = <T>(select: (state: MatchState) => T): T =>
  useStore(matchStore, useShallow(select));
export const useStream = <T>(select: (state: StreamState) => T): T =>
  useStore(streamStore, useShallow(select));
export const useSettings = <T>(select: (state: SettingsState) => T): T =>
  useStore(settingsStore, useShallow(select));
export const useCatalog = <T>(select: (state: CatalogState) => T): T =>
  useStore(catalogStore, useShallow(select));

/** The catalog the running match bound at its start, or the current one outside a match. */
export const useMatchCatalog = (): Catalog => {
  const bound = useStore(assetsStore, (state) => state.match?.catalog ?? null);
  const current = useStore(catalogStore, (state) => state.catalog);
  return bound ?? current;
};
