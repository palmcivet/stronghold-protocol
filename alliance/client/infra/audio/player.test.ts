import type { CueTable } from '@alliance/data/pack-app';
import {
  type AssetKey,
  type AudioSource,
  createAssetResolver,
  type PackAsset,
} from 'arknights-assets-catalog';
import { describe, expect, it } from 'vitest';
import {
  type AudioOutput,
  type AudioPacks,
  createAudioPlayer,
} from './player.js';

const HASH = 'aa'.repeat(32);
const CLICK: AssetKey = 'audio:sfx/ui/g_ui_btn_h';
const INTRO: AssetKey = 'audio:bgm/m_sys_act1autochess_intro';
const LOBBY: AssetKey = 'audio:bgm/m_sys_act1autochess_loop';
const COMBAT: AssetKey = 'audio:bgm/m_bat_act1autochess_loop';

const audio: PackAsset = {
  kind: 'audio',
  files: [{ role: 'main', name: null, format: 'mp3', bytes: 1, hash: HASH }],
  dependsOn: [],
  fallbackId: null,
  preloadGroup: null,
};

const PACKS: AudioPacks = {
  resolver: createAssetResolver([
    {
      url: 'https://cdn.example/res/season/',
      manifest: {
        schemaVersion: 1,
        pack: { type: 'season', id: 's', version: '1', contentHash: HASH },
        requires: [],
        fileRoot: 'files/',
        assets: {
          [CLICK]: audio,
          [INTRO]: audio,
          [LOBBY]: audio,
          [COMBAT]: audio,
        },
      },
    },
  ]),
  cues: {
    ui: { click: CLICK, back: 'audio:sfx/ui/nowhere' },
    bgm: { lobby: { intro: INTRO, loop: LOBBY }, combat: { loop: COMBAT } },
  } as unknown as CueTable,
};

function recorder() {
  const calls: string[] = [];
  const name = (source: AudioSource | null) => source?.key ?? '-';
  const output: AudioOutput = {
    playOnce: (source) => calls.push(`once ${name(source)}`),
    playMusic: (intro, loop) =>
      calls.push(`music ${name(intro)} ${name(loop)}`),
    stopMusic: () => calls.push('stop'),
    setGains: (gains) => calls.push(`gains ${gains.music} ${gains.sfx}`),
  };
  return { calls, output };
}

describe('audio player', () => {
  it('plays the sound of a cue role, and nothing for a role without a file', () => {
    const { calls, output } = recorder();
    const player = createAudioPlayer(output, () => PACKS);
    player.cue('ui.click');
    player.cue('ui.back');
    player.cue('bond.levelUp');
    expect(calls).toEqual([`once ${CLICK}`]);
  });

  it('keeps the current track, switches on a new one and stops on a role without music', () => {
    const { calls, output } = recorder();
    const player = createAudioPlayer(output, () => PACKS);
    player.music('lobby');
    player.music('lobby');
    player.music('combat');
    player.music('prep');
    player.music('prep');
    player.music('combat');
    player.stop();
    expect(calls).toEqual([
      `music ${INTRO} ${LOBBY}`,
      `music - ${COMBAT}`,
      'stop',
      `music - ${COMBAT}`,
      'stop',
    ]);
  });

  it('is silent before the packs load', () => {
    const { calls, output } = recorder();
    const player = createAudioPlayer(output, () => null);
    player.cue('ui.click');
    player.music('lobby');
    expect(calls).toEqual([]);
  });
});
