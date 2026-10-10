import type { ContentContext } from "#port/context.js"
import type { MissionModule } from "#port/module.js"
import type { BattleRegistry } from "#port/definition.js"
import { emit } from "#kernel/event/index.js"
import { engineOf, type BattleWorld } from "#unit/record/index.js"
import { gridOf } from "#field/grid/index.js"
import { hasTag } from "#kernel/world/tag.js"
import { BLOCK_FLY, DEVICE, NO_BLOCK, STEALTH, UNBLOCKABLE } from "#port/tag.js"
import { allowsGround } from "#field/grid/pass.js"
import { applyStatus } from "#ability/effect/index.js"
import { attributeOf, carriesAttribute } from "#ability/effect/attribute.js"
import { isFlying, type UnitState } from "#unit/record/index.js"

/** 地面单位的阻挡接触半径，格。 */
export const BLOCK_RADIUS = 0.70709997

/** 接触用平方距离比较。对角格子的中心距平方是 0.5，进不了这个半径。 */
export const BLOCK_RADIUS_SQ = 0.49999037

/** 飞行单位的阻挡接触半径。 */
export const BLOCK_RADIUS_FLY = 0.8944

export const BLOCK_RADIUS_FLY_SQ = 0.79995137

/** 装置的阻挡接触半径。带 DEVICE 标签的阻挡者用它。 */
export const BLOCK_RADIUS_DEVICE = 0.4472

export const BLOCK_RADIUS_DEVICE_SQ: number = BLOCK_RADIUS_DEVICE * BLOCK_RADIUS_DEVICE


/** 解除阻挡后，隐匿过这么多秒才恢复。隐匿状态的强度大于 0 时改用那个秒数。 */
export const STEALTH_RESTORE = 3

const COUNT_EPSILON = 1e-9

export function releaseBlock(
  state: BattleWorld,
  enemy: UnitState,
  hook?: { registry: BattleRegistry; ctx: ContentContext },
): void {
  const blockerId = enemy.blockedBy
  if (!blockerId) return
  enemy.blockedBy = null
  const blocker = state.units.get(blockerId)
  if (blocker) {
    const index = blocker.blocking.indexOf(enemy.id)
    if (index >= 0) blocker.blocking.splice(index, 1)
  }
  emit(state, "unblocked", { blockerId, enemyId: enemy.id })
  if (hook) restoreStealth(state, hook.registry, hook.ctx, enemy)
}

/** 解开失效的阻挡，按阻挡数丢掉最晚挡住的，再给还没被挡的敌人找最近的阻挡者。 */
export function maintainBlocks(state: BattleWorld, registry: BattleRegistry, ctx?: ContentContext): void {
  const hook = ctx ? { registry, ctx } : undefined
  for (const unit of state.units.values()) {
    if (unit.side !== "enemy" || !unit.blockedBy) continue
    const blocker = state.units.get(unit.blockedBy)
    if (!blocker || !keepsBlock(state, unit, blocker, registry)) releaseBlock(state, unit, hook)
  }
  for (const unit of state.units.values()) {
    if (unit.side !== "ally") continue
    enforceCapacity(state, registry, unit, hook)
  }
  for (const unit of state.units.values()) {
    if (unit.blockedBy || !canBeBlocked(unit)) continue
    const blocker = pickBlocker(state, registry, unit)
    if (!blocker) continue
    unit.blockedBy = blocker.id
    blocker.blocking.push(unit.id)
    emit(state, "blocked", { blockerId: blocker.id, enemyId: unit.id })
  }
}

function maintain(ctx: ContentContext): void {
  const session = engineOf(ctx)
  maintainBlocks(session.world, session.registry, ctx)
}

export const blockModule: MissionModule = {
  id: "block",
  install(ctx) {
    ctx.registerSystem({ id: "block-before", slot: "enemy", priority: -1, run: maintain })
    ctx.registerSystem({ id: "block-after", slot: "enemy", priority: 0.5, run: maintain })
  },
}

// MARK: rule

function keepsBlock(state: BattleWorld, enemy: UnitState, blocker: UnitState, registry: BattleRegistry): boolean {
  return canBeBlocked(enemy) && canBlock(blocker, registry) && reaches(state, blocker, enemy)
}

function canBeBlocked(unit: UnitState): boolean {
  if (unit.side !== "enemy" || !unit.fielded || unit.downed || unit.routeHidden) return false
  if (hasTag(unit, UNBLOCKABLE)) return false
  return true
}

function canBlock(unit: UnitState, registry: BattleRegistry): boolean {
  if (unit.side !== "ally" || !unit.fielded || unit.downed || unit.routeHidden) return false
  if (hasTag(unit, NO_BLOCK)) return false
  return blockCount(unit, registry) > COUNT_EPSILON
}

