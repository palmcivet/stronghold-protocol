import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  audioGains,
  DEFAULT_AUDIO,
  DEFAULT_KEYS,
  loadSettings,
} from './settings.js';

function stubStorage(saved: string | null): void {
  vi.stubGlobal('localStorage', {
    getItem: () => saved,
    setItem: () => undefined,
  });
}

describe('settings', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fills defaults for what is missing', () => {
    stubStorage(
      JSON.stringify({
        name: 'Amiya',
        keys: { freeze: 'KeyQ' },
        audio: { music: { muted: true } },
      }),
    );
    expect(loadSettings()).toEqual({
      language: 'zh-Hans',
      name: 'Amiya',
      avatar: '',
      quality: 'standard',
      textSize: 'sm',
      keys: { ...DEFAULT_KEYS, freeze: 'KeyQ' },
      audio: {
        ...DEFAULT_AUDIO,
        music: { ...DEFAULT_AUDIO.music, muted: true },
      },
    });
  });

  it('scales the music and the sound effects by the master volume, and silences a muted channel', () => {
    const on = (volume: number) => ({ volume, muted: false });
    expect(audioGains({ master: on(50), music: on(80), sfx: on(100) })).toEqual(
      { music: 0.4, sfx: 0.5 },
    );
    expect(
      audioGains({
        master: on(50),
        music: { volume: 80, muted: true },
        sfx: on(100),
      }).music,
    ).toBe(0);
    expect(
      audioGains({
        master: { volume: 50, muted: true },
        music: on(80),
        sfx: on(100),
      }),
    ).toEqual({ music: 0, sfx: 0 });
  });

  it('falls back to defaults for invalid settings', () => {
    stubStorage(JSON.stringify({ audio: { sfx: { volume: 140 } } }));
    expect(loadSettings().audio).toEqual(DEFAULT_AUDIO);
    stubStorage(JSON.stringify({ quality: 'ultra' }));
    expect(loadSettings().quality).toBe('standard');
    stubStorage('{not json');
    expect(loadSettings().keys).toEqual(DEFAULT_KEYS);
  });
});
