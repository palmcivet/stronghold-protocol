import { beforeEach, describe, expect, it } from 'vitest';
import { migrateLegacy } from '#infra/boot/storage.js';
import {
  backendOf,
  configureStorage,
  damagedKey,
  envelope,
  memoryHost,
} from '#infra/storage/index.js';
import { audioGains, DEFAULT_AUDIO, settingsItem } from './settings.js';

const small = () => backendOf('small');

describe('settings', () => {
  beforeEach(() => {
    configureStorage(memoryHost());
  });

  it('fills defaults for what is missing', async () => {
    await small().set(
      settingsItem.key(),
      envelope(2, {
        name: 'Amiya',
        keymap: { 'core:freeze': ['KeyQ'] },
        audio: { music: { muted: true } },
      }),
    );
    expect(await settingsItem.load()).toEqual({
      language: 'zh-Hans',
      name: 'Amiya',
      avatar: '',
      quality: 'standard',
      textSize: 'sm',
      keymap: { 'core:freeze': ['KeyQ'] },
      audio: {
        ...DEFAULT_AUDIO,
        music: { ...DEFAULT_AUDIO.music, muted: true },
      },
    });
  });

  it('moves the old settings once and keeps the keys the player changed as overrides', async () => {
    await small().set('alliance.settings', {
      name: 'Kal',
      keys: { refresh: 'KeyD', levelUp: 'KeyG', freeze: 'KeyE' },
    });
    await migrateLegacy();
    expect(await small().get('alliance.settings')).toBeUndefined();
    const loaded = await settingsItem.load();
    expect(loaded.name).toBe('Kal');
    // D and E were the old defaults, so the new ones apply; G was the player's own
    expect(loaded.keymap).toEqual({ 'core:levelUp': ['KeyG'] });
    expect(await small().get(settingsItem.key())).toEqual(envelope(2, loaded));
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

  it('keeps a damaged value as a backup and falls back to defaults', async () => {
    await small().set(settingsItem.key(), envelope(2, { quality: 'ultra' }));
    expect((await settingsItem.load()).quality).toBe('standard');
    expect(await small().get(damagedKey(settingsItem.spec))).toMatchObject({
      raw: envelope(2, { quality: 'ultra' }),
    });
    expect(await small().get(settingsItem.key())).toBeUndefined();
    await small().set(settingsItem.key(), '{not json');
    expect((await settingsItem.load()).keymap).toEqual({});
  });
});
