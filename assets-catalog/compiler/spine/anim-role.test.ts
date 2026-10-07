import { expect, test } from "vitest"
import { resolveRoles } from "#compiler/spine/anim-role.js"

test("simple Attack model", () => {
  const roles = resolveRoles(["Attack", "Default", "Die", "Idle", "Start"])
  expect(roles.idle).toBe("Idle")
  expect(roles.deploy).toBe("Start")
  expect(roles.attack).toEqual({ begin: null, loop: "Attack", end: null })
  expect(roles.die).toBe("Die")
  expect(roles.skill?.via).toBe("attack")
  expect(roles.skill?.loop).toBe("Attack")
  expect(roles.move).toBeNull()
  expect(roles.stun).toBeNull()
})

test("Attack_Start/Loop/End and a plain Skill at index 1", () => {
  const roles = resolveRoles(["Attack_End", "Attack_Loop", "Attack_Start", "Default", "Die", "Idle", "Skill", "Start"], { skillIndices: [1] })
  expect(roles.attack).toEqual({ begin: "Attack_Start", loop: "Attack_Loop", end: "Attack_End" })
  expect(roles.skill).toEqual({ begin: null, loop: "Skill", end: null, index: 1, idle: null })
})

test("Back model without Die or Skill", () => {
  const roles = resolveRoles(["Attack_End", "Attack_Loop", "Attack_Start", "Default", "Idle", "Start"])
  expect(roles.die).toBeNull()
  expect(roles.skill?.via).toBe("attack")
})

test("Combat and Combat_Down", () => {
  const roles = resolveRoles(["Attack", "Combat", "Combat_Down", "Default", "Die", "Idle", "Skill", "Start"])
  expect(roles.attack?.loop).toBe("Attack")
  expect(roles.attackDown).toEqual({ begin: null, loop: "Combat_Down", end: null, via: "combat" })
})

test("numbered skills with Begin, Idle and Loop", () => {
  const names = ["Attack", "Die", "Idle", "Skill_2", "Skill_2_Down", "Skill_3_Begin", "Skill_3_Idle", "Skill_3_Loop", "Start"]
  expect(resolveRoles(names, { skillIndices: [2] }).skill).toEqual({
    begin: "Skill_3_Begin",
    loop: "Skill_3_Loop",
    end: null,
    index: 2,
    idle: "Skill_3_Idle",
  })
  expect(resolveRoles(names, { skillIndices: [1] }).skill).toEqual({ begin: null, loop: "Skill_2", end: null, index: 1, idle: null })
  const both = resolveRoles(names, { skillIndices: [2, 1] })
  expect(both.skill?.index).toBe(2)
  expect(Object.keys(both.skills ?? {}).sort()).toEqual(["1", "2"])
})

test("SkillN without an underscore", () => {
  const roles = resolveRoles(["Attack", "Die", "Idle", "Skill2_Begin", "Skill2_End", "Skill2_Loop", "Skill3_Attack", "Start"], { skillIndices: [1] })
  expect(roles.skill).toEqual({ begin: "Skill2_Begin", loop: "Skill2_Loop", end: "Skill2_End", index: 1, idle: null })
})

test("supporter without Attack uses a skill loop", () => {
  const roles = resolveRoles(
    ["Die", "Idle", "Skill_1_Begin", "Skill_1_End", "Skill_1_Loop", "Skill_2_Begin", "Skill_2_Loop", "Start", "Stun", "Stun_Begin"],
    { skillIndices: [1] },
  )
  expect(roles.attack).toEqual({ begin: null, loop: "Skill_1_Loop", end: null, via: "skill" })
  expect(roles.skill?.loop).toBe("Skill_2_Loop")
  expect(roles.stun).toEqual({ begin: "Stun_Begin", loop: "Stun", end: null })
})

test("enemy move variants", () => {
  const slime = resolveRoles(["Attack", "Default", "Die", "Idle", "Move_Begin", "Move_End", "Move_Loop"])
  expect(slime.move).toEqual({ begin: "Move_Begin", loop: "Move_Loop", end: "Move_End" })
  const crowns = resolveRoles(["Appear", "Attack", "Die", "Disappear", "Idle", "Move"])
  expect(crowns.move).toEqual({ begin: null, loop: "Move", end: null })
  const runner = resolveRoles(["Attack", "Die", "Idle", "Run_Begin", "Run_End", "Run_Loop"])
  expect(runner.move).toEqual({ begin: "Run_Begin", loop: "Run_Loop", end: "Run_End" })
})

