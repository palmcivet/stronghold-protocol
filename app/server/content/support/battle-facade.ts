import {
  TICK,
  defineResource,
  defineTag,
  type AttributeModifier,
  type BattleEvent,
  type ContentContext,
  type ModifierOp,
  type TagKey,
} from "arknights-mission-core"
import { getChess, getToken } from "#server/entry/packet.js"
import { noteBlocked } from "#server/content/support/blocked.js"
import { bodyInKeys } from "#server/content/support/body.js"
import { COLS } from "#server/content/support/constants.js"

export { blockedBehaviors, noteBlocked } from "#server/content/support/blocked.js"

const EVENT_MAP: Readonly<Record<string, string>> = {
  hit: "hit",
  damaged: "damaged",
  heal: "heal",
  deploy: "deploy",
  fatal: "fatal",
  death: "downed",
  downed: "downed",
  kill: "fatal",
  blocked: "blocked",
  enemyLeak: "leak",
  leak: "leak",
  elementBurst: "elementBurst",
  skillStart: "skill-start",
  skillEnd: "skill-end",
  ammoUsed: "ammo-used",
  attack: "attack",
  beforeAttack: "attack",
  statusApplied: "status",
  enemySpawn: "spawn",
  spawn: "spawn",
  displace: "displace",
}

const MOD_KEYS: Readonly<Record<string, readonly [string, ModifierOp]>> = {
  atkPct: ["atk", "percent"],
  defPct: ["def", "percent"],
  hpPct: ["maxHp", "percent"],
  atkMul: ["atk", "mul"],
  defMul: ["def", "mul"],
  hpMul: ["maxHp", "mul"],
  aspd: ["aspd", "add"],
  resFlat: ["res", "add"],
  resMul: ["res", "mul"],
  dmgDealtMul: ["dmgDealt", "mul"],
  dmgTakenMul: ["dmgTaken", "mul"],
  blockCnt: ["block", "add"],
  atk: ["atk", "add"],
  def: ["def", "add"],
  res: ["res", "add"],
  maxHp: ["maxHp", "add"],
  taunt: ["taunt", "add"],
  batPct: ["batPct", "add"],
  redeployMul: ["redeployMul", "mul"],
  spRecoveryFlat: ["spRecovery", "add"],
  defIgnorePct: ["defIgnorePct", "add"],
  resIgnorePct: ["resIgnorePct", "add"],
  defIgnoreFlat: ["defIgnoreFlat", "add"],
  resIgnoreFlat: ["resIgnoreFlat", "add"],
}

interface Hook {
  type: string
  priority: number
  owner: unknown
  fn: (ctx: unknown) => void
}

function kindOf(viewTags: readonly string[], script: Readonly<Record<string, string | number | boolean>>): string {
  if (typeof script.kind === "string") return script.kind
  if (viewTags.includes("device")) return "device"
  if (viewTags.includes("token")) return "token"
  if (viewTags.includes("enemy")) return "enemy"
  return "op"
}

function modifiersOf(mods: Record<string, number> | null | undefined): AttributeModifier[] {
  const out: AttributeModifier[] = []
  for (const [key, value] of Object.entries(mods ?? {})) {
    if (typeof value !== "number" || !Number.isFinite(value)) continue
    const mapped = MOD_KEYS[key]
    if (!mapped) {
      noteBlocked(`buff.${key}`)
      out.push({ attribute: key, op: "add", value })
      continue
    }
    out.push({ attribute: mapped[0], op: mapped[1], value })
  }
  return out
}

function damageKind(type: unknown): string {
  if (type === "phys") return "physical"
  if (type === "arts" || type === "true" || type === "heal" || type === "element") return String(type)
  if (typeof type === "string" && type.length > 0) return type
  return "physical"
}

/** One facade per battle, shared by every content package, plus the battle-wide records it keeps. */
interface FacadeStore {
  facade?: object
  layerGains?: Record<string, Record<string, number>>
  endReason?: string
}

const FACADE = defineResource<FacadeStore>("content:facade", () => ({}))

/** Tags the match layer writes into unit specs. */
const MATCH_TAGS: readonly TagKey[] = [
  defineTag("op", { meaning: "operator placed by a player" }),
  defineTag("enemy", { meaning: "enemy from a wave" }),
  defineTag("boss", { meaning: "boss enemy" }),
]

