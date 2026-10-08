import { createBattle, TICK, type BattleSpec, type MissionModule, type SkillSpec, type TileSpec, type UnitSpec } from "arknights-mission-core"
import { getChess, getStage } from "#server/entry/packet.js"
import { contentModules } from "#server/content/loader.js"
import { battleFacade } from "#server/content/support/battle-facade.js"
import { noteBlocked } from "#server/content/support/blocked.js"

const HIGH = new Set(["A", "I", "a", "h", "H"])
const WALL = new Set(["#", "X"])

export const ALL_HOOKS: readonly string[] = Object.freeze([
  "battleStart", "deploy", "tick", "beforeAttack", "attack", "hit", "damaged", "heal", "kill", "death",
  "skillStart", "skillEnd", "statusApplied", "blocked", "enemySpawn", "enemyLeak", "battleEnd", "fatal", "elementBurst",
])

export function flatStage(opts: { id?: string; rows?: Record<string, string>; crates?: number[][] } = {}): { id: string; rows: string[] } {
  const rows = [
    "aaaaaaaaaa#aaaaaaaaaa",
    "###IAAAAA###AAAAAI###",
    "##ErrrrrrrOrrrrrrrE##",
    "##hrrrrrrrfrrrrrrrh##",
    "##hrrrrrrrfrrrrrrrh##",
    "##hrrrrrrrOrrrrrrrh##",
    "XXXXXXXXXXXXXXXXXXXXX",
    "aaaaaaaaaa###########",
    "####AAAAA##I#########",
    "##ErrrrrrrSrrrrrrrS##",
    "##hrrrrrrrfrrrrrrrf##",
    "##hrrrrrrrfrrrrrrrf##",
    "##hrrrrrrrSrrrrrrrS##",
    "XXXXXXXXXXXXXXXXXXXXX",
  ]
  const full = Array.from({ length: 19 }, (_unused, index) => rows[index] ?? "#".repeat(21))
  for (const [key, value] of Object.entries(opts.rows ?? {})) full[Number(key)] = value
  return { id: opts.id ?? "flat", rows: full }
}

export function chessRec(source: Record<string, any> = {}): Record<string, any> {
  const id = source.id ?? source.chessId ?? "test_chess_a"
  const profession = source.profession ?? "WARRIOR"
  const stats = {
    maxHp: 2000, atk: 500, def: 200, res: 0, cost: 10, blockCnt: 2, bat: 1, aspd: 100, respawnTime: 20,
    spRecovery: 1, hpRecoveryPerSec: 0, moveSpeed: 1, tauntLevel: 0, massLevel: 0, ...(source.stats ?? {}),
  }
  return {
    chessId: id, baseId: source.baseId ?? id, isGolden: !!source.golden, tier: source.tier ?? 1, name: source.name ?? id,
    charId: source.charId ?? id, profession, position: source.position ?? (["SNIPER", "CASTER", "MEDIC", "SUPPORT"].includes(profession) ? "RANGED" : "MELEE"),
    bonds: source.bonds ?? [], stats, rangeGrid: source.rangeGrid ?? [[0, 0], [0, 1]],
    skill: source.skill === null ? null : {
      skillId: "sk_test", name: "test skill", skillType: "MANUAL", durationType: "NONE", duration: 10,
      spType: "INCREASE_WITH_TIME", spCost: 10, initSp: 0, maxChargeTime: 1, bb: {}, trigger: { rule: "DEFAULT" }, index: 1,
      ...(source.skill ?? {}),
    },
  }
}

export function enemyRec(source: Record<string, any> = {}): Record<string, any> {
  const key = source.key ?? "enemy_test"
  return {
    key, name: source.name ?? key, rank: source.rank ?? "NORMAL",
    stats: {
      maxHp: source.hp ?? 5000, atk: source.atk ?? 0, def: source.def ?? 0, res: source.res ?? 0,
      moveSpeed: source.speed ?? 1, aspd: source.aspd ?? 100, blockCnt: source.blockCnt ?? 1,
    },
    ...(source.range !== undefined ? { range: source.range } : {}),
  }
}

function tileChar(stage: { rows?: string[] } | null, row: number, col: number): string {
  const line = stage?.rows?.[row]
  return line?.[col] ?? "r"
}

function tilesOf(stage: { rows?: string[] } | null): TileSpec[] {
  const tiles: TileSpec[] = []
  for (let row = 0; row < 19; row += 1) {
    for (let col = 0; col < 21; col += 1) {
      const char = tileChar(stage, row, col)
      if (WALL.has(char)) continue
      tiles.push({
        x: col,
        y: row,
        height: HIGH.has(char) ? 1 : 0,
        deployable: true,
        walkableBy: ["ground", "fly"],
      })
    }
  }
  if (tiles.length === 0) tiles.push({ x: 0, y: 0, height: 0, deployable: true, walkableBy: ["ground"] })
  return tiles
}