test("numbered attacks and Skill_01", () => {
  const roles = resolveRoles([
    "Attack_01",
    "Attack_02",
    "Die",
    "Idle",
    "Move",
    "Revive_01",
    "Skill_01",
    "Skill_01_02",
    "Skill_02_Begin",
    "Skill_02_End",
    "Skill_02_Loop",
  ])
  expect(roles.attack).toEqual({ begin: null, loop: "Attack_01", end: null, via: "attackAny" })
  expect(roles.skill?.loop).toBe("Skill_01")
  expect(roles.move?.loop).toBe("Move")
})

test("idle fallbacks, case and an empty list", () => {
  expect(resolveRoles(["Default", "Die"]).idle).toBe("Default")
  const onlyIdle = resolveRoles(["Idle"])
  expect(onlyIdle.attack).toEqual({ begin: null, loop: "Idle", end: null, via: "idle" })
  expect(onlyIdle.deploy).toBe("Idle")
  const lower = resolveRoles(["idle", "attack", "die"])
  expect(lower.idle).toBe("idle")
  expect(lower.attack?.loop).toBe("attack")
  const empty = resolveRoles([])
  expect(empty.idle).toBeNull()
  expect(empty.attack).toBeNull()
  expect(empty.skill).toBeNull()
  expect(resolveRoles(null as unknown as readonly string[]).idle).toBeNull()
})

test("Attack_Begin plus numbered attacks", () => {
  const names = ["Attack_A", "Attack_B", "Attack_Begin", "Attack_C", "Attack_End", "Default", "Die", "Idle", "Skill_1_A", "Skill_2", "Start"]
  expect(resolveRoles(names).attack).toEqual({ begin: "Attack_Begin", loop: "Attack_A", end: "Attack_End", via: "attackAny" })
  expect(resolveRoles(["Attack_Begin", "Attack_End", "Idle"]).attack).toEqual({ begin: null, loop: "Attack_Begin", end: "Attack_End" })
})

test("animated idle is preferred over a 0 s pose when durations are known", () => {
  const names = ["Attack", "Default", "Die", "Idle_A", "Idle_B", "Move", "Skill"]
  expect(resolveRoles(names).idle).toBe("Idle_A")
  expect(resolveRoles(names, { durations: { Idle_A: 0, Idle_B: 2.667 } }).idle).toBe("Idle_B")
  expect(resolveRoles(["Idle", "Idle_B", "Start"], { durations: { Idle: 0, Idle_B: 1 } }).idle).toBe("Idle")
  expect(resolveRoles(["Idle_A", "Idle_B"], { durations: { Idle_A: 0, Idle_B: 0 } }).idle).toBe("Idle_A")
})

test("Move_Start, Move and Move_End", () => {
  const roles = resolveRoles(["Attack", "Default", "Die", "Idle", "Move", "Move_End", "Move_Start"])
  expect(roles.move).toEqual({ begin: "Move_Start", loop: "Move", end: "Move_End" })
})

test("directional skill clips", () => {
  const excuFront = [
    "Attack",
    "Default",
    "Die",
    "Idle",
    "Skill_Down_Begin",
    "Skill_Down_End",
    "Skill_Down_Loop",
    "Skill_Right_Begin",
    "Skill_Right_End",
    "Skill_Right_Loop",
    "Start",
  ]
  expect(resolveRoles(excuFront, { skillIndices: [1] }).skill).toEqual({
    begin: "Skill_Right_Begin",
    loop: "Skill_Right_Loop",
    end: "Skill_Right_End",
    index: 1,
    idle: null,
  })
  const excuBack = ["Attack", "Default", "Idle", "Skill_Right_Begin", "Skill_Right_End", "Skill_Right_Loop", "Skill_Up_Begin", "Skill_Up_End", "Skill_Up_Loop", "Start"]
  expect(resolveRoles(excuBack, { skillIndices: [1] }).skill?.loop).toBe("Skill_Right_Loop")
  const ashlokBack = ["Attack01", "Attack02", "Default", "Idle", "Skill_Idle_Up", "Skill_Loop_Up", "Start"]
  expect(resolveRoles(ashlokBack).skill).toEqual({ begin: null, loop: "Skill_Loop_Up", end: null, index: 0, idle: "Skill_Idle_Up" })
  expect(resolveRoles(["Attack", "Idle", "Skill_Loop", "Skill_Right_Loop"]).skill?.loop).toBe("Skill_Loop")
  expect(resolveRoles(["Attack", "Idle", "Skill_Down_Loop"]).skill?.via).toBe("attack")
})
