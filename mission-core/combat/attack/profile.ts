import type { AttackClip, AttackShape, UnitSpec } from "#contract/spec.js"
import { defineComponent } from "#kernel/world/component.js"
import type { ComponentStore } from "#kernel/world/component.js"

/** 规格写的攻击动作与攻击形状。放入单位时建好，之后只读。 */
export interface AttackProfile {
  readonly clip: AttackClip | null
  readonly shape: AttackShape | null
}

const NO_PROFILE: AttackProfile = Object.freeze({ clip: null, shape: null })

export const ATTACK_PROFILE = defineComponent<AttackProfile>("attack:profile", { create: () => NO_PROFILE })

/** 单位的攻击档案。规格没写时两项都是 null。 */
export function attackProfileOf(world: { readonly components: ComponentStore }, unitId: string): AttackProfile {
  return world.components.access(ATTACK_PROFILE).get(unitId) ?? NO_PROFILE
}

/** 规格写了攻击动作或形状时建一份档案，否则返回 null。 */
export function profileFromSpec(spec: UnitSpec): AttackProfile | null {
  if (!spec.attackClip && !spec.attackShape) return null
  return {
    clip: spec.attackClip ? { duration: spec.attackClip.duration, hit: spec.attackClip.hit } : null,
    shape: spec.attackShape ? copyAttackShape(spec.attackShape) : null,
  }
}

function copyAttackShape(shape: AttackShape): AttackShape {
  return {
    ...(shape.damage ? { damage: shape.damage } : {}),
    ...(shape.splash ? { splash: { ...shape.splash } } : {}),
    ...(shape.bounce ? { bounce: { ...shape.bounce } } : {}),
    ...(shape.chain ? { chain: { ...shape.chain } } : {}),
    ...(shape.healCount !== undefined ? { healCount: shape.healCount } : {}),
    ...(shape.lockRange === true ? { lockRange: true } : {}),
    ...(shape.projectile ? { projectile: shape.projectile } : {}),
  }
}
