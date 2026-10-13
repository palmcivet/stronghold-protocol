// Operator loadouts: a chess record as the selected skill and module make it, and the attack range it is deployed with.

const GEO = { COLS: 21 };

/** A range offset `[dRow, dCol]`, facing RIGHT. */
export type GridCell = [number, number];

/** A range grid as the data writes it: `[dRow, dCol]` pairs, facing RIGHT. */
export type RangeGrid = readonly (readonly number[])[];

/** A skill of a chess record. */
export interface SkillRecord {
  readonly index: number;
  readonly isDefault?: boolean;
  readonly rangeGrid?: RangeGrid;
  readonly desc?: string;
  readonly iconId?: string;
  readonly overrideTokenKey?: string;
}

/** A record's 特性: the module description and its blackboard, among the data's other fields. */
export interface TraitRecord {
  readonly moduleDesc?: string;
  readonly bb?: Readonly<Record<string, unknown>>;
  readonly [key: string]: unknown;
}

/** A module a chess record can equip. */
export interface ModuleRecord {
  readonly uniEquipId: string;
  readonly isDefault?: boolean;
  readonly attr?: Readonly<Record<string, number>>;
  readonly traitOverride?: TraitRecord;
  readonly talentChanges?: readonly TalentChange[];
  readonly name?: string;
  readonly typeName?: string;
  readonly level?: number;
}

/** A talent of a chess record. */
export interface TalentRecord {
  readonly index: number;
  readonly name?: string | undefined;
  readonly desc?: string | undefined;
  readonly descRaw?: string | undefined;
  readonly bb?: Readonly<Record<string, unknown>> | undefined;
  readonly bbStr?: Readonly<Record<string, unknown>> | undefined;
  readonly rangeGrid?: RangeGrid | undefined;
  readonly tokenKey?: string | undefined;
  readonly containerTokenKey?: string | undefined;
  readonly hidden?: boolean | undefined;
  readonly fromModule?: boolean | undefined;
}

/** How a module changes the talent at `talentIndex`; −1 is a range-only change. */
export interface TalentChange {
  readonly talentIndex: number;
  readonly name?: string;
  readonly desc?: string;
  readonly descRaw?: string;
  readonly bb?: Readonly<Record<string, unknown>>;
  readonly bbStr?: Readonly<Record<string, unknown>>;
  readonly rangeGrid?: RangeGrid;
  readonly tokenKey?: string;
}

/** The module a record carries: `id` null and `active` false when none is equipped. */
export interface ModuleState {
  readonly id?: string | null;
  readonly name?: string | null;
  readonly type?: string | null;
  readonly level?: number;
  readonly active?: boolean;
}

/** A chess record as the data writes it; the loadout tools read only these fields and keep the others. */
export interface ChessRecord {
  readonly isGolden?: boolean;
  readonly rangeGrid?: RangeGrid;
  readonly skill?: SkillRecord;
  readonly skills?: readonly SkillRecord[];
  readonly module?: ModuleState;
  readonly modules?: readonly ModuleRecord[];
  readonly stats?: Readonly<Record<string, number>>;
  readonly statsBase?: Readonly<Record<string, number>>;
  readonly trait?: TraitRecord | undefined;
  readonly traitBase?: TraitRecord;
  readonly talents?: readonly TalentRecord[];
  readonly talentsBase?: readonly TalentRecord[];
  readonly tokens?: readonly string[];
  readonly assets?: {
    readonly skillIcon?: string | undefined;
    readonly [key: string]: unknown;
  };
  readonly [key: string]: unknown;
}

/** The skill and module asked for; `skill` and `module` are the older names of `skillIndex` and `moduleId`. */
export interface LoadoutRequest {
  skillIndex?: number;
  moduleId?: string;
  skill?: number;
  module?: string | null;
}

type Writable<T> = { -readonly [K in keyof T]: T[K] };

const isRecord = (value: unknown): value is ChessRecord =>
  value !== null && typeof value === 'object';

