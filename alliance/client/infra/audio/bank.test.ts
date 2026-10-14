import { describe, expect, it } from 'vitest';
import { isSkillBankCueType, skillBankOf } from './bank.js';

const BANKS = {
  attack: 'audio:sfx/atk_n',
  hit: 'audio:sfx/imp_n',
  attacks: {
    '0': 'audio:sfx/atk_d',
    '2': 'audio:sfx/atk_s',
  },
  hits: {
    '2': 'audio:sfx/imp_s',
  },
};

describe('skillBankOf', () => {
  it('uses the ordinary bank when no skill is active', () => {
    expect(skillBankOf(BANKS, 'attack')).toBe('audio:sfx/atk_n');
    expect(skillBankOf(BANKS, 'hit', null)).toBe('audio:sfx/imp_n');
  });

  it('picks the mode bank by skillSlot when present', () => {
    expect(skillBankOf(BANKS, 'attack', 0)).toBe('audio:sfx/atk_d');
    expect(skillBankOf(BANKS, 'attack', 2)).toBe('audio:sfx/atk_s');
    expect(skillBankOf(BANKS, 'hit', 2)).toBe('audio:sfx/imp_s');
  });

  it('falls back to the ordinary bank when the slot has no mode sound', () => {
    expect(skillBankOf(BANKS, 'attack', 1)).toBe('audio:sfx/atk_n');
    expect(skillBankOf(BANKS, 'hit', 0)).toBe('audio:sfx/imp_n');
  });

  it('returns null without banks', () => {
    expect(skillBankOf(null, 'attack', 0)).toBeNull();
    expect(skillBankOf({ attacks: { '0': 'x' } }, 'hit', 0)).toBeNull();
  });

  it('recognises attack/hit cue types for skillSlot selection', () => {
    expect(isSkillBankCueType('attack')).toBe(true);
    expect(isSkillBankCueType('hit')).toBe(true);
    expect(isSkillBankCueType('skill')).toBe(false);
  });
});
