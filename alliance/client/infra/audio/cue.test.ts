import { PHASE } from '@alliance/contract/match.js';
import type { CueTable } from '@alliance/data/pack-app';
import { describe, expect, it } from 'vitest';
import { cueKey, layerCue, trackFor, trackKeys } from './cue.js';

const CUES = {
  ui: { click: 'audio:sfx/ui/g_ui_btn_h', tab: 'image:ui/banner' },
  bond: { levelUp: 'audio:sfx/autochess/act1autochess_b_ui_buffup' },
  bgm: {
    lobby: {
      intro: 'audio:bgm/m_sys_act1autochess_intro',
      loop: 'audio:bgm/m_sys_act1autochess_loop',
    },
    combat: { loop: 'audio:bgm/m_bat_act1autochess_loop' },
    boss: { loop: 'audio:bgm/m_bat_rglk1phantomcastle_loop' },
    prep: { intro: 'audio:bgm/m_bat_x_intro' },
  },
  bossBgm: { boss_1: { loop: 'audio:bgm/m_bat_ancestor_loop' } },
} as unknown as CueTable;

const view = (
  phase: string,
  bossId: string | null = null,
  hiddenBossId: string | null = null,
) => ({ phase, bossId, hiddenBossId }) as Parameters<typeof trackFor>[1];

describe('cue roles', () => {
  it('reads the audio key of a cue role and skips other kinds', () => {
    expect(cueKey(CUES, 'ui.click')).toBe('audio:sfx/ui/g_ui_btn_h');
    expect(cueKey(CUES, 'bond.levelUp')).toBe(
      'audio:sfx/autochess/act1autochess_b_ui_buffup',
    );
    expect(cueKey(CUES, 'ui.tab')).toBeNull();
    expect(cueKey(CUES, 'ui.back')).toBeNull();
    expect(cueKey({}, 'ui.click')).toBeNull();
  });

  it('reads a track with its intro, and falls back for a boss and the rescue phase', () => {
    expect(trackKeys(CUES, 'lobby')).toEqual({
      intro: 'audio:bgm/m_sys_act1autochess_intro',
      loop: 'audio:bgm/m_sys_act1autochess_loop',
    });
    expect(trackKeys(CUES, 'boss:boss_1')).toEqual({
      intro: null,
      loop: 'audio:bgm/m_bat_ancestor_loop',
    });
    expect(trackKeys(CUES, 'boss:boss_9')?.loop).toBe(
      'audio:bgm/m_bat_rglk1phantomcastle_loop',
    );
    expect(trackKeys(CUES, 'unite')?.loop).toBe(
      'audio:bgm/m_bat_act1autochess_loop',
    );
    expect(trackKeys(CUES, 'prep')).toBeNull();
    const rounds = {
      bgm: {
        combat: { loop: 'audio:bgm/m_bat_act1autochess_loop' },
      },
      combat: [
        {
          rounds: { from: 1, to: 7 },
          loop: 'audio:bgm/m_bat_kazimierz2_2_loop',
        },
        { rounds: { from: 8 }, loop: 'audio:bgm/m_bat_kazimierz2_1_loop' },
      ],
    } as unknown as CueTable;
    expect(trackKeys(rounds, 'combat', 7)?.loop).toBe(
      'audio:bgm/m_bat_kazimierz2_2_loop',
    );
    expect(trackKeys(rounds, 'combat', 8)?.loop).toBe(
      'audio:bgm/m_bat_kazimierz2_1_loop',
    );
    expect(trackKeys(rounds, 'combat')?.loop).toBe(
      'audio:bgm/m_bat_act1autochess_loop',
    );
  });

  it('picks the track role by the screen and the phase', () => {
    expect(trackFor(false, view(PHASE.COMBAT))).toBe('lobby');
    expect(trackFor(true, null)).toBe('lobby');
    expect(trackFor(true, view(PHASE.BAND_DRAFT))).toBe('lobby');
    expect(trackFor(true, view(PHASE.PREP))).toBe('prep');
    expect(trackFor(true, view(PHASE.COMBAT))).toBe('combat');
    expect(trackFor(true, view(PHASE.UNITE))).toBe('unite');
    expect(trackFor(true, view(PHASE.FINAL_ASSAULT, 'boss_1'))).toBe(
      'boss:boss_1',
    );
    expect(trackFor(true, view(PHASE.FINAL_ASSAULT))).toBe('boss');
    expect(trackFor(true, view(PHASE.HIDDEN_CORE, 'boss_1', 'boss_9'))).toBe(
      'boss:boss_9',
    );
  });

  it('cues a bond layer gain of the own player only', () => {
    const layer = {
      t: 'm.layer',
      playerId: 'p1',
      bondId: 'b1',
      add: 2,
    } as const;
    expect(layerCue(layer, 'p1')).toBe('bond.levelUp');
    expect(layerCue(layer, 'p2')).toBeNull();
    expect(layerCue({ ...layer, add: 0 }, 'p1')).toBeNull();
    expect(layerCue({ ...layer, bondId: '' }, 'p1')).toBeNull();
  });
});
