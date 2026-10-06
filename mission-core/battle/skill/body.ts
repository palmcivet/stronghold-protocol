import type { SkillBodyDefinition, SkillRuntime } from "#port/content.js"
import type { BattleRegistry } from "#battle/registry.js"
import { TICK } from "#tick/index.js"

export const builtinSkillBodies = ["duration", "ammo", "instant", "charges", "passive", "toggle"] as const

export function registerBuiltinSkillBodies(registry: BattleRegistry): void {
  registry.registerSkillBody(durationBody())
  registry.registerSkillBody(ammoBody())
  registry.registerSkillBody(instantBody())
  registry.registerSkillBody(chargesBody())
  registry.registerSkillBody(passiveBody())
  registry.registerSkillBody(toggleBody())
}

function durationBody(): SkillBodyDefinition {
  return {
    id: "duration",
    cast(skill, spec) {
      skill.active = true
      skill.remaining = Math.max(0.01, spec.duration)
    },
    advance(skill) {
      if (!skill.active) return
      skill.remaining -= TICK
      if (skill.remaining <= 1e-9) {
        skill.remaining = 0
        skill.active = false
      }
    },
  }
}

function ammoBody(): SkillBodyDefinition {
  return {
    id: "ammo",
    cast(skill, spec) {
      skill.active = true
      skill.ammo = Math.max(1, spec.ammo)
      skill.remaining = spec.duration > 0 ? spec.duration : Number.POSITIVE_INFINITY
    },
    advance(skill) {
      if (!skill.active || !Number.isFinite(skill.remaining)) return
      skill.remaining -= TICK
      if (skill.remaining <= 1e-9) {
        skill.remaining = 0
        skill.active = false
      }
    },
  }
}

function instantBody(): SkillBodyDefinition {
  return {
    id: "instant",
    cast(skill) {
      skill.active = true
      skill.remaining = 0
    },
    advance(_skill: SkillRuntime) {},
  }
}

function chargesBody(): SkillBodyDefinition {
  return {
    id: "charges",
    cast(skill) {
      skill.active = true
      skill.remaining = 0
    },
    advance(_skill: SkillRuntime) {},
  }
}

function passiveBody(): SkillBodyDefinition {
  return {
    id: "passive",
    cast(skill) {
      skill.active = true
    },
    advance(skill) {
      skill.active = true
    },
  }
}

function toggleBody(): SkillBodyDefinition {
  return {
    id: "toggle",
    cast(skill) {
      skill.toggled = true
      skill.active = true
      skill.remaining = Number.POSITIVE_INFINITY
    },
    advance(_skill: SkillRuntime) {},
  }
}