/** A loadout resolved against a record: the skill and module it fights with, and whether each is the default. */
export interface ResolvedRecordLoadout {
  readonly skillIndex: number | null;
  /** 'none' for no module; null for a record without module choices. */
  readonly moduleId: string | null;
  readonly skillIsDefault: boolean;
  readonly moduleIsDefault: boolean;
  readonly isDefault: boolean;
}

/** Resolves a loadout against a chess record; null without a record. An unknown skill or module falls back to the default. */
export function resolveRecordLoadout(
  rec: unknown,
  loadout: LoadoutRequest | null = null,
): ResolvedRecordLoadout | null {
  if (!isRecord(rec)) {
    return null;
  }
  const skills: readonly SkillRecord[] | null = Array.isArray(rec.skills)
    ? rec.skills
    : null;
  const defSkill: number | null =
    rec.skill && Number.isInteger(rec.skill.index)
      ? rec.skill.index
      : (skills?.find((s) => s?.isDefault)?.index ?? null);
  const lo: LoadoutRequest =
    loadout && typeof loadout === 'object' ? loadout : {};
  const wantSkill = lo.skillIndex ?? lo.skill;
  const skillIndex =
    skills &&
    typeof wantSkill === 'number' &&
    Number.isInteger(wantSkill) &&
    skills.some((s) => s && s.index === wantSkill)
      ? wantSkill
      : defSkill;
  const mods: readonly ModuleRecord[] | null = Array.isArray(rec.modules)
    ? rec.modules
    : null;
  const defMod = mods
    ? (mods.find((m) => m?.isDefault)?.uniEquipId ?? 'none')
    : null;
  const wantMod = lo.moduleId ?? lo.module;
  const moduleId: string | null =
    mods &&
    (wantMod === 'none' ||
      (typeof wantMod === 'string' &&
        mods.some((m) => m && m.uniEquipId === wantMod)))
      ? wantMod
      : defMod;
  const skillIsDefault = skillIndex === defSkill;
  const moduleIsDefault = moduleId === defMod;
  return {
    skillIndex,
    moduleId,
    skillIsDefault,
    moduleIsDefault,
    isDefault: skillIsDefault && moduleIsDefault,
  };
}

const clean6 = (v: number): number =>
  typeof v !== 'number' ||
  !Number.isFinite(v) ||
  Number.isInteger(v) ||
  Math.abs(v) >= 1e6
    ? v
    : Math.round(v * 1e6) / 1e6;

/** Stats with a module: the no-module `statsBase` + the module's flat `attr`, rounded to six decimals. */
export function composeStats(
  statsBase: Readonly<Record<string, number>> | null | undefined,
  attr: Readonly<Record<string, number>> | null | undefined,
): Record<string, number> {
  const s: Record<string, number> = { ...(statsBase || {}) };
  for (const [f, v] of Object.entries(attr || {})) {
    s[f] = clean6((s[f] || 0) + v);
  }
  return s;
}

/**
 * Talents with a module: apply ModuleRecord.talentChanges to the no-module talents (override of an existing index:
 * module values win, base keys the module does not restate are kept; otherwise appended; empty placeholders dropped).
 */
export function composeTalents(
  base: readonly TalentRecord[] | null | undefined,
  changes: readonly TalentChange[] | null | undefined,
): TalentRecord[] {
  const talents: TalentRecord[] = (Array.isArray(base) ? base : []).map(
    (t: TalentRecord) => ({ ...t }),
  );
  const talentChanges: readonly TalentChange[] = Array.isArray(changes)
    ? changes
    : [];
  for (const ch of talentChanges) {
    const { talentIndex, ...rest } = ch;
    const rec: TalentRecord = { index: talentIndex, ...rest, fromModule: true };
    const at =
      talentIndex >= 0 ? talents.findIndex((x) => x.index === talentIndex) : -1;
    if (at >= 0) {
      const old = talents[at];
      if (!old) {
        continue;
      }
      talents[at] = {
        ...rec,
        name: rec.name || old.name,
        desc: rec.desc ?? old.desc,
        descRaw: rec.descRaw ?? old.descRaw,
        bb: { ...old.bb, ...rec.bb },
        bbStr: { ...old.bbStr, ...rec.bbStr },
        rangeGrid: rec.rangeGrid || old.rangeGrid,
        tokenKey: rec.tokenKey || old.tokenKey,
        hidden: old.hidden && rec.hidden,
      };
    } else {
      talents.push(rec);
    }
  }
  return talents.filter(
    (t: TalentRecord) =>
      t.name || t.desc || Object.keys(t.bb || {}).length || t.tokenKey,
  );
}

