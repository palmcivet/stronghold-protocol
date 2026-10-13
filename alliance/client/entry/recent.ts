import { createStore } from 'zustand/vanilla';

const KEY = 'alliance.recentRooms';
const MAX = 5;

function load(): readonly string[] {
  try {
    const raw: unknown = JSON.parse(
      globalThis.localStorage?.getItem(KEY) ?? '[]',
    );
    return Array.isArray(raw)
      ? raw
          .filter((code): code is string => typeof code === 'string')
          .slice(0, MAX)
      : [];
  } catch {
    return [];
  }
}

/** Rooms joined from this browser, the latest first. */
export const recentStore = createStore<{ readonly codes: readonly string[] }>(
  () => ({ codes: load() }),
);

export function rememberRoom(code: string): void {
  const codes = [
    code,
    ...recentStore.getState().codes.filter((entry) => entry !== code),
  ].slice(0, MAX);
  recentStore.setState({ codes });
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(codes));
  } catch {
    // storage is optional
  }
}
