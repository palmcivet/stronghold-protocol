import { createContext, useContext } from 'react';
import type { Playback } from '#match/playback.js';

export const PlaybackContext = createContext<Playback | null>(null);

export function usePlaybackRuntime(): Playback | null {
  return useContext(PlaybackContext);
}
