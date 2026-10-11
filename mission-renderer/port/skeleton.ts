import type { Object3D, Texture } from 'three';

/** What a skeleton is loaded from: the skeleton file, the atlas text and one texture per atlas page, by page name. */
export interface MissionSkeletonSource {
  /** Binary `.skel` bytes, or the text of a JSON skeleton. */
  readonly skeleton: Uint8Array | string;
  readonly atlas: string;
  readonly pages: Readonly<Record<string, Texture>>;
}

/** Loaded skeleton data, shared by every instance created from it. */
export interface MissionSkeletonData {
  readonly animations: readonly string[];
  /** Seconds of each animation. */
  readonly durations: Readonly<Record<string, number>>;
}

export interface MissionSkeletonEvent {
  readonly track: number;
  readonly animation: string;
  /** `event` is a keyed event of the animation; `complete` ends one loop; `end` leaves the track. */
  readonly type: 'event' | 'complete' | 'end';
  readonly name: string | null;
}

export interface MissionSkeletonBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** One posed, animated skeleton drawn into its own `object3d`. */
export interface MissionSkeletonInstance {
  readonly data: MissionSkeletonData;
  readonly object3d: Object3D;
  /** Replaces what plays on `track`. */
  play(track: number, animation: string, loop: boolean): void;
  /** Plays `animation` on `track` after what is playing there, `delay` seconds after it starts (0 waits for its end). */
  queue(track: number, animation: string, loop: boolean, delay?: number): void;
  clear(track: number): void;
  /** Advances the animation and rewrites the drawn geometry. */
  update(deltaSeconds: number): void;
  onEvent(listener: (event: MissionSkeletonEvent) => void): () => void;
  /** Bounds of the posed skeleton in its own units. */
  bounds(): MissionSkeletonBounds;
  setTint(color: number): void;
  dispose(): void;
}

/** The skeleton runtime behind every actor. */
export interface MissionSkeletonRuntime {
  load(source: MissionSkeletonSource): MissionSkeletonData;
  create(data: MissionSkeletonData): MissionSkeletonInstance;
  dispose(data: MissionSkeletonData): void;
}
