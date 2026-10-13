import type { CueRole } from '@alliance/data/pack-app';

type CueSink = (role: CueRole) => void;

let sink: CueSink | null = null;

/** Sets where interface cues go; the shell points it at the audio player. Returns a function that unsets it. */
export function setCueSink(next: CueSink): () => void {
  sink = next;
  return () => {
    if (sink === next) {
      sink = null;
    }
  };
}

/** Plays an interface cue, such as the click of a button. Silent before the shell sets the sink. */
export function playCue(role: CueRole): void {
  sink?.(role);
}
