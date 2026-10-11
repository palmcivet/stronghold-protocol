import { createHash } from "node:crypto"
import { createBattle, type BattleSnapshot, type BattleSpec, type MissionModule } from "arknights-mission-core"

/** 每隔这么多拍记一次快照摘要。 */
export const SNAPSHOT_INTERVAL = 30

export interface Replay {
  readonly ticks: number
  /** 每拍事件流的摘要，下标是拍号。 */
  readonly events: readonly string[]
  /** 第 0、N、2N… 拍推进之后的快照摘要。 */
  readonly snapshots: readonly string[]
  readonly finalSnapshot: string
  readonly result: { readonly finished: boolean; readonly winner: string | null }
}

export interface Scenario {
  readonly name: string
  readonly ticks: number
  spec(): BattleSpec
  modules(): readonly MissionModule[]
}

/** 键排序后的 JSON。−0、NaN、±Infinity 写成各自的字面量，数字按最短往返形式写出，逐位区分。 */
export function canonical(value: unknown): string {
  if (typeof value === "number") {
    if (Object.is(value, -0)) return "-0"
    if (!Number.isFinite(value)) return String(value)
    return JSON.stringify(value)
  }
  if (value === null || typeof value !== "object") return value === undefined ? "undefined" : JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`
}

export function digest(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex").slice(0, 16)
}

/** 快照里计入状态的部分：去掉只给画面的 components。 */
export function stateOf(snapshot: BattleSnapshot): unknown {
  return {
    tick: snapshot.tick,
    units: snapshot.units.map(({ components: _components, ...unit }) => unit),
  }
}

/** 推进 ticks 拍，记下每拍事件摘要、每 SNAPSHOT_INTERVAL 拍的快照摘要与最终结果。 */
export function replay(scenario: Scenario): Replay {
  const battle = createBattle(scenario.spec(), scenario.modules())
  const events: string[] = []
  const snapshots: string[] = []
  for (let tick = 0; tick < scenario.ticks; tick += 1) {
    battle.step()
    events.push(digest(battle.drainEvents()))
    if (tick % SNAPSHOT_INTERVAL === 0) snapshots.push(digest(stateOf(battle.snapshot())))
  }
  return {
    ticks: scenario.ticks,
    events,
    snapshots,
    finalSnapshot: digest(stateOf(battle.snapshot())),
    result: battle.result(),
  }
}

/** 推进 ticks 拍，按类型数出现的事件。 */
export function eventCounts(scenario: Scenario): Record<string, number> {
  const battle = createBattle(scenario.spec(), scenario.modules())
  const counts: Record<string, number> = {}
  for (let tick = 0; tick < scenario.ticks; tick += 1) {
    battle.step()
    for (const event of battle.drainEvents()) counts[event.type] = (counts[event.type] ?? 0) + 1
  }
  return counts
}
