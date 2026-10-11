import type { AssetKey } from "arknights-assets-catalog"

/** An animation played as an optional intro, a loop and an optional outro. */
export interface MissionAnimClip {
  readonly begin: string | null
  readonly loop: string
  readonly end: string | null
}

export interface MissionSkillClip extends MissionAnimClip {
  readonly index: number
  readonly idle: string | null
}

/** The animations of one skeleton, by the role they play on the field. */
export interface MissionAnimRoles {
  readonly idle: string | null
  readonly deploy: string | null
  readonly attack: MissionAnimClip | null
  readonly attackDown: MissionAnimClip | null
  readonly skill: MissionSkillClip | null
  readonly skills?: Readonly<Record<string, MissionSkillClip>>
  readonly die: string | null
  readonly move: MissionAnimClip | null
  readonly stun: MissionAnimClip | null
}

/** How one unit is drawn. Presentation only: none of it changes the battle. */
export interface MissionAppearance {
  readonly spine: AssetKey
  readonly roles: MissionAnimRoles
  /** Uniform model scale. */
  readonly scale: number
  /** Extra vertical scale on top of `scale`. */
  readonly scaleY: number
  /** Whether the model faces left when the unit faces right. */
  readonly mirrorX: boolean
  /** Model offset from the unit's position, in tiles: x along columns, y along rows, z up. */
  readonly offset: { readonly x: number; readonly y: number; readonly z: number }
  /** Multiplied into the model's colours, as 0xRRGGBB. */
  readonly tint?: number
  /** Whether the unit shows its health bar. Defaults to true. */
  readonly hpBar?: boolean
}

export type MissionAppearances = Readonly<Record<string, MissionAppearance>>