function skillOf(record: Record<string, any> | null): SkillSpec[] {
  const skill = record?.skill
  if (!skill || typeof skill !== "object") return []
  const duration = Number(skill.duration) || 0
  const passive = skill.skillType === "PASSIVE" || !(Number(skill.spCost) > 0)
  const durationType = String(skill.durationType ?? "")
  const ammo = Number(skill.bb?.["attack@trigger_time"] ?? skill.ammo) || 0
  const body = passive
    ? "passive"
    : durationType === "AMMO"
      ? "ammo"
      : durationType === "TOGGLE"
        ? "toggle"
        : duration > 0
          ? "duration"
          : "instant"
  const rule = String(skill.trigger?.rule ?? "DEFAULT")
  const known = new Set(["DEFAULT", "SKILL_RANGE", "TAKE_DAMAGE", "SP_FULL", "CUSTOM_RANGE", "SEARCH", "GDGLOW_SKILL_2", "NEVER"])
  const trigger = rule === "ALWAYS" ? "SP_FULL" : rule === "MANUAL" ? "NEVER" : known.has(rule) ? rule : "DEFAULT"
  const spType = skill.spType === "INCREASE_WHEN_ATTACK" ? "attack" : skill.spType === "INCREASE_WHEN_TAKEN_DAMAGE" ? "hurt" : "time"
  return [{
    id: String(skill.skillId ?? "skill"),
    body,
    trigger,
    spCost: Number(skill.spCost) || 0,
    duration: Math.max(0, duration),
    ammo: body === "ammo" ? Math.max(1, ammo) : Math.max(0, ammo),
    spType,
    initSp: Number(skill.initSp) || 0,
    charges: Number(skill.maxChargeTime) || 1,
    operation: skill.skillType === "AUTO" ? "AUTO" : "MANUAL",
  }]
}

function attackRangeOf(record: Record<string, any>): { x: number; y: number }[] {
  const grid = record.rangeGrid
  if (!Array.isArray(grid) || grid.length === 0) return [{ x: 1, y: 0 }]
  const cells: { x: number; y: number }[] = []
  for (const cell of grid) {
    if (!Array.isArray(cell) || cell.length < 2) continue
    const y = Number(cell[0])
    const x = Number(cell[1])
    if (Number.isFinite(x) && Number.isFinite(y)) cells.push({ x, y })
  }
  return cells.length > 0 ? cells : [{ x: 1, y: 0 }]
}

function unitFrom(id: string, record: Record<string, any>, row: number, col: number, kind: string, _items: string[], ownerId: string, stage: { rows?: string[] } | null): UnitSpec {
  const stats = record.stats ?? {}
  const maxHp = Number(stats.maxHp ?? stats.hp ?? 1) || 1
  const char = tileChar(stage, row, col)
  return {
    id,
    side: kind === "enemy" ? "enemy" : "ally",
    attributes: {
      hp: maxHp,
      maxHp,
      atk: Number(stats.atk) || 0,
      def: Number(stats.def) || 0,
      res: Number(stats.res) || 0,
      aspd: Number(stats.aspd) || 100,
      bat: Number(stats.bat) || 1,
      block: Number(stats.blockCnt) || 0,
      moveSpeed: Number(stats.moveSpeed) || 1,
      spRecovery: Number(stats.spRecovery) || 0,
      taunt: Number(stats.tauntLevel) || 0,
    },
    skills: skillOf(record),
    attackRange: attackRangeOf(record),
    tags: [kind],
    deployPositions: record.position === "RANGED" ? ["high", "ground"] : ["ground", "high"],
    x: col,
    y: row,
    facing: "RIGHT",
    motion: "WALK",
    script: {
      kind,
      chessId: String(record.chessId ?? record.key ?? id),
      ownerId,
      position: String(record.position ?? "MELEE"),
      ground: !HIGH.has(char),
      skillId: String(record.skill?.skillId ?? "skill"),
      spCost: Number(record.skill?.spCost) || 0,
      ...(record.range !== undefined && Number.isFinite(Number(record.range)) ? { attackReach: Number(record.range) } : {}),
    },
  }
}

export function checkInvariants(battle: any): boolean {
  const units = battle?.units ?? []
  for (const unit of units) {
    for (const key of ["x", "y", "hp"]) {
      const value = unit[key]
      if (typeof value !== "number" || Number.isNaN(value)) throw new Error(`invariant: ${key}=${value}`)
    }
    const maxHp = unit.s?.maxHp
    if (unit.alive && typeof maxHp === "number" && (unit.hp < 0 || unit.hp > maxHp + 1e-6)) {
      throw new Error(`invariant: hp ${unit.hp} / ${maxHp}`)
    }
  }
  return true
}

