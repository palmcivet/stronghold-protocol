import type { ServerMessage } from '@alliance/contract/server-message.js';
import type { Playback } from '#match/playback.js';
import type { PlaybackOptions } from './runner.js';

type Frame<T extends ServerMessage['t']> = Extract<ServerMessage, { t: T }>;

export interface LazyPlayback extends Playback {
  /** Loads the runner, once; the match route calls it on entry and `b.start` calls it too. */
  readonly load: () => Promise<void>;
}

/**
 * The playback without the battle engine in the first chunk: until the runner is loaded it keeps the frames it would
 * need (the latest `b.start` and what followed it) and hands them over once loaded.
 */
export function createLazyPlayback(
  options: PlaybackOptions,
  importRunner: () => Promise<typeof import('./runner.js')> = () =>
    import('./runner.js'),
): LazyPlayback {
  let runner: Playback | null = null;
  let loading: Promise<void> | null = null;
  let start: Frame<'b.start'> | null = null;
  let latest: Frame<'m.public'> | null = null;
  let end: Frame<'b.end'> | null = null;
  const listeners = new Set<() => void>();
  let stopped = false;

  const notify = (): void => {
    for (const listener of [...listeners]) {
      listener();
    }
  };

  function load(): Promise<void> {
    loading ??= importRunner().then(({ createPlayback }) => {
      if (stopped) {
        return;
      }
      const loaded = createPlayback(options);
      for (const frame of [start, latest, end]) {
        if (frame) {
          loaded.onFrame(frame);
        }
      }
      start = latest = end = null;
      loaded.subscribe(notify);
      runner = loaded;
      notify();
    });
    return loading;
  }

  return {
    load,
    local: () => runner?.local() ?? null,
    onFrame(frame) {
      if (runner) {
        runner.onFrame(frame);
        return;
      }
      if (frame.t === 'b.start') {
        start = frame;
        latest = end = null;
        void load();
      } else if (frame.t === 'm.public') {
        latest = frame;
      } else if (frame.t === 'b.end') {
        end = frame;
      }
    },
    advance(seconds) {
      runner?.advance(seconds);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    stop() {
      stopped = true;
      runner?.stop();
      listeners.clear();
    },
  };
}
