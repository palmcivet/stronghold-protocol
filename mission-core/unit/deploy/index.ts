import type { TileCoord } from "#contract/spec.js"
import type { ContentContext, MissionModule } from "#port/content.js"
import { sessionOf } from "#battle/session.js"
import { requireUnit } from "#battle/state.js"
import type { UnitState } from "#unit/record/index.js"

/** 内置部署策略。规格的 `deployStrategy` 与模块 id 都用这个标识。 */
export const DEPLOY_STRATEGY = "deploy"

/** 召唤物。开战排在干员后面。 */
export const TOKEN_TAG = "token"

/** 开战不上场，初始格子留给它。 */
export const DEFER_DEPLOY_TAG = "deferDeploy"

export const deployModule: MissionModule = {
  id: DEPLOY_STRATEGY,
  install(ctx) {
    ctx.registerDeployStrategy({
      id: DEPLOY_STRATEGY,
      opening,
      downedTile,
      canStand,
    })
  },
}

// MARK: opening

function opening(ctx: ContentContext): readonly string[] {
  const { state } = sessionOf(ctx)
  const enemies: string[] = []
  const operators: UnitState[] = []
  const tokens: UnitState[] = []
  for (const unit of state.units.values()) {
    if (unit.side !== "ally") {
      enemies.push(unit.id)
      continue
    }
    if (unit.tags.includes(DEFER_DEPLOY_TAG)) continue
    if (unit.tags.includes(TOKEN_TAG)) tokens.push(unit)
    else operators.push(unit)
  }
  operators.sort(byColumn)
  tokens.sort(byColumn)
  return [...enemies, ...operators.map((unit) => unit.id), ...tokens.map((unit) => unit.id)]
}

/** 列从左到右，同一列先上后下，再比 id。 */
function byColumn(left: UnitState, right: UnitState): number {
  if (left.homeX !== right.homeX) return left.homeX - right.homeX
  if (left.homeY !== right.homeY) return right.homeY - left.homeY
  if (left.id < right.id) return -1
  if (left.id > right.id) return 1
  return 0
}

// MARK: body

function downedTile(unitId: string, ctx: ContentContext): TileCoord {
  const { state } = sessionOf(ctx)
  const unit = requireUnit(state, unitId)
  const fell = tileOf(unit.x, unit.y)
  if (unit.side !== "ally" || unit.tags.includes(TOKEN_TAG)) return fell
  if (fell.x === unit.homeX && fell.y === unit.homeY) return fell
  if (!homeOfOther(state.units.values(), unit, fell)) return fell
  const home = { x: unit.homeX, y: unit.homeY }
  if (!canStand(unitId, home, ctx)) return fell
  return home
}

function canStand(unitId: string, tile: TileCoord, ctx: ContentContext): boolean {
  const { state } = sessionOf(ctx)
  const at = tileOf(tile.x, tile.y)
  const ground = ctx.tile(at.x, at.y)
  if (!ground?.deployable) return false
  const units = state.units.values()
  if (occupiedByOther(units, unitId, at)) return false
  if (reservedByOther(state.units.values(), unitId, at)) return false
  return true
}

function homeOfOther(units: Iterable<UnitState>, unit: UnitState, tile: TileCoord): boolean {
  for (const other of units) {
    if (other.id === unit.id || other.side !== "ally") continue
    if (other.homeX === tile.x && other.homeY === tile.y) return true
  }
  return false
}

function occupiedByOther(units: Iterable<UnitState>, unitId: string, tile: TileCoord): boolean {
  for (const other of units) {
    if (other.id === unitId || !other.fielded || other.downed) continue
    const stood = tileOf(other.x, other.y)
    if (stood.x === tile.x && stood.y === tile.y) return true
  }
  return false
}

/** 倒地干员占着当前格子。召唤物倒地不占格。还没上场的友方占着初始格子。 */
function reservedByOther(units: Iterable<UnitState>, unitId: string, tile: TileCoord): boolean {
  for (const other of units) {
    if (other.id === unitId || other.side !== "ally") continue
    if (other.downed) {
      if (other.tags.includes(TOKEN_TAG)) continue
      const body = tileOf(other.x, other.y)
      if (body.x === tile.x && body.y === tile.y) return true
      continue
    }
    if (!other.fielded && other.homeX === tile.x && other.homeY === tile.y) return true
  }
  return false
}

function tileOf(x: number, y: number): TileCoord {
  return { x: Math.round(x), y: Math.round(y) }
}
