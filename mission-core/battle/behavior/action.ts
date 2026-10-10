import type { ContentContext, ShiftDefinition, ShiftInput, ShiftPlan } from "#port/content.js"
import type { BattleRegistry } from "#battle/registry.js"
import { releaseBlock } from "#battle/block.js"
import { sessionOf } from "#battle/session.js"
import type { FieldGrid } from "#battle/space/grid/index.js"
import { directionVector } from "#battle/space/direction/index.js"
import { attributeOf } from "#battle/unit/attribute.js"
import type { UnitState } from "#battle/unit/index.js"
import { emit, requireUnit, type BattleState } from "#battle/state.js"
import { attractPoints, fearReachableTiles, planFearMove } from "#battle/behavior/shift.js"
import { MOVE_SCALE } from "#battle/space/grid/route.js"
import { hypot } from "#kernel/math/hypot.js"

/** 推力距离。受力等级 ≤ −3 是 0，≥ 3 用 3 这一档。 */
export const PUSH_TILES: Readonly<Record<number, number>> = Object.freeze({
  [-2]: 0.12,
  [-1]: 0.44,
  0: 1.7,
  1: 2.14,
  2: 2.96,
  3: 3.53,
})

/** 特效推力比弹道少一帧的行程。 */
export const PUSH_TILES_EFFECT: Readonly<Record<number, number>> = Object.freeze({
  [-2]: 0.085,
  [-1]: 0.374,
  0: 1.562,
  1: 1.987,
  2: 2.773,
  3: 3.331,
})

export const PULL_WEAK_SHARE = 0.35
export const PULL_CRAWL = 0.03
export const PULL_ORIGIN = 0.5
export const PULL_STOP_RADIUS = 0.6708
export const PUSH_DIRECTIONAL_MIN_DIST = 0.25

export const SHIFT_PUSH = "push"
export const SHIFT_PULL = "pull"
export const SHIFT_FEAR = "fear"
export const SHIFT_ATTRACT = "attract"

const SLIDE_STEP = 0.1

export function registerBuiltinShifts(registry: BattleRegistry): void {
  registry.registerShift(pushShift())
  registry.registerShift(pullShift())
  registry.registerShift(fearShift())
  registry.registerShift(attractShift())
}

/** 按标识执行一段位移。立刻完成的写下落点；还在走的记在单位上，倒地时先落到终点。 */
export function applyShift(
  state: BattleState,
  registry: BattleRegistry,
  ctx: ContentContext,
  actionId: string,
  unitId: string,
  input: ShiftInput = {},
): boolean {
  const definition = registry.requireShift(actionId)
  const plan = definition.plan(unitId, input, ctx)
  if (!plan) return false
  const unit = requireUnit(state, unitId)
  if (definition.instant) {
    writeLanding(state, registry, ctx, unit, plan.x, plan.y)
    unit.shiftRun = null
    return true
  }
  unit.shiftRun = {
    id: definition.id,
    landingX: plan.x,
    landingY: plan.y,
    points: (plan.points ?? [{ x: plan.x, y: plan.y }]).map((point) => ({ x: point.x, y: point.y })),
    index: 0,
  }
  return true
}

/** 恐惧和诱导还没走完时，先沿这段动作走，本拍不再沿路线。 */
export function advanceShift(_state: BattleState, registry: BattleRegistry, unit: UnitState, dt: number): boolean {
  const run = unit.shiftRun
  if (!run) return false
  const speed = Math.max(0, attributeOf(unit, registry, "moveSpeed")) * MOVE_SCALE
  let distance = speed * dt
  let moved = false
  while (distance > 1e-9 && run.index < run.points.length) {
    const point = run.points[run.index]
    if (!point) break
    const dx = point.x - unit.x
    const dy = point.y - unit.y
    const length = hypot(dx, dy)
    if (length <= distance) {
      unit.x = point.x
      unit.y = point.y
      distance -= length
      run.index += 1
    } else {
      unit.x += (dx / length) * distance
      unit.y += (dy / length) * distance
      distance = 0
    }
    moved = true
  }
  if (moved && unit.route) unit.route.pts = null
  if (run.index >= run.points.length) unit.shiftRun = null
  return true
}