/**
 * The chess record as the selected loadout makes it (a new object; the input is never mutated): `skill` = the selected
 * SkillRecord; golden chess with a non-default module choice: `stats` = statsBase + module attr, `trait` = the module's
 * traitOverride or traitBase, `talents` = talentsBase + talentChanges, `module` = the chosen module (`active:false`,
 * id null for 'none'). A talent that summons through a container token (凛御银灰) follows the selected skill's token.
 * The default loadout, and a missing record or loadout, return `rec` itself.
 */
export function loadoutRecord<R extends ChessRecord | null | undefined>(
  rec: R,
  lo: ResolvedRecordLoadout | null | undefined,
): R | ChessRecord {
  if (!rec || !lo || lo.isDefault) {
    return rec;
  }
  const out: Writable<ChessRecord> = { ...rec };
  if (!lo.moduleIsDefault && Array.isArray(rec.modules)) {
    const m: ModuleRecord | null =
      lo.moduleId === 'none'
        ? null
        : ((rec.modules as readonly ModuleRecord[]).find(
            (x: ModuleRecord) => x.uniEquipId === lo.moduleId,
          ) ?? null);
    out.stats = composeStats(rec.statsBase ?? rec.stats, m ? m.attr : null);
    out.trait = m?.traitOverride || rec.traitBase || rec.trait;
    out.talents = composeTalents(
      rec.talentsBase ?? rec.talents,
      m ? m.talentChanges : null,
    );
    out.module = m
      ? {
          id: m.uniEquipId,
          name: m.name ?? null,
          type: m.typeName ?? null,
          level: m.level ?? rec.module?.level ?? 0,
          active: true,
        }
      : {
          id: null,
          name: null,
          type: null,
          level: rec.module?.level ?? 0,
          active: false,
        };
  }
  if (!lo.skillIsDefault && Array.isArray(rec.skills)) {
    const s = (rec.skills as readonly SkillRecord[]).find(
      (x: SkillRecord) => x.index === lo.skillIndex,
    );
    if (s) {
      out.skill = s;
      if (rec.assets) {
        out.assets = {
          ...rec.assets,
          skillIcon: s.iconId ?? rec.assets.skillIcon,
        };
      }
      const tok = s.overrideTokenKey;
      const talents: TalentRecord[] = Array.isArray(out.talents)
        ? out.talents
        : [];
      if (
        tok &&
        (rec.tokens || []).includes(tok) &&
        talents.some((t: TalentRecord) => t.containerTokenKey)
      ) {
        out.talents = talents.map((t: TalentRecord) =>
          t.containerTokenKey ? { ...t, tokenKey: tok } : t,
        );
      }
    }
  }
  return out;
}

/**
 * The attack range a (loadout-resolved) chess record fights with from its deployment — the detail card without a live
 * entry, the board's range overlay and the deploy wheel, the same tiles the battle unit starts with (prep
 * m.unitStats `range`): the selected skill's grid when it reads "被动效果：攻击范围扩大" (引星棘刺 S3 3-9: her own range
 * while she carries it, tier5 kit); else an elite whose equipped module reads "攻击范围扩大" uses that module's own grid
 * — its range-only talent change (talentIndex −1), e.g. SPC-X = the 3×3 caster range + the centre tile [0,3] — as the
 * kits do (tier4 moduleRangeGrid, tier5 moduleRangeUp); anything else its `rangeGrid`. Then grown by the 特性's
 * permanent 攻击距离 (traitRangeExtend: 信仰搅拌机 SPT-Y "攻击距离+1"). A running skill's range is the live entry's.
 * `rec` is a loadoutRecord output, or a chess record with its default module; null without a record or a range.
 */
