import type { BattleSpec, UnitSpec } from "arknights-mission-core"

export function spec(patch: Partial<BattleSpec> = {}): BattleSpec {
  return {
    seed: patch.seed ?? 1,
    modules: patch.modules ?? [],
    tiles: patch.tiles ?? [{ x: 0, y: 0, height: 0, deployable: true, walkableBy: ["ground"] }],
    units: patch.units ?? [],
    spawns: patch.spawns ?? [],
    deployStrategy: patch.deployStrategy ?? null,
    cost: patch.cost ?? {
      ally: { initial: 0, regen: 0, cap: 0 },
      enemy: { initial: 0, regen: 0, cap: 0 },
    },
  }
}

export function ally(id: string, patch: Partial<UnitSpec> = {}): UnitSpec {
  return {
    id,
    side: patch.side ?? "ally",
    attributes: patch.attributes ?? { hp: 100, atk: 10, def: 0 },
    skills: patch.skills ?? [],
    attackRange: patch.attackRange ?? [{ x: 1, y: 0 }],
    tags: patch.tags ?? [],
    deployPositions: patch.deployPositions ?? ["ground"],
    x: patch.x ?? 0,
    y: patch.y ?? 0,
    facing: patch.facing ?? "RIGHT",
    hitArea: patch.hitArea ?? null,
    motion: patch.motion ?? "WALK",
    route: patch.route ?? null,
    ...(patch.attackClip ? { attackClip: patch.attackClip } : {}),
    ...(patch.attackShape ? { attackShape: patch.attackShape } : {}),
    ...(patch.targetPriority ? { targetPriority: patch.targetPriority } : {}),
    ...(patch.blocking ? { blocking: patch.blocking } : {}),
    ...(patch.blockedBy ? { blockedBy: patch.blockedBy } : {}),
    ...(patch.aggroSeq !== undefined ? { aggroSeq: patch.aggroSeq } : {}),
    ...(patch.hitLimit === true ? { hitLimit: true } : {}),
    ...(patch.immunity ? { immunity: patch.immunity } : {}),
    ...(patch.timers ? { timers: patch.timers } : {}),
  }
}