/** 倒地前先写到这段动作的终点，倒地落点读的就是这个坐标。 */
export function landShift(unit: UnitState): void {
  const run = unit.shiftRun
  if (!run) return
  unit.x = run.landingX
  unit.y = run.landingY
  unit.shiftRun = null
  if (unit.route) unit.route.pts = null
}

// MARK: push

function pushShift(): ShiftDefinition {
  return {
    id: SHIFT_PUSH,
    instant: true,
    plan(unitId, input, ctx) {
      const { state, registry } = sessionOf(ctx)
      const unit = movable(state, unitId)
      if (!unit) return null
      const level = forceLevel(unit, registry, input.force ?? 0)
      const aimed = aimPush(unit, input, level.level)
      if (!aimed) return null
      const table = input.effect === true ? PUSH_TILES_EFFECT : PUSH_TILES
      let distance = pushDistance(table, aimed.level)
      let ux = aimed.x
      let uy = aimed.y
      if (input.inward === true && !(vectorLength(input.dirX, input.dirY) > 0)) {
        ux = -ux
        uy = -uy
        const fromX = input.fromX ?? unit.x
        const fromY = input.fromY ?? unit.y
        const gap = hypot(unit.x - fromX, unit.y - fromY)
        distance = Math.min(distance, Math.max(0, gap - PULL_STOP_RADIUS))
      }
      return slide(state.grid, unit, ux, uy, distance)
    },
  }
}

function pullShift(): ShiftDefinition {
  return {
    id: SHIFT_PULL,
    instant: true,
    plan(unitId, input, ctx) {
      const { state, registry } = sessionOf(ctx)
      const unit = movable(state, unitId)
      if (!unit || input.toX === undefined || input.toY === undefined) return null
      const centerX = input.centerX ?? input.toX
      const centerY = input.centerY ?? input.toY
      if (blockedByCenter(state, unit, centerX, centerY)) return null
      const dx = input.toX - unit.x
      const dy = input.toY - unit.y
      const distance = hypot(dx, dy)
      if (!(distance > 1e-6)) return null
      const ux = dx / distance
      const uy = dy / distance
      const full = stopDistance(unit.x, unit.y, ux, uy, distance, centerX, centerY, PULL_STOP_RADIUS)
      const level = forceLevel(unit, registry, input.force ?? 0).level
      const travel =
        level >= 0 ? full : level === -1 ? Math.min(full, PULL_WEAK_SHARE * distance) : level === -2 ? Math.min(full, PULL_CRAWL) : 0
      if (!(travel > 1e-6)) return null
      return slide(state.grid, unit, ux, uy, travel)
    },
  }
}

function fearShift(): ShiftDefinition {
  return {
    id: SHIFT_FEAR,
    instant: false,
    plan(unitId, input, ctx) {
      const { state } = sessionOf(ctx)
      const unit = movable(state, unitId)
      if (!unit || input.sourceX === undefined || input.sourceY === undefined) return null
      const sourceX = input.sourceX
      const sourceY = input.sourceY
      const self = hypot(unit.x - sourceX, unit.y - sourceY) <= 1e-9
      const end = unit.route?.legs.find((leg) => leg.final)
      const goal = end ? { x: end.x, y: end.y } : null
      const tiles = [
        ...fearReachableTiles(state.grid, unit.motion, unit.x, unit.y, sourceX, sourceY, self, goal),
      ]
      const move = planFearMove(state.grid, unit.motion, unit.x, unit.y, tiles, state.random)
      return { x: move.goal.x, y: move.goal.y, points: move.points }
    },
  }
}

function attractShift(): ShiftDefinition {
  return {
    id: SHIFT_ATTRACT,
    instant: false,
    plan(unitId, input, ctx) {
      const { state } = sessionOf(ctx)
      const unit = movable(state, unitId)
      if (!unit || input.toX === undefined || input.toY === undefined) return null
      const points = attractPoints(state.grid, unit.motion, unit.x, unit.y, input.toX, input.toY)
      const last = points[points.length - 1]
      if (!last) return null
      return { x: last.x, y: last.y, points }
    },
  }
}

// MARK: motion

function movable(state: BattleState, unitId: string): UnitState | null {
  const unit = state.units.get(unitId)
  if (!unit || unit.side !== "enemy" || !unit.fielded || unit.downed) return null
  if (unit.flags.has("noDisplace") || unit.tags.includes("staticBody")) return null
  return unit
}

