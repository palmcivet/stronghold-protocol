import * as v from 'valibot';
import { createStore } from 'zustand/vanilla';
import { CORE_OWNER, defineItem } from '#infra/storage/index.js';

const MAX = 5;

/** Rooms joined on the current server, the latest first; room codes belong to a server. */
export const recentItem = defineItem<readonly string[]>({
  scope: 'server',
  owner: CORE_OWNER,
  key: 'recentRooms',
  schema: v.pipe(
    v.array(v.string()),
    v.transform((codes) => codes.slice(0, MAX)),
  ),
  version: 1,
  fallback: () => [],
});

export const recentStore = createStore<{ readonly codes: readonly string[] }>(
  () => ({ codes: recentItem.get() }),
);

export function rememberRoom(code: string): void {
  const codes = [
    code,
    ...recentStore.getState().codes.filter((entry) => entry !== code),
  ].slice(0, MAX);
  recentStore.setState({ codes });
}