function inContact(blocker: UnitState, enemy: UnitState): boolean {
  const dx = enemy.x - blocker.x
  const dy = enemy.y - blocker.y
  return dx * dx + dy * dy < contactRadiusSq(blocker, enemy)
}

function contactRadiusSq(blocker: UnitState, enemy: UnitState): number {
  if (hasTag(blocker, DEVICE)) return BLOCK_RADIUS_DEVICE_SQ
  if (isFlying(enemy)) return BLOCK_RADIUS_FLY_SQ
  return BLOCK_RADIUS_SQ
}

/** 飞行敌人要阻挡者带 BLOCK_FLY。地面敌人不能被围栏上的单位挡住。 */
function reaches(state: BattleWorld, blocker: UnitState, enemy: UnitState): boolean {
  if (isFlying(enemy)) return hasTag(blocker, BLOCK_FLY)
  return !fenced(state, blocker)
}

function fenced(state: BattleWorld, blocker: UnitState): boolean {
  const tile = gridOf(state).at(blocker.x, blocker.y)
  if (!tile) return false
  return !allowsGround(tile.walkableBy)
}

function restoreStealth(state: BattleWorld, registry: BattleRegistry, ctx: ContentContext, enemy: UnitState): void {
  if (!hasTag(enemy, STEALTH) || !enemy.fielded || enemy.downed) return
  const stealth = enemy.statuses.find((status) => status.id === "stealth" && !status.dropped)
  const delay = stealth && stealth.strength > 0 ? stealth.strength : STEALTH_RESTORE
  if (!(delay > 0)) return
  applyStatus(state, registry, ctx, enemy.id, "stealthOff", { duration: delay })
}

/** 没写 blockCnt 时按 1。写了就走属性汇总。 */
function blockCount(unit: UnitState, registry: BattleRegistry): number {
  if (!carriesAttribute(unit, registry, "blockCnt")) return 1
  const value = attributeOf(unit, registry, "blockCnt")
  if (!Number.isFinite(value) || value < 0) return 0
  return value
}

/** 没写 blockWeight 时按 1。 */
function blockWeight(unit: UnitState, registry: BattleRegistry): number {
  if (!carriesAttribute(unit, registry, "blockWeight")) return 1
  const value = attributeOf(unit, registry, "blockWeight")
  if (!Number.isFinite(value) || value < 0) return 1
  return value
}

function usedWeight(state: BattleWorld, registry: BattleRegistry, blocker: UnitState): number {
  let used = 0
  for (const id of blocker.blocking) {
    const enemy = state.units.get(id)
    if (!enemy || enemy.blockedBy !== blocker.id) continue
    used += blockWeight(enemy, registry)
  }
  return used
}

function hasRoom(state: BattleWorld, registry: BattleRegistry, blocker: UnitState, weight: number): boolean {
  return usedWeight(state, registry, blocker) + weight <= blockCount(blocker, registry) + COUNT_EPSILON
}

function enforceCapacity(
  state: BattleWorld,
  registry: BattleRegistry,
  blocker: UnitState,
  hook?: { registry: BattleRegistry; ctx: ContentContext },
): void {
  if (!canBlock(blocker, registry)) {
    for (const id of [...blocker.blocking]) {
      const enemy = state.units.get(id)
      if (enemy && enemy.blockedBy === blocker.id) releaseBlock(state, enemy, hook)
    }
    return
  }
  let guard = blocker.blocking.length
  while (guard > 0 && usedWeight(state, registry, blocker) > blockCount(blocker, registry) + COUNT_EPSILON) {
    guard -= 1
    const id = blocker.blocking[blocker.blocking.length - 1]
    if (!id) break
    const enemy = state.units.get(id)
    if (!enemy || enemy.blockedBy !== blocker.id) {
      blocker.blocking.pop()
      continue
    }
    releaseBlock(state, enemy, hook)
  }
}

function pickBlocker(state: BattleWorld, registry: BattleRegistry, enemy: UnitState): UnitState | null {
  const weight = blockWeight(enemy, registry)
  let chosen: UnitState | null = null
  let best = Infinity
  for (const unit of state.units.values()) {
    if (!canBlock(unit, registry) || !reaches(state, unit, enemy) || !inContact(unit, enemy)) continue
    if (!hasRoom(state, registry, unit, weight)) continue
    const dx = enemy.x - unit.x
    const dy = enemy.y - unit.y
    const distance = dx * dx + dy * dy
    if (!closer(distance, unit, best, chosen)) continue
    chosen = unit
    best = distance
  }
  return chosen
}

function closer(distance: number, unit: UnitState, best: number, chosen: UnitState | null): boolean {
  if (!chosen || distance < best - COUNT_EPSILON) return true
  if (distance > best + COUNT_EPSILON) return false
  if (unit.y !== chosen.y) return unit.y < chosen.y
  if (unit.x !== chosen.x) return unit.x < chosen.x
  return unit.id < chosen.id
}