export function battleFacade(ctx: ContentContext): any {
  const shared = ctx.resource(FACADE).ensure()
  const existing = shared.facade
  if (existing) return existing
  for (const key of MATCH_TAGS) ctx.registerTag(key)
  const facade = createFacade(ctx, shared)
  shared.facade = facade
  return facade
}

function createFacade(ctx: ContentContext, shared: FacadeStore) {
  const buffs = new Map<string, Map<string, { key: string; mods: Record<string, number>; started: number; duration?: number }>>()

  function buffOf(unitId: string, key: string): { key: string; mods: Record<string, number>; timeLeft: number; duration?: number } | null {
    const record = buffs.get(unitId)?.get(key)
    if (!record || !ctx.hasModifier(unitId, key)) return null
    const elapsed = ctx.tick() * TICK - record.started
    const timeLeft = record.duration === undefined ? Number.POSITIVE_INFINITY : Math.max(0, record.duration - elapsed)
    return { key: record.key, mods: record.mods, timeLeft, ...(record.duration !== undefined ? { duration: record.duration } : {}) }
  }

  const hooks: Hook[] = []
  const subscribed = new Set<string>()
  const proxies = new Map<string, Record<string, unknown>>()
  let clock = false

  const field = (): Record<string, unknown> => {
    const notes = ctx.field()
    return notes && typeof notes === "object" ? notes as Record<string, unknown> : {}
  }

  const rosterOf = (id: string): Record<string, unknown> => {
    const roster = field().roster
    if (!roster || typeof roster !== "object") return {}
    const entry = (roster as Record<string, unknown>)[id]
    return entry && typeof entry === "object" ? entry as Record<string, unknown> : {}
  }

  const unitProxy = (id: string): Record<string, unknown> | null => {
    if (!id || !ctx.unit(id)) return null
    const cached = proxies.get(id)
    if (cached) return cached
    const proxy = buildUnit(id)
    proxies.set(id, proxy)
    return proxy
  }

  const buildUnit = (id: string): Record<string, unknown> => {
    const roster = rosterOf(id)
    const self: Record<string, unknown> = {}
    const read = () => ctx.unit(id)
    const script = () => ctx.script(id)
    const props = {
      id,
      get x() { return read()?.x ?? 0 },
      get y() { return read()?.y ?? 0 },
      get hp() { return read()?.hp ?? 0 },
      set hp(value: number) { noteBlocked(`unit.hp=${value}`) },
      get side() { return read()?.side === "enemy" ? "enemy" : "ally" },
      get alive() { return read()?.alive === true },
      get deployed() { return read()?.fielded === true },
      get downed() { return read()?.downed === true },
      get dir() { return read()?.facing ?? "RIGHT" },
      get tileR() { return Math.round(read()?.y ?? 0) },
      get tileC() { return Math.round(read()?.x ?? 0) },
      get kind() { return kindOf(read()?.tags ?? [], script()) },
      get hidden() { return read()?.flags.includes("stealth") === true || script().hidden === true },
      get ground() { return script().ground === true || script().position === "MELEE" && script().tileGround !== false },
      get ownerId() { return typeof script().ownerId === "string" ? script().ownerId : "p1" },
      get defId() { return typeof script().chessId === "string" ? script().chessId : id },
      get def() {
        const chessId = script().chessId
        return roster.def ?? getChess(typeof chessId === "string" ? chessId : "") ?? { id, position: script().position }
      },
      get items() { return Array.isArray(roster.items) ? roster.items : [] },
      get hitArea() { return null },
      get s() {
        const view = read()
        const bat = ctx.attribute(id, "bat")
        const aspd = ctx.attribute(id, "aspd") || 100
        const batPct = ctx.attribute(id, "batPct")
        return {
          maxHp: view?.maxHp ?? 0,
          atk: ctx.attribute(id, "atk"),
          def: ctx.attribute(id, "def"),
          res: ctx.attribute(id, "res"),
          aspd,
          bat,
          taunt: ctx.attribute(id, "taunt"),
          interval: bat > 0 ? (bat * Math.max(0.1, 1 + batPct) * 100) / aspd : 1,
          moveSpeed: ctx.attribute(id, "moveSpeed") || 1,
          blockCnt: ctx.attribute(id, "block") || 1,
          flags: {},
        }
      },
      get base() {
        const stats = (self.def as { stats?: Record<string, number> } | undefined)?.stats ?? {}
        return {
          maxHp: Number(stats.maxHp) || 0,
          atk: Number(stats.atk) || 0,
          def: Number(stats.def) || 0,
          res: Number(stats.res) || 0,
          aspd: Number(stats.aspd) || 100,
          bat: Number(stats.bat) || 1,
          blockCnt: Number(stats.blockCnt) || 0,
        }
      },
      get skill() {
        const rawSkill = script().skillId
        const skillId = typeof rawSkill === "string" && rawSkill.length > 0 ? rawSkill : "skill"
        const view = ctx.timerView(id, "skill-point")
        const existing = self._skill as Record<string, unknown> | undefined
        const skill = existing ?? {
          id: skillId,
          kind: "duration",
          ammo: 0,
          mem: {},
          addAmmo(amount: number) {
            skill.ammo = Number(skill.ammo) + (Number(amount) || 0)
          },
          gainSp: (amount: number) => ctx.gainSp(id, skillId, amount),
          activate: (_reason?: unknown, opts?: { free?: boolean }) => {
            if (opts?.free) ctx.readySkill(id, skillId)
            return ctx.castSkill(id, skillId)
          },
          end: () => noteBlocked("unit.skill.end"),
        }
        self._skill = skill
        skill.sp = typeof view.sp === "number" ? view.sp : 0
        skill.active = view.active === true || view.active === 1
        skill.isTimed = view.phase === "active"
        skill.noSkill = script().skillId == null
        skill.spCost = typeof script().spCost === "number" ? script().spCost : 0
        skill.charges = typeof view.charges === "number" ? view.charges : 0
        skill.maxCharges = 1
        return skill
      },
      mem: {},
      deploySeq: 0,
      deployedAt: 0,
      findBuff: (key: string) => buffOf(id, key),
      addBuff: (buff: { key?: string; mods?: Record<string, number>; duration?: number }) => facade.addBuff(self, buff),
      get ownerUnit() {
        const owner = script().ownerUnitId
        return typeof owner === "string" ? unitProxy(owner) : null
      },
      get blocking() { return [] as unknown[] },
      get blockedBy() { return null },
    }
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(props))) {
      Object.defineProperty(self, key, descriptor)
    }
    return self
  }

  const allies = (): Record<string, unknown>[] => {
    const out: Record<string, unknown>[] = []
    for (const id of ctx.units("ally")) {
      const unit = unitProxy(id)
      if (unit) out.push(unit)
    }
    return out
  }

  const enemies = (): Record<string, unknown>[] => {
    const out: Record<string, unknown>[] = []
    for (const id of ctx.units("enemy")) {
      const unit = unitProxy(id)
      if (unit) out.push(unit)
    }
    return out
  }

  const players = (): Record<string, unknown>[] => {
    const list = field().players
    return Array.isArray(list) ? list as Record<string, unknown>[] : []
  }

  function dispatch(type: string, payload: unknown): void {
    const list = hooks.filter((hook) => hook.type === type).sort((a, b) => a.priority - b.priority)
    for (const hook of list) {
      if (hook.owner && payload && typeof payload === "object") {
        const record = payload as { source?: unknown; target?: unknown; unit?: unknown }
        const owner = hook.owner
        if (record.source !== owner && record.target !== owner && record.unit !== owner) continue
      }
      try { hook.fn(payload) } catch (cause) {
        noteBlocked(`hook:${type}:${cause instanceof Error ? cause.message : String(cause)}`)
      }
    }
  }

  function facadeEvent(type: string, event: BattleEvent): Record<string, unknown> {
    const data = event.data
    const source = typeof data.sourceId === "string" ? unitProxy(data.sourceId) : null
    const targetId = typeof data.targetId === "string" ? data.targetId : typeof data.unitId === "string" ? data.unitId : ""
    const target = targetId ? unitProxy(targetId) : null
    const amount = typeof data.amount === "number" ? data.amount : 0
    const kind = typeof data.kind === "string" ? data.kind : "physical"
    const dmg = {
      amount,
      type: kind === "physical" ? "phys" : kind,
      isAttack: type === "hit" || type === "attack" || type === "beforeAttack" || data.attack === true,
      isSplash: false,
      tags: [] as string[],
      noSp: false,
      cancel: data.cancel === true,
    }
    return {
      source, target, unit: target, amount, type: dmg.type, dmg,
      skill: target && typeof target.skill === "object" ? target.skill : null,
      left: typeof data.left === "number" ? data.left : undefined,
      t: ctx.tick() * TICK,
      setAmount(value: number) { ctx.revise(event, { amount: value }) },
    }
  }

  function ensureMapped(eventType: string): void {
    const mapped = EVENT_MAP[eventType]
    if (!mapped || subscribed.has(mapped)) return
    subscribed.add(mapped)
    ctx.subscribe(mapped, (event) => {
      for (const hook of hooks.filter((item) => EVENT_MAP[item.type] === mapped).sort((a, b) => a.priority - b.priority)) {
        const payload = facadeEvent(hook.type, event)
        if (hook.owner && payload.source !== hook.owner && payload.target !== hook.owner && payload.unit !== hook.owner) continue
        try { hook.fn(payload) } catch (cause) {
          noteBlocked(`hook:${hook.type}:${cause instanceof Error ? cause.message : String(cause)}`)
        }
      }
    })
  }

  function ensureClock(): void {
    if (clock) return
    clock = true
    ctx.registerSystem({
      id: "content-facade-clock",
      slot: "schedule",
      priority: 80,
      run(live) {
        if (live.tick() === 0) dispatch("battleStart", { battle: facade })
        dispatch("tick", { dt: TICK, battle: facade })
      },
    })
  }

  const facade = {
    __facade: true,
    started: true,
    errors: [] as unknown[],
    opts: {},
    flags: (field().flags as Record<string, unknown> | undefined) ?? { layerGainsEnabled: true, dpMax: 99, startOpCooldown: 0 },
    get time() { return ctx.tick() * TICK },
    get dt() { return TICK },
    get rng() { return ctx.random },
    get finished() { return false },
    get allyUnits() { return allies() },
    get enemies() { return enemies().filter((unit) => unit.alive === true) },
    get units() { return [...allies(), ...enemies()] },
    get players() { return players() },
    get rect() { return { r0: 0, c0: 0, r1: 18, c1: 20 } },
    get projectiles() { return { list: ctx.projectiles().map((shot) => ({ x: shot.x, y: shot.y, tx: shot.x, ty: shot.y })) } },
    data: { getChess, getToken },
    getPlayer(pid: unknown) {
      return players().find((player) => player.playerId === pid) ?? null
    },
    unitById(id: unknown) { return typeof id === "string" ? unitProxy(id) : null },
    unitAt(row: number, col: number) {
      return allies().find((unit) => unit.tileR === row && unit.tileC === col) ?? null
    },
    on(type: string, fn: (payload: unknown) => void, opts: { priority?: number; owner?: unknown } = {}) {
      if (type === "tick" || type === "battleStart") ensureClock()
      else if (EVENT_MAP[type]) ensureMapped(type)
      else noteBlocked(`battle.on:${type}`)
      const hook: Hook = { type, priority: opts.priority ?? 0, owner: opts.owner ?? null, fn }
      hooks.push(hook)
      return () => {
        const index = hooks.indexOf(hook)
        if (index >= 0) hooks.splice(index, 1)
      }
    },
    off(stop: unknown) { if (typeof stop === "function") stop() },
    every(seconds: number, fn: () => void) {
      ensureClock()
      let elapsed = 0
      return facade.on("tick", () => {
        elapsed += TICK
        if (elapsed + 1e-9 < seconds) return
        elapsed = 0
        fn()
      })
    },
    after(seconds: number, fn: () => void) {
      const due = ctx.tick() + Math.max(1, Math.round(seconds / TICK))
      ctx.schedule(due, () => fn())
    },
    dealDamage(source: { id?: string } | null, target: { id?: string } | null, dmg: { amount?: number; type?: string; defIgnorePct?: number; defIgnoreFlat?: number; resIgnorePct?: number; resIgnoreFlat?: number; mul?: number; sourceless?: boolean; ignoreSleep?: boolean; ignoreSelect?: boolean; canDodge?: boolean; element?: string } = {}) {
      if (!target?.id) return 0
      ctx.dealDamage({
        sourceId: source?.id ?? "",
        targetId: target.id,
        amount: dmg.amount ?? 0,
        kind: damageKind(dmg.type),
        ...(dmg.defIgnorePct !== undefined ? { defIgnorePct: dmg.defIgnorePct } : {}),
        ...(dmg.defIgnoreFlat !== undefined ? { defIgnoreFlat: dmg.defIgnoreFlat } : {}),
        ...(dmg.resIgnorePct !== undefined ? { resIgnorePct: dmg.resIgnorePct } : {}),
        ...(dmg.resIgnoreFlat !== undefined ? { resIgnoreFlat: dmg.resIgnoreFlat } : {}),
        ...(dmg.mul !== undefined ? { mul: dmg.mul } : {}),
        ...(dmg.sourceless ? { sourceless: true } : {}),
        ...(dmg.ignoreSleep ? { ignoreSleep: true } : {}),
        ...(dmg.ignoreSelect ? { ignoreSelect: true } : {}),
        ...(dmg.canDodge !== undefined ? { canDodge: dmg.canDodge } : {}),
        ...(dmg.element ? { element: dmg.element } : {}),
      })
      return dmg.amount ?? 0
    },
    heal(source: { id?: string } | null, target: { id?: string } | null, amount: number) {
      if (!target?.id) return 0
      ctx.heal(target.id, amount, source?.id ? { sourceId: source.id } : {})
      return amount
    },
    loseHp(target: { id?: string } | null, amount: number) {
      if (!target?.id) return
      ctx.loseHp(target.id, amount)
    },
    applyStatus(target: { id?: string } | null, statusId: string, opts: { duration?: number; value?: number } = {}) {
      if (!target?.id) return
      try {
        ctx.applyStatus(target.id, statusId, {
          ...(opts.duration !== undefined ? { duration: opts.duration } : {}),
          ...(opts.value !== undefined ? { value: opts.value } : {}),
        })
      } catch (cause) {
        noteBlocked(`status.${statusId}:${cause instanceof Error ? cause.message : "failed"}`)
      }
    },
    removeStatus(target: { id?: string } | null, key: string) {
      if (target?.id) ctx.clearModifier(target.id, key)
    },
    addBuff(unit: { id?: string } | null, buff: { key?: string; mods?: Record<string, number>; duration?: number }) {
      if (!unit?.id || !buff?.key) return null
      ctx.setModifier(unit.id, buff.key, modifiersOf(buff.mods), buff.duration)
      let table = buffs.get(unit.id)
      if (!table) {
        table = new Map()
        buffs.set(unit.id, table)
      }
      table.set(buff.key, { key: buff.key, mods: buff.mods ?? {}, started: ctx.tick() * TICK, ...(buff.duration !== undefined ? { duration: buff.duration } : {}) })
      return { key: buff.key, mods: buff.mods ?? {}, timeLeft: buff.duration ?? Number.POSITIVE_INFINITY }
    },
    removeBuff(unit: { id?: string } | null, key: string) {
      if (!unit?.id) return
      ctx.clearModifier(unit.id, key)
      buffs.get(unit.id)?.delete(key)
    },
    fx(kind: string, data: Record<string, unknown> = {}) {
      ctx.emit("fx", { kind, ...data })
    },
    emit(type: string, data: Record<string, unknown> = {}) {
      ctx.emit(type, data)
    },
    addDp(pid: unknown, amount: number) {
      noteBlocked("battle.addDp.player")
      void pid
      ctx.addCost("ally", amount)
    },
    push(unit: { id?: string } | null, force: number, opts: { dir?: string; effect?: boolean } = {}) {
      if (!unit?.id) return false
      const vector = opts.dir === "LEFT" ? { dirX: -1, dirY: 0 } : opts.dir === "UP" ? { dirX: 0, dirY: 1 } : opts.dir === "DOWN" ? { dirX: 0, dirY: -1 } : { dirX: 1, dirY: 0 }
      return ctx.shift("push", unit.id, { force, ...vector, ...(opts.effect ? { effect: true } : {}) })
    },
    pull(unit: { id?: string } | null, force: number) {
      if (!unit?.id) return false
      return ctx.shift("pull", unit.id, { force })
    },
    pullToFront(unit: { id?: string } | null, force: number) {
      return facade.pull(unit, force)
    },
    setObstacle(row: number, col: number, on: boolean) {
      ctx.setObstacle(col, row, on, "block")
    },
    enemiesInKeys(keys: readonly number[] | Set<number>, _unit?: unknown, _opts?: unknown) {
      return enemies().filter((unit) => bodyInKeys(unit as { x: number; y: number }, keys instanceof Set ? [...keys] : keys))
    },
    alliesInGrid(unit: { tileR?: number; tileC?: number; ownerId?: string } | null, grid: readonly unknown[] | null) {
      if (!unit) return []
      const keys = new Set<number>()
      if (Array.isArray(grid)) {
        for (const cell of grid) {
          if (!Array.isArray(cell)) continue
          keys.add(((unit.tileR ?? 0) + Number(cell[0])) * COLS + ((unit.tileC ?? 0) + Number(cell[1])))
        }
      }
      return allies().filter((ally) => ally.ownerId === unit.ownerId && keys.has(Number(ally.tileR) * COLS + Number(ally.tileC)))
    },
    spawnToken(owner: { id?: string; ownerId?: string } | null, tokenId: string, row: number, col: number) {
      const record = getToken(tokenId)
      const stats = record && typeof record.stats === "object" ? record.stats as Record<string, number> : {}
      const id = `${tokenId}#${ctx.tick()}#${row}#${col}`
      try {
        ctx.spawnUnit({
          id,
          side: "ally",
          attributes: { hp: stats.maxHp ?? stats.hp ?? 1, atk: stats.atk ?? 0, def: stats.def ?? 0, res: stats.res ?? 0 },
          skills: [],
          attackRange: [],
          tags: ["token"],
          deployPositions: ["ground", "high"],
          x: col,
          y: row,
          script: { kind: "token", chessId: tokenId, ownerId: owner?.ownerId ?? "p1", ownerUnitId: owner?.id ?? "" },
        })
      } catch (cause) {
        noteBlocked(`spawnToken:${tokenId}:${cause instanceof Error ? cause.message : "failed"}`)
      }
      return unitProxy(id)
    },
    addLayers(pid: unknown, bondId: string, count: number) {
      const player = facade.getPlayer(pid) as { bonds?: Record<string, { layers?: number }> } | null
      const bond = player?.bonds?.[bondId]
      if (!bond) return 0
      bond.layers = (bond.layers ?? 0) + count
      const gains = (shared.layerGains ??= {})
      const key = String(pid)
      const row = (gains[key] ??= {})
      row[bondId] = (row[bondId] ?? 0) + count
      ctx.emit("layerGain", { playerId: pid, bondId, count })
      return count
    },
    kill(unit: { id?: string; hp?: number } | null) {
      if (!unit?.id) return
      ctx.loseHp(unit.id, Math.max(1, (unit.hp ?? 1) + 1))
    },
    forceEnd(reason: string) {
      shared.endReason = reason
      ctx.finish("enemy")
    },
    result() {
      const gains = shared.layerGains ?? {}
      const perPlayer: Record<string, { layerGains: Record<string, number> }> = {}
      for (const [pid, row] of Object.entries(gains)) perPlayer[pid] = { layerGains: row }
      return { finished: false, winner: null, reason: shared.endReason ?? null, perPlayer }
    },
    _occ: [] as unknown[],
    _emitDepth: 0,
    _perPlayer: {},
    get stage() { return field().stage ?? { id: "flat", rows: [] as string[] } },
    get grid() {
      return {
        cols: COLS,
        rows: 19,
        tile(row: number, col: number) {
          return { terrain: "flat", height: 0, row, col, buildable: true }
        },
        inBounds(row: number, col: number) { return row >= 0 && col >= 0 && row < 19 && col < COLS },
        inRect(row: number, col: number) { return row >= 0 && col >= 0 && row < 19 && col < COLS },
      }
    },
  }
  return new Proxy(facade, {
    get(target, prop, receiver) {
      if (typeof prop !== "string") return Reflect.get(target, prop, receiver)
      if (prop in target) return Reflect.get(target, prop, receiver)
      noteBlocked(`battle.${prop}`)
      const missing = (..._args: unknown[]) => undefined
      return missing
    },
  })
}