export function attackRangeGrid(rec: unknown): RangeGrid | GridCell[] | null {
  if (!isRecord(rec)) {
    return null;
  }
  let g: RangeGrid | null = Array.isArray(rec.rangeGrid) ? rec.rangeGrid : null;
  const sk = rec.skill;
  const m = rec.module;
  if (
    sk &&
    Array.isArray(sk.rangeGrid) &&
    sk.rangeGrid.length &&
    /被动效果：攻击范围扩大/.test(String(sk.desc ?? ''))
  ) {
    g = sk.rangeGrid;
  } else if (
    rec.isGolden &&
    m?.active &&
    m.id &&
    /攻击范围扩大/.test(String(rec.trait?.moduleDesc ?? ''))
  ) {
    const mod = (
      Array.isArray(rec.modules) ? (rec.modules as readonly ModuleRecord[]) : []
    ).find((x: ModuleRecord) => x.uniEquipId === m.id);
    const mg = (mod?.talentChanges || []).find(
      (t: TalentChange) =>
        t.talentIndex === -1 &&
        Array.isArray(t.rangeGrid) &&
        t.rangeGrid.length,
    )?.rangeGrid;
    if (mg) {
      g = mg;
    }
  }
  const ext = traitRangeExtend(rec);
  return g && ext ? extendedGrid(g, ext) : g;
}

/**
 * The permanent 攻击距离 (ability_range_forward_extend) a record's 特性 grants — a module's, e.g. 信仰搅拌机 SPT-Y
 * "攻击距离+1" (tier4 rangeUp: a persistent rangeExtend buff, s.baseRangeExtend); 0 for one that works "在集成战略中" only
 * (空弦 ISW-A). The other 攻击距离 of the mode are skills' (their running range). `rec` is a loadoutRecord output.
 */
export function traitRangeExtend(rec: unknown): number {
  const t = isRecord(rec) ? rec.trait : null;
  if (
    !t ||
    typeof t !== 'object' ||
    /集成战略/.test(String(t.moduleDesc ?? ''))
  ) {
    return 0;
  }
  const n = Math.floor(Number(t.bb?.ability_range_forward_extend) || 0);
  return n > 0 ? n : 0;
}

/**
 * A range grid (`[dRow, dCol]`, facing RIGHT) grown by `extend` (rangeExtend / 攻击距离): every row gains the whole
 * tiles 1 … ⌊extend⌋ beyond its far (+dCol) end, deduplicated, junk entries dropped. The battle keeps it as the live
 * range of a unit while an extend applies, and attackRangeGrid uses it for the deployed range. Anything but an array
 * gives no tiles.
 */
export function extendedGrid(grid: unknown, extend = 0): GridCell[] {
  const out: GridCell[] = [];
  const seen = new Set<string>();
  const add = (dr: number, dc: number): void => {
    const k = `${dr},${dc}`;
    if (!seen.has(k)) {
      seen.add(k);
      out.push([dr, dc]);
    }
  };
  if (!Array.isArray(grid)) {
    return out;
  }
  const cells: GridCell[] = grid.filter(
    (p: unknown): p is GridCell =>
      Array.isArray(p) && Number.isInteger(p[0]) && Number.isInteger(p[1]),
  );
  for (const [dr, dc] of cells) {
    add(dr, dc);
  }
  if (extend > 0 && Number.isFinite(extend)) {
    const maxByRow = new Map<number, number>();
    for (const [dr, dc] of cells) {
      maxByRow.set(dr, Math.max(maxByRow.get(dr) ?? -Infinity, dc));
    }
    for (const [dr, mx] of maxByRow) {
      for (let k = 1; k <= Math.min(extend, GEO.COLS); k++) {
        add(dr, mx + k);
      }
    }
  }
  return out;
}
