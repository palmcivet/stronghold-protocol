import type { ResourceRefs } from '@alliance/data/refs';
import {
  type AssetKey,
  createAssetResolver,
  type PackAsset,
} from 'arknights-assets-catalog';
import { describe, expect, it } from 'vitest';
import { audioSourceOf, bgmKey, sfxKey, voiceKeys } from './key.js';

const HASH = 'aa'.repeat(32);
const CLICK: AssetKey = 'audio:sfx/ui/g_ui_btn_h';
const LOBBY: AssetKey = 'audio:bgm/m_sys_act1autochess_loop';
const LINE_1: AssetKey = 'audio:voice/cn/char_102_texas/cn_021';
const LINE_2: AssetKey = 'audio:voice/cn/char_102_texas/cn_022';

const REFS = {
  sfx: { ui: { g_ui_btn_h: CLICK, banner: 'image:ui/banner' } },
  bgm: { m_sys_act1autochess_loop: LOBBY },
  voice: { char_102_texas: { select: [LINE_1, 'image:ui/x', LINE_2] } },
} as unknown as ResourceRefs;

describe('audio keys', () => {
  it('reads audio keys from the refs and skips other kinds', () => {
    expect(sfxKey(REFS, 'ui', 'g_ui_btn_h')).toBe(CLICK);
    expect(sfxKey(REFS, 'ui', 'banner')).toBeNull();
    expect(sfxKey(REFS, 'battle', 'g_ui_btn_h')).toBeNull();
    expect(bgmKey(REFS, 'm_sys_act1autochess_loop')).toBe(LOBBY);
    expect(voiceKeys(REFS, 'char_102_texas', 'select')).toEqual([
      LINE_1,
      LINE_2,
    ]);
    expect(voiceKeys(REFS, 'char_102_texas', 'skill1')).toEqual([]);
  });

  it('resolves the file of an audio key', () => {
    const audio: PackAsset = {
      kind: 'audio',
      files: [
        { role: 'main', name: null, format: 'mp3', bytes: 1, hash: HASH },
      ],
      dependsOn: [],
      fallbackId: null,
      preloadGroup: null,
    };
    const resolver = createAssetResolver([
      {
        url: 'https://cdn.example/res/base/',
        manifest: {
          schemaVersion: 1,
          pack: { type: 'base', id: 'base', version: '1', contentHash: HASH },
          requires: [],
          fileRoot: 'files/',
          assets: { [CLICK]: audio },
        },
      },
    ]);
    const source = audioSourceOf(resolver, CLICK);
    expect(source?.key).toBe(CLICK);
    expect(source?.url).toContain('g_ui_btn_h');
    expect(audioSourceOf(resolver, LOBBY)).toBeNull();
  });
});