export function hashOf(value: unknown): string {
  const text = JSON.stringify(value)
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16)
}

export function makeBattle(opts: Record<string, any> = {}): any {
  const stage = opts.stage ?? (opts.stageId && opts.stageId !== "flat" ? getStage(opts.stageId) : flatStage(opts.flat ?? {}))
  const roster: Record<string, unknown> = {}
  const units: UnitSpec[] = []
  const defs = opts.defs ?? {}
  let seq = 1
  for (const entry of opts.units ?? []) {
    const chessId = entry.chessId ?? entry.id
    const record = defs.chess?.[chessId] ?? getChess(chessId) ?? chessRec({ id: chessId })
    const id = String(entry.uid ?? chessId ?? `u${seq}`)
    const row = entry.row ?? 10
    const col = entry.col ?? 4
    units.push(unitFrom(id, record, row, col, entry.kind === "token" ? "token" : "op", entry.items ?? [], "p1", stage))
    roster[id] = { def: record, items: entry.items ?? [] }
    seq += 1
  }
  for (const entry of opts.enemies ?? []) {
    const key = entry.key
    const record = defs.enemies?.[key] ?? enemyRec({ key, ...(entry.stats ?? {}) })
    const id = `${key}#${seq}`
    const pos = entry.pos ?? [9, 10]
    units.push(unitFrom(id, { ...record, chessId: key, key }, pos[0], pos[1], "enemy", [], "p1", stage))
    roster[id] = { def: record, items: [] }
    seq += 1
  }
  const players = [{
    playerId: "p1",
    seat: 0,
    bandId: opts.bandId ?? null,
    bonds: opts.bonds ?? {},
    dp: 10,
    input: { contentInfo: opts.contentInfo ?? {} },
  }]
  const battleModules = contentModules()
  const spec: BattleSpec = {
    seed: opts.seed ?? 1,
    modules: ["content:harness", ...battleModules.map((module) => module.id)],
    tiles: tilesOf(stage),
    units,
    spawns: [],
    deployStrategy: null,
    cost: {
      ally: { initial: 10, regen: 1, cap: 99 },
      enemy: { initial: 0, regen: 0, cap: 0 },
    },
    notes: {
      players,
      roster,
      stage,
      flags: { layerGainsEnabled: opts.kind !== "boss" && opts.kind !== "hidden", dpMax: 99, startOpCooldown: 0, ...(opts.flags ?? {}) },
    },
  }
  let facade: any = null
  const capture: MissionModule = {
    id: "content:harness",
    install(ctx) {
      facade = battleFacade(ctx as never)
      ctx.registerSystem({
        id: "content-harness-attack",
        slot: "schedule",
        priority: 50,
        run(live) {
          for (const id of live.units()) {
            if (!live.timerView(id, "attack").started) live.startTimer(id, "attack")
          }
        },
      })
    },
  }
  const engine = createBattle(spec, [capture, ...battleModules])
  if (!facade) facade = { allyUnits: [], enemies: [], units: [], players, flags: spec.notes?.flags, time: 0, step() {} }
  const hooks: Record<string, any[]> = {}
  for (const name of opts.hooks ?? ALL_HOOKS) hooks[name] = []
  for (const name of Object.keys(hooks)) {
    facade.on(name, (payload: unknown) => { hooks[name]?.push(payload) })
  }
  const step = (count = 1) => {
    for (let index = 0; index < count; index += 1) engine.step()
  }
  const harness = {
    battle: engine,
    b: facade,
    hooks,
    step(count = 1) { step(count); return harness },
    run(seconds: number) { step(Math.max(1, Math.round(seconds / TICK))); return harness },
    runUntil(pred: ((battle: any) => boolean) | number, maxSeconds = 300) {
      if (typeof pred === "number") { harness.run(pred); return true }
      const limit = facade.time + maxSeconds
      while (facade.time < limit) {
        if (pred(facade)) return true
        step(1)
      }
      return !!pred(facade)
    },
    runToEnd(maxSeconds = 30) { return harness.runUntil(maxSeconds) },
    unit(query: unknown) {
      return facade.allyUnits.find((unit: any) => unit.uid === query || unit.defId === query || unit.id === query || unit.def?.baseId === query) ?? null
    },
    allies() { return facade.allyUnits.filter((unit: any) => unit.alive && unit.deployed) },
    enemies() { return facade.enemies },
    enemy(key: string) { return facade.enemies.find((unit: any) => unit.defId === key) ?? null },
    hooksOf(name: string) { return hooks[name] ?? [] },
    eventsOf(kind: string) { return engine.drainEvents().filter((event) => event.type === kind) },
    result() { return facade.result?.() ?? engine.result() },
    snapshot() { return engine.snapshot() },
    invariants() { return checkInvariants(facade) },
  }
  noteBlocked("harness.facade-hooks")
  return harness
}
