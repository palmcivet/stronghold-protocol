import { beforeEach, describe, expect, it } from 'vitest';
import { migrateLegacy } from '#infra/boot/storage.js';
import {
  backendOf,
  configureStorage,
  damagedKey,
  envelope,
  memoryHost,
} from '#infra/storage/index.js';
import {
  audioGains,
  audioItem,
  DEFAULT_AUDIO,
  displayItem,
  identityItem,
  keysItem,
  keysToKeymap,
  migrateSettingsSections,
} from './index.js';

const small = () => backendOf('small');

describe('settings sections', () => {
  beforeEach(() => {
    configureStorage(memoryHost());
  });

  it('fills defaults for what is missing in each section item', async () => {
    await small().set(identityItem.key(), envelope(1, { name: 'Amiya' }));
    await small().set(
      keysItem.key(),
      envelope(1, { keymap: { 'core:freeze': ['KeyQ'] } }),
    );
    await small().set(
      audioItem.key(),
      envelope(1, { audio: { music: { muted: true } } }),
    );
    expect(await identityItem.load()).toEqual({
      language: 'zh-Hans',
      name: 'Amiya',
      avatar: '',
    });
    expect(await displayItem.load()).toEqual({
      quality: 'standard',
      textSize: 'sm',
      safeAreaUi: true,
    });
    expect(await keysItem.load()).toEqual({
      keymap: { 'core:freeze': ['KeyQ'] },
    });
    expect(await audioItem.load()).toEqual({
      audio: {
        ...DEFAULT_AUDIO,
        music: { ...DEFAULT_AUDIO.music, muted: true },
      },
    });
  });

  it('splits the monolith and keeps the keys the player changed as overrides', async () => {
    await small().set('alliance.settings', {
      name: 'Kal',
      keys: { refresh: 'KeyD', levelUp: 'KeyG', freeze: 'KeyE' },
    });
    await migrateLegacy();
    expect(await small().get('alliance.settings')).toBeUndefined();
    expect(await small().get(identityItem.key())).toEqual(
      envelope(1, { language: 'zh-Hans', name: 'Kal', avatar: '' }),
    );
    expect(await keysItem.load()).toEqual({
      keymap: { 'core:levelUp': ['KeyG'] },
    });
    expect(await displayItem.load()).toMatchObject({ safeAreaUi: true });
  });

  it('splits a former monolith v2 envelope without losing safeAreaUi', async () => {
    await small().set(
      'wsde:device:core:settings',
      envelope(2, {
        name: 'Nearl',
        quality: 'high',
        safeAreaUi: false,
        textSize: 'lg',
        keymap: { 'core:ready': ['KeyZ'] },
        audio: { master: { volume: 10, muted: false } },
      }),
    );
    await migrateSettingsSections();
    expect(await small().get('wsde:device:core:settings')).toBeUndefined();
    expect(await identityItem.load()).toMatchObject({ name: 'Nearl' });
    expect(await displayItem.load()).toEqual({
      quality: 'high',
      textSize: 'lg',
      safeAreaUi: false,
    });
    expect(await keysItem.load()).toEqual({
      keymap: { 'core:ready': ['KeyZ'] },
    });
    expect((await audioItem.load()).audio.master.volume).toBe(10);
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
    await small().set(displayItem.key(), envelope(1, { quality: 'ultra' }));
    expect((await displayItem.load()).quality).toBe('standard');
    expect(await small().get(damagedKey(displayItem.spec))).toMatchObject({
      raw: envelope(1, { quality: 'ultra' }),
    });
    expect(await small().get(displayItem.key())).toBeUndefined();
  });

  it('turns the old keys table into keymap overrides', () => {
    expect(
      keysToKeymap({
        name: 'X',
        keys: { refresh: 'KeyD', levelUp: 'KeyG', freeze: 'KeyE' },
      }),
    ).toEqual({ name: 'X', keymap: { 'core:levelUp': ['KeyG'] } });
  });
});
