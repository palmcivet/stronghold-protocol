import type { BattleEvent } from "#contract/event.js"
import type { BattleResult } from "#contract/result.js"
import type { BattleSpec, UnitSide, UnitSpec } from "#contract/spec.js"
import type { ContentContext, TimerState } from "#port/content.js"
import type { ProjectileFlight } from "#combat/projectile/index.js"
import type { Random } from "#kernel/random/index.js"
import type { FieldGrid } from "#field/grid/index.js"
import { compileRoute } from "#field/grid/route.js"
import { createUnit, type UnitState } from "#unit/record/index.js"

export interface ScheduledCallback {
  tick: number
  run: (ctx: ContentContext) => void
}

export interface BattleState {
  readonly spec: BattleSpec
  readonly grid: FieldGrid
  tick: number
  readonly units: Map<string, UnitState>
  readonly spawned: Set<number>
  readonly projectiles: ProjectileFlight[]
  readonly cost: Record<UnitSide, number>
  readonly events: BattleEvent[]
  readonly subscribers: Map<string, ((event: BattleEvent, ctx: ContentContext) => void)[]>
  readonly scheduled: ScheduledCallback[]
  result: BattleResult
  readonly random: Random
  /** 当前这次伤害是减伤预览。算出护盾后的数字，不掷闪避，不写生命，不扣护盾，不填槽，不发事件。 */
  damagePreview: boolean
  /** 这一次选择器查询以谁为攻击者。快照不写它。 */
  selectorOrigin: string | null
  /** 内容模块的本场记录，键是模块 id。 */
  readonly shared: Map<string, Record<string, unknown>>
  /** createContext 返回前写上。事件订阅者的第二个参数。 */
  live: ContentContext | null
}

export function addUnit(state: BattleState, spec: UnitSpec, fielded: boolean): void {
  if (state.units.has(spec.id)) throw new Error(`单位重复: ${spec.id}`)
  const unit = createUnit(spec, fielded, state.units.size + 1)
  unit.route = compileRoute(spec.route ?? null, state.grid.rect)
  state.units.set(spec.id, unit)
}

export function requireUnit(state: BattleState, unitId: string): UnitState {
  const unit = state.units.get(unitId)
  if (!unit) throw new Error(`单位不存在: ${unitId}`)
  return unit
}

export function emit(state: BattleState, type: string, data: Readonly<Record<string, unknown>>): void {
  const event: BattleEvent = { tick: state.tick, type, data }
  state.events.push(event)
  const handlers = state.subscribers.get(type)
  const ctx = state.live
  if (!handlers || !ctx) return
  for (const handler of [...handlers]) handler(event, ctx)
}

export function readTimer(unit: UnitState, timerId: string): TimerState | undefined {
  return unit.timers.get(timerId)
}
