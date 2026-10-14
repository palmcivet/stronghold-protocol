/**
 * Skill-slot sound bank selection (master 0.2.3「主动技能的攻击与命中音」).
 * Core attack/hit events carry `skillSlot`; the host picks the mode bank when the skill is active.
 */

/** Per-unit attack / hit banks: ordinary plus optional per-skill-index tables. */
export interface UnitSoundBanks {
  readonly attack?: string | null;
  readonly hit?: string | null;
  /** Skill index (0-based) → attack bank key or path. */
  readonly attacks?: Readonly<Record<string, string | null | undefined>>;
  /** Skill index (0-based) → hit bank key or path. */
  readonly hits?: Readonly<Record<string, string | null | undefined>>;
}

export type UnitSoundKind = 'attack' | 'hit';

/**
 * Bank for an attack or hit cue. When `skillSlot` is set and that slot has a mode bank, use it; otherwise the ordinary
 * attack / hit bank. Null when the unit has no sound for that role.
 */
export function skillBankOf(
  banks: UnitSoundBanks | null | undefined,
  kind: UnitSoundKind,
  skillSlot?: number | null,
): string | null {
  if (!banks) {
    return null;
  }
  if (typeof skillSlot === 'number' && Number.isFinite(skillSlot) && skillSlot >= 0) {
    const table = kind === 'attack' ? banks.attacks : banks.hits;
    const keyed = table?.[String(Math.trunc(skillSlot))];
    if (typeof keyed === 'string' && keyed) {
      return keyed;
    }
  }
  const ordinary = kind === 'attack' ? banks.attack : banks.hit;
  return typeof ordinary === 'string' && ordinary ? ordinary : null;
}

/**
 * Whether a MissionAudioCue type should resolve through per-unit attack/hit banks (skillSlot applies).
 */
export function isSkillBankCueType(type: string): type is UnitSoundKind {
  return type === 'attack' || type === 'hit';
}
