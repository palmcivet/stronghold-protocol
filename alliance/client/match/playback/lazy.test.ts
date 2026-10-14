import type { ServerMessage } from '@alliance/contract/server-message.js';
import { describe, expect, it, vi } from 'vitest';
import type { Playback } from '#match/playback.js';
import { createLazyPlayback } from './lazy.js';
import type * as Runner from './runner.js';

function fakeRunner() {
  const seen: string[] = [];
  let listener: (() => void) | null = null;
  const playback: Playback = {
    local: () => null,
    onFrame: (frame) => {
      seen.push(frame.t);
    },
    advance: vi.fn(),
    subscribe: (next) => {
      listener = next;
      return () => undefined;
    },
    stop: vi.fn(),
  };
  const module = { createPlayback: () => playback } as unknown as typeof Runner;
  return {
    seen,
    playback,
    fire: () => listener?.(),
    importRunner: vi.fn(async () => module),
  };
}

const options = { bridge: null, send: () => undefined };
const frame = (fields: object) => fields as ServerMessage;

describe('lazy playback', () => {
  it('loads the runner once, on demand', async () => {
    const fake = fakeRunner();
    const playback = createLazyPlayback(options, fake.importRunner);
    expect(fake.importRunner).not.toHaveBeenCalled();
    await Promise.all([playback.load(), playback.load()]);
    expect(fake.importRunner).toHaveBeenCalledTimes(1);
    playback.onFrame(frame({ t: 'm.public' }));
    expect(fake.seen).toEqual(['m.public']);
  });

  it('hands the latest battle frames to the runner once loaded', async () => {
    const fake = fakeRunner();
    const playback = createLazyPlayback(options, fake.importRunner);
    playback.onFrame(frame({ t: 'm.public' }));
    playback.onFrame(frame({ t: 'b.start', battleId: 'b1' }));
    playback.onFrame(frame({ t: 'm.public' }));
    playback.onFrame(frame({ t: 'b.end', battleId: 'b1' }));
    expect(fake.importRunner).toHaveBeenCalledTimes(1);
    await playback.load();
    expect(fake.seen).toEqual(['b.start', 'm.public', 'b.end']);
  });

  it('keeps its subscribers across the load', async () => {
    const fake = fakeRunner();
    const playback = createLazyPlayback(options, fake.importRunner);
    const listener = vi.fn();
    playback.subscribe(listener);
    await playback.load();
    listener.mockClear();
    fake.fire();
    expect(listener).toHaveBeenCalledTimes(1);
    playback.advance(1);
    expect(fake.playback.advance).toHaveBeenCalledWith(1);
  });
});
