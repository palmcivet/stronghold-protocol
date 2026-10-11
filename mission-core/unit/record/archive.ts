import type { BattleSpec, SkillHook, UnitSpec } from "#contract/spec.js"
import type { BattleRegistry } from "#port/definition.js"
import type { EntityCodec } from "#kernel/world/archive.js"
import { exportTagGrants, importTagGrants, type TagGrantData } from "#kernel/world/tag.js"
import type { SkillInstance, UnitState } from "#unit/record/index.js"

type SkillData = Omit<SkillInstance, "onStart" | "onEnd" | "onTick" | "onHit">

type UnitData = Omit<UnitState, "skills" | "tags" | "timers" | "modifiers"> & {
  readonly skills: readonly SkillData[]
  readonly tags: TagGrantData
  readonly timers: readonly (readonly [string, UnitState["timers"] extends Map<string, infer V> ? V : never])[]
  readonly modifiers: readonly (readonly [string, UnitState["modifiers"] extends Map<string, infer V> ? V : never])[]
}

const HOOKS = ["onStart", "onEnd", "onTick", "onHit"] as const

/**
 * 核心记录的编解码。技能钩子是规格里的函数，不进导出：解码时按单位 id 与技能 id 从本场规格找回。
 * 不在规格里、技能又带钩子的单位不能导出。
 */
export function unitCodec(spec: BattleSpec, registry: BattleRegistry): EntityCodec<UnitState> {
  const specs = new Map<string, UnitSpec>()
  for (const unit of [...spec.units, ...spec.spawns.map((spawn) => spawn.unit)]) specs.set(unit.id, unit)
  return {
    encode(unit) {
      const { skills, tags, timers, modifiers, ...rest } = unit
      for (const skill of skills) {
        if (specs.has(unit.id) || HOOKS.every((hook) => skill[hook] === null)) continue
        throw new Error(`skill hooks of a unit outside the battle spec cannot be exported: ${unit.id} ${skill.id}`)
      }
      const data: UnitData = {
        ...rest,
        skills: skills.map(({ onStart: _start, onEnd: _end, onTick: _tick, onHit: _hit, ...skill }) => skill),
        tags: exportTagGrants(tags),
        timers: [...timers.entries()],
        modifiers: [...modifiers.entries()],
      }
      return data
    },
    decode(raw) {
      const data = raw as UnitData
      const skillSpecs = specs.get(data.id)?.skills ?? []
      const hook = (skillId: string, name: (typeof HOOKS)[number]): SkillHook | null =>
        skillSpecs.find((skill) => skill.id === skillId)?.[name] ?? null
      return {
        ...data,
        skills: data.skills.map((skill) => ({
          ...skill,
          onStart: hook(skill.id, "onStart"),
          onEnd: hook(skill.id, "onEnd"),
          onTick: hook(skill.id, "onTick"),
          onHit: hook(skill.id, "onHit"),
        })),
        tags: importTagGrants(data.tags, (id) => registry.requireTag(id, `unit ${data.id}`)),
        timers: new Map(data.timers),
        modifiers: new Map(data.modifiers),
      }
    },
  }
}
