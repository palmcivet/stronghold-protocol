import type { AssetKey } from 'arknights-assets-catalog';

/** An animation played as an optional intro, a loop and an optional outro. */
export interface MissionAnimClip {
  readonly begin: string | null;
  readonly loop: string;
  readonly end: string | null;
}

export interface MissionSkillClip extends MissionAnimClip {
  readonly index: number;
  readonly idle: string | null;
}

/** The animations of one skeleton, by the role they play on the field. */
export interface MissionAnimRoles {
  readonly idle: string | null;
  readonly deploy: string | null;
  readonly attack: MissionAnimClip | null;
  readonly attackDown: MissionAnimClip | null;
  readonly skill: MissionSkillClip | null;
  readonly skills?: Readonly<Record<string, MissionSkillClip>>;
  readonly die: string | null;
  readonly move: MissionAnimClip | null;
  readonly stun: MissionAnimClip | null;
}

/**
 * A form of a model: another set of clips, in force while the unit holds every tag of `tags`, none of `without`, and
 * when `blocked` is given, is blocked or not as it says.
 */
export interface MissionAppearanceForm {
  readonly tags: readonly string[];
  readonly without?: readonly string[];
  readonly blocked?: boolean;
  readonly roles: MissionAnimRoles;
}

/** How one unit is drawn. Presentation only: none of it changes the battle. */
export interface MissionAppearance {
  readonly spine: AssetKey;
  readonly roles: MissionAnimRoles;
  /** Uniform model scale. */
  readonly scale: number;
  /** Extra vertical scale on top of `scale`. */
  readonly scaleY: number;
  /** Whether the model faces left when the unit faces right. */
  readonly mirrorX: boolean;
  /** Model offset from the unit's position, in tiles: x along columns, y along rows, z up. */
  readonly offset: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
  /** Multiplied into the model's colours, as 0xRRGGBB. */
  readonly tint?: number;
  /** Whether the unit shows its health bar. Defaults to true. */
  readonly hpBar?: boolean;
  /** Forms checked in order; the first in force replaces `roles`. Without one in force the model plays `roles`. */
  readonly forms?: readonly MissionAppearanceForm[];
  /** Tiles the model floats above the ground, as a flying unit does. It keeps the lift through its death clip. */
  readonly hover?: number;
}

export type MissionAppearances = Readonly<Record<string, MissionAppearance>>;
