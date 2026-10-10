import * as v from "valibot"

// MARK: schema

const text = v.pipe(v.string(), v.trim(), v.minLength(1))

const coveredEntry = v.object({ status: v.literal("covered"), next: v.pipe(v.array(text), v.minLength(1)), reason: v.optional(text) })
const rewrittenEntry = v.object({ status: v.literal("rewritten"), next: v.pipe(v.array(text), v.minLength(1)), reason: text })
const movedEntry = v.object({ status: v.literal("moved"), owner: text, reason: v.optional(text) })
const notMigratedEntry = v.object({ status: v.literal("not-migrated"), reason: text })
const pendingEntry = v.object({ status: v.literal("pending"), step: text, reason: v.optional(text) })

/** 逐条对照的一项。 */
export const CaseEntrySchema = v.variant("status", [coveredEntry, rewrittenEntry, movedEntry, notMigratedEntry, pendingEntry])

/** 按 glob 整批标记的规则。规则不指向 next 的用例，所以只用于 moved、not-migrated、pending。 */
export const RuleSchema = v.variant("status", [
  v.object({ match: text, ...movedEntry.entries }),
  v.object({ match: text, ...notMigratedEntry.entries }),
  v.object({ match: text, ...pendingEntry.entries }),
])

export const MappingSchema = v.object({
  upstream: v.object({ repo: text, commit: text }),
  /** 匹配这些 glob 的用例必须在 cases 里逐条记录，不能只靠规则。 */
  caseByCase: v.optional(v.array(text), []),
  rules: v.array(RuleSchema),
  cases: v.record(v.string(), CaseEntrySchema),
})

export const InventorySchema = v.object({
  commit: text,
  cases: v.array(v.string()),
})

export type CaseEntry = v.InferOutput<typeof CaseEntrySchema>
export type Rule = v.InferOutput<typeof RuleSchema>
export type Mapping = v.InferOutput<typeof MappingSchema>
export type Inventory = v.InferOutput<typeof InventorySchema>
export type CaseStatus = CaseEntry["status"]

/** 校验对照表或清单。失败时返回带路径的问题列表。 */
export function parseMapping(input: unknown): { mapping: Mapping } | { issues: readonly string[] } {
  const result = v.safeParse(MappingSchema, input)
  return result.success ? { mapping: result.output } : { issues: describeIssues(result.issues) }
}

export function parseInventory(input: unknown): { inventory: Inventory } | { issues: readonly string[] } {
  const result = v.safeParse(InventorySchema, input)
  return result.success ? { inventory: result.output } : { issues: describeIssues(result.issues) }
}

function describeIssues(issues: readonly v.BaseIssue<unknown>[]): readonly string[] {
  return issues.map((issue) => {
    const path = v.getDotPath(issue)
    return path === null ? issue.message : `${path}: ${issue.message}`
  })
}

// MARK: glob

function escape(text: string): string {
  return text.replace(/[.+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * 用例标识的 glob。`::` 前是文件部分：`**` 跨目录，`*` 不跨 `/`；`::` 后是用例名部分：`*` 匹配任意字符。
 * 没有 `::` 的模式匹配文件下的全部用例。
 */
export function globToRegExp(pattern: string): RegExp {
  const split = pattern.indexOf("::")
  const filePart = split < 0 ? pattern : pattern.slice(0, split)
  const namePart = split < 0 ? "*" : pattern.slice(split + 2)
  const file = filePart
    .split("**")
    .map((piece) => piece.split("*").map(escape).join("[^/]*"))
    .join(".*")
  const name = namePart.split("*").map(escape).join(".*")
  return new RegExp(`^${file}::${name}$`)
}

// MARK: check

export interface CheckInput {
  readonly mapping: Mapping
  readonly inventory: Inventory | null
  /** 这次枚举出的 master 用例标识。 */
  readonly master: readonly string[]
  /** 这次枚举出的 next 用例标识。 */
  readonly next: readonly string[]
}

export interface DanglingReference {
  readonly id: string
  readonly next: string
}

export interface CheckReport {
  readonly total: number
  /** 既没有条目也没有规则的用例。 */
  readonly unmapped: readonly string[]
  /** 落在 caseByCase 范围里却只由规则标记的用例。 */
  readonly notCaseByCase: readonly string[]
  /** next 里找不到的引用。 */
  readonly dangling: readonly DanglingReference[]
  /** 相对上次清单新增的用例。没有清单时为空。 */
  readonly added: readonly string[]
  /** 上次清单里有、这次没有的用例。 */
  readonly vanished: readonly string[]
  /** cases 里有、这次枚举没有的条目，多半是用例改名。 */
  readonly staleEntries: readonly string[]
  /** 没有匹配到任何用例的规则。 */
  readonly unusedRules: readonly string[]
  readonly byStatus: Readonly<Record<CaseStatus, number>>
  /** 由逐条条目标记的用例数。 */
  readonly byCase: number
  /** 由规则标记的用例数，键是规则的 match。 */
  readonly byRule: Readonly<Record<string, number>>
}

/** 比对对照表与两边的用例清单。纯函数，不读文件。 */
export function checkCaseMap(input: CheckInput): CheckReport {
  const { mapping, inventory, master } = input
  const nextCases = new Set(input.next)
  const masterCases = new Set(master)
  const rules = mapping.rules.map((rule) => ({ rule, pattern: globToRegExp(rule.match) }))
  const strict = mapping.caseByCase.map(globToRegExp)
  const byStatus: Record<CaseStatus, number> = { covered: 0, rewritten: 0, moved: 0, "not-migrated": 0, pending: 0 }
  const byRule: Record<string, number> = Object.fromEntries(mapping.rules.map((rule) => [rule.match, 0]))
  const unmapped: string[] = []
  const notCaseByCase: string[] = []
  let byCase = 0
  for (const id of master) {
    const entry = mapping.cases[id]
    if (entry) {
      byStatus[entry.status] += 1
      byCase += 1
      continue
    }
    const matched = rules.find(({ pattern }) => pattern.test(id))
    if (!matched) {
      unmapped.push(id)
      continue
    }
    byStatus[matched.rule.status] += 1
    byRule[matched.rule.match] = (byRule[matched.rule.match] ?? 0) + 1
    if (strict.some((pattern) => pattern.test(id))) notCaseByCase.push(id)
  }
  const dangling: DanglingReference[] = []
  for (const [id, entry] of Object.entries(mapping.cases)) {
    if (entry.status !== "covered" && entry.status !== "rewritten") continue
    for (const reference of entry.next) if (!nextCases.has(reference)) dangling.push({ id, next: reference })
  }
  const previous = new Set(inventory?.cases ?? [])
  return {
    total: master.length,
    unmapped,
    notCaseByCase,
    dangling,
    added: inventory ? master.filter((id) => !previous.has(id)) : [],
    vanished: inventory ? inventory.cases.filter((id) => !masterCases.has(id)) : [],
    staleEntries: Object.keys(mapping.cases).filter((id) => !masterCases.has(id)),
    unusedRules: mapping.rules.filter((rule) => (byRule[rule.match] ?? 0) === 0).map((rule) => rule.match),
    byStatus,
    byCase,
    byRule,
  }
}

/** 未对应、悬空引用或该逐条却只靠规则时失败。 */
export function hasFailures(report: CheckReport): boolean {
  return report.unmapped.length > 0 || report.dangling.length > 0 || report.notCaseByCase.length > 0
}
