import type { BattleLedger, LedgerRow } from "#contract/result.js"
import type { BattleSpec, UnitSpec } from "#contract/spec.js"
import type { ContentContext } from "#port/context.js"
import { defineResource } from "#kernel/world/resource.js"
import type { BattleWorld } from "#unit/record/index.js"

type Row = { -readonly [K in keyof LedgerRow]: LedgerRow[K] }

/** 账本的可变状态。全是纯数据，随世界一起导出。 */
export interface LedgerBook {
  readonly battle: Row
  readonly owners: Record<string, Row>
  /** 单位 id 到最后一次对它造成伤害的单位 id。 */
  readonly lastCredit: Record<string, string>
}

export const LEDGER = defineResource<LedgerBook>("ledger:book", openBook)

function emptyRow(): Row {
  return { kills: 0, leaks: 0, damage: 0, healing: 0, deaths: 0, total: 0, killedInTotal: 0, leakedInTotal: 0, resolved: 0 }
}

const inTotalCache = new WeakMap<BattleSpec, ReadonlySet<string>>()

/** 计入总数的敌方单位 id：开场的敌方单位，以及没有写 inTotal: false 的敌方出场项。 */
export function inTotalIds(spec: BattleSpec): ReadonlySet<string> {
  const cached = inTotalCache.get(spec)
  if (cached) return cached
  const ids = new Set<string>()
  for (const unit of spec.units) if (unit.side === "enemy") ids.add(unit.id)
  for (const spawn of spec.spawns) if (spawn.unit.side === "enemy" && spawn.inTotal !== false) ids.add(spawn.unit.id)
  inTotalCache.set(spec, ids)
  return ids
}

function openBook(spec: BattleSpec): LedgerBook {
  const book: LedgerBook = { battle: emptyRow(), owners: {}, lastCredit: {} }
  const counted = inTotalIds(spec)
  const units: UnitSpec[] = [...spec.units, ...spec.spawns.map((spawn) => spawn.unit)]
  for (const unit of units) {
    if (!counted.has(unit.id)) continue
    for (const row of rowsOf(book, unit.owner ?? null)) row.total += 1
  }
  return book
}

function rowsOf(book: LedgerBook, owner: string | null): Row[] {
  if (owner === null) return [book.battle]
  const row = (book.owners[owner] ??= emptyRow())
  return [book.battle, row]
}

function ownerOf(world: BattleWorld, unitId: string): string | null {
  return world.units.get(unitId)?.owner ?? null
}

function add(book: LedgerBook, owner: string | null, field: keyof Row, amount: number): void {
  for (const row of rowsOf(book, owner)) {
    row[field] += amount
    row.resolved = Math.min(row.total, row.killedInTotal + row.leakedInTotal)
  }
}

/** 订阅伤害、治疗、倒下与漏出事件，按单位的 owner 记账。 */
export function bindLedger(world: BattleWorld, ctx: ContentContext): void {
  const ledger = world.resources.access(LEDGER)
  const counted = inTotalIds(world.spec)
  ctx.subscribe("damaged", (event) => {
    const book = ledger.ensure()
    const { creditId, targetId, amount, applied } = event.data
    const credit = world.units.get(creditId)
    const target = world.units.get(targetId)
    if (!credit || !target || !(amount > 0)) return
    book.lastCredit[targetId] = creditId
    if (credit.side !== target.side && applied > 0) add(book, credit.owner, "damage", applied)
  })
  ctx.subscribe("heal", (event) => {
    const book = ledger.ensure()
    const { sourceId, amount } = event.data
    if (!sourceId || !(amount > 0)) return
    add(book, ownerOf(world, sourceId), "healing", amount)
  })
  ctx.subscribe("downed", (event) => {
    const book = ledger.ensure()
    const unit = world.units.get(event.data.unitId)
    if (!unit) return
    if (unit.side === "ally") {
      add(book, unit.owner, "deaths", 1)
      return
    }
    const creditId = book.lastCredit[unit.id]
    add(book, creditId === undefined ? null : ownerOf(world, creditId), "kills", 1)
    if (counted.has(unit.id)) add(book, unit.owner, "killedInTotal", 1)
  })
  ctx.subscribe("leak", (event) => {
    const book = ledger.ensure()
    const unit = world.units.get(event.data.unitId)
    if (!unit) return
    add(book, unit.owner, "leaks", 1)
    if (counted.has(unit.id)) add(book, unit.owner, "leakedInTotal", 1)
  })
}

/** 当前账本的拷贝。 */
export function readLedger(world: BattleWorld): BattleLedger {
  const book = world.resources.access(LEDGER).ensure()
  const owners: Record<string, LedgerRow> = {}
  for (const [owner, row] of Object.entries(book.owners)) owners[owner] = { ...row }
  return { battle: { ...book.battle }, owners }
}
