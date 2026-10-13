import type { CueTable } from '@alliance/data/pack-app';
import type { AssetResolver, AudioSource } from 'arknights-assets-catalog';
import { type CueRole, cueKey, type TrackRole, trackKeys } from './cue.js';
import { audioSourceOf } from './key.js';

/** What plays the files. The page uses audio elements; tests record the calls. */
export interface AudioOutput {
  /** Plays a sound once. */
  playOnce(source: AudioSource): void;
  /** Replaces the music: the intro once when given, then the loop forever. */
  playMusic(intro: AudioSource | null, loop: AudioSource): void;
  stopMusic(): void;
  /** Gains of the music and the sound effects, 0 to 1. The music playing takes the new gain at once. */
  setGains(gains: { readonly music: number; readonly sfx: number }): void;
}

/** Where the player finds the sounds: the resolver and the merged cue table of the packs in use. */
export interface AudioPacks {
  readonly resolver: AssetResolver;
  readonly cues: CueTable;
}

export interface AudioPlayer {
  /** Plays the sound of a cue role. Silent when no pack gives it a sound. */
  cue(role: CueRole): void;
  /**
   * Plays the track of a role in the round; keeps playing when it is already the current track. Stops when the role
   * has none.
   */
  music(role: TrackRole, round?: number | null): void;
  /** Stops the music and forgets the current track. */
  stop(): void;
}

/** Plays cue and track roles from the packs that `packs` returns at the time of the call. */
export function createAudioPlayer(
  output: AudioOutput,
  packs: () => AudioPacks | null,
): AudioPlayer {
  let current: string | null = null;

  const stop = (): void => {
    if (current !== null) {
      current = null;
      output.stopMusic();
    }
  };

  return {
    cue(role) {
      const found = packs();
      const key = found ? cueKey(found.cues, role) : null;
      const source = found && key ? audioSourceOf(found.resolver, key) : null;
      if (source) {
        output.playOnce(source);
      }
    },
    music(role, round = null) {
      const found = packs();
      const keys = found ? trackKeys(found.cues, role, round) : null;
      const loop =
        found && keys ? audioSourceOf(found.resolver, keys.loop) : null;
      if (!found || !keys || !loop) {
        stop();
        return;
      }
      const intro = keys.intro
        ? audioSourceOf(found.resolver, keys.intro)
        : null;
      const id = `${intro?.url ?? ''}|${loop.url}`;
      if (id === current) {
        return;
      }
      current = id;
      output.playMusic(intro, loop);
    },
    stop,
  };
}