function writeLanding(state: BattleState, registry: BattleRegistry, ctx: ContentContext, unit: UnitState, x: number, y: number): void {
  if (hypot(unit.x - x, unit.y - y) <= 1e-8) return
  unit.x = x
  unit.y = y
  if (unit.route) unit.route.pts = null
  releaseBlock(state, unit, { registry, ctx })
  emit(state, "displace", { unitId: unit.id, x, y })
}

function forceLevel(unit: UnitState, registry: BattleRegistry, force: number): { level: number } {
  const mass = attributeOf(unit, registry, "massLevel")
  const level = Math.round(Number.isFinite(force) ? force : 0) - Math.round(Number.isFinite(mass) ? mass : 0)
  return { level }
}

function pushDistance(table: Readonly<Record<number, number>>, level: number): number {
  if (level <= -3) return 0
  const key = Math.min(3, level)
  return table[key] ?? 0
}

function aimPush(
  unit: UnitState,
  input: ShiftInput,
  level: number,
): { x: number; y: number; level: number } | null {
  const fromX = input.fromX ?? unit.x
  const fromY = input.fromY ?? unit.y
  const vx = unit.x - fromX
  const vy = unit.y - fromY
  const reach = hypot(vx, vy)
  const dir = unitVector(input.dirX, input.dirY)
  if (dir) {
    let ux = dir.x
    let uy = dir.y
    let next = level
    const aligned = reach > 1e-6 && vx * ux + vy * uy >= reach * Math.SQRT1_2
    if (input.fixed !== true && (reach < PUSH_DIRECTIONAL_MIN_DIST || !aligned)) {
      next -= 2
      if (reach > 1e-6) {
        ux = vx / reach
        uy = vy / reach
      }
    }
    return { x: ux, y: uy, level: next }
  }
  if (reach > 1e-6) return { x: vx / reach, y: vy / reach, level }
  const [row, col] = directionVector(unit.facing)
  if (row === 0 && col === 0) return null
  return { x: col, y: row, level }
}

function slide(grid: FieldGrid, unit: UnitState, ux: number, uy: number, distance: number): ShiftPlan | null {
  const length = hypot(ux, uy)
  if (!(length > 0) || !(distance > 0)) return null
  const stepX = ux / length
  const stepY = uy / length
  let x = unit.x
  let y = unit.y
  let moved = 0
  while (moved + 1e-9 < distance) {
    const step = Math.min(SLIDE_STEP, distance - moved)
    const nextX = x + stepX * step
    const nextY = y + stepY * step
    const tileX = Math.round(nextX)
    const tileY = Math.round(nextY)
    const open = unit.motion === "FLY" ? grid.flyPassable(tileX, tileY) : grid.groundPassable(tileX, tileY)
    if (!open) break
    x = nextX
    y = nextY
    moved += step
  }
  if (!(moved > 1e-8)) return null
  return { x, y }
}

function stopDistance(
  x: number,
  y: number,
  ux: number,
  uy: number,
  full: number,
  centerX: number,
  centerY: number,
  radius: number,
): number {
  const wx = x - centerX
  const wy = y - centerY
  const reach = wx * wx + wy * wy
  const limit = radius * radius
  if (reach <= limit) return 0
  const along = wx * ux + wy * uy
  const disc = along * along - reach + limit
  if (disc < 0) return full
  const hit = -along - Math.sqrt(disc)
  if (hit >= 0) return Math.min(full, hit)
  return full
}

function blockedByCenter(state: BattleState, unit: UnitState, centerX: number, centerY: number): boolean {
  if (!unit.blockedBy) return false
  const blocker = state.units.get(unit.blockedBy)
  if (!blocker) return false
  return hypot(blocker.x - centerX, blocker.y - centerY) <= 0.2
}

function vectorLength(x: number | undefined, y: number | undefined): number {
  if (x === undefined && y === undefined) return 0
  return hypot(x ?? 0, y ?? 0)
}

function unitVector(x: number | undefined, y: number | undefined): { x: number; y: number } | null {
  const length = vectorLength(x, y)
  if (!(length > 0)) return null
  return { x: (x ?? 0) / length, y: (y ?? 0) / length }
}
