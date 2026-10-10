import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { SyntaxKind } from "typescript/unstable/ast"
import { PACKAGE_ROOT, packageSources, significant, tokenize, type SourceToken } from "#test/source.js"

const REPOSITORY_ROOT = join(PACKAGE_ROOT, "..")
const TRACE_TABLE = join(REPOSITORY_ROOT, "docs/development/trace.md")
const PLANS = join(REPOSITORY_ROOT, "plans")
const PACKAGE_SECTION = "mission-core"

const TRACE_KINDS = ["assumed", "source", "interim"] as const
const MARKER = /^\/\/ TRACE: ([a-z]+\/[a-z0-9-]+(?:, ?[a-z]+\/[a-z0-9-]+)*)$/
const TRACE_ID = /^(assumed|source|interim)\/[a-z0-9-]+$/

/** 注释、测试名与报错文案里不能出现的外部出处与实施期说明。 */
const FORBIDDEN: readonly (readonly [string, RegExp])[] = [
  ["master", /master/i],
  ["legacy", /legacy/i],
  ["upstream", /upstream/i],
  ["[ASSUMED]", /\[ASSUMED\]/],
  ["§ section", /§\s*\d/],
  ["DESIGN §", /DESIGN\s*§/],
  ["server/sim/", /server\/sim\//],
  ["public/js/", /public\/js\//],
  ["shared/", /shared\//],
  ["board3d/", /board3d\//],
  ["script file name", /[\w-]+\.(?:m|c)?js\b/],
  ["TODO", /TODO/],
  ["FIXME", /FIXME/],
  ["暂时", /暂时/],
  ["临时", /临时/],
  ["过渡", /过渡/],
]

const TEST_CALLS = new Set(["test", "it", "describe", "suite", "bench"])

interface Fragment {
  readonly where: "comment" | "test name" | "error message"
  readonly line: number
  readonly text: string
}

function isComment(token: SourceToken): boolean {
  return token.kind === SyntaxKind.SingleLineCommentTrivia || token.kind === SyntaxKind.MultiLineCommentTrivia
}

function isText(token: SourceToken | undefined): boolean {
  return (
    token?.kind === SyntaxKind.StringLiteral ||
    token?.kind === SyntaxKind.NoSubstitutionTemplateLiteral ||
    token?.kind === SyntaxKind.TemplateHead
  )
}

/** 一个调用的首个参数里的文字：字符串、模板的各段。 */
function firstArgument(tokens: readonly SourceToken[], open: number): string {
  const parts: string[] = []
  for (let index = open + 1; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (!token) break
    if (token.kind === SyntaxKind.StringLiteral || token.kind === SyntaxKind.NoSubstitutionTemplateLiteral) {
      parts.push(token.value)
      break
    }
    if (token.kind === SyntaxKind.TemplateHead || token.kind === SyntaxKind.TemplateMiddle) parts.push(token.value)
    else if (token.kind === SyntaxKind.TemplateTail) {
      parts.push(token.value)
      break
    } else if (parts.length === 0) break
  }
  return parts.join(" ")
}

/** 取出注释、测试名（test/it/describe 的首个参数）与报错文案（new …Error 的首个参数）。 */
export function fragments(text: string): readonly Fragment[] {
  const all = tokenize(text)
  const found: Fragment[] = all.filter(isComment).map((token) => ({ where: "comment", line: token.line, text: token.text }))
  const tokens = significant(all)
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (token?.kind !== SyntaxKind.Identifier) continue
    let callee = index
    while (tokens[callee + 1]?.kind === SyntaxKind.DotToken && tokens[callee + 2]?.kind === SyntaxKind.Identifier) callee += 2
    const open = callee + 1
    if (tokens[open]?.kind !== SyntaxKind.OpenParenToken || !isText(tokens[open + 1])) continue
    const isTest = TEST_CALLS.has(token.text) && tokens[index - 1]?.kind !== SyntaxKind.DotToken
    const isError = tokens[index - 1]?.kind === SyntaxKind.NewKeyword && /Error$/.test(tokens[callee]?.text ?? "")
    if (isTest) found.push({ where: "test name", line: token.line, text: firstArgument(tokens, open) })
    if (isError) found.push({ where: "error message", line: token.line, text: firstArgument(tokens, open) })
  }
  return found
}

export interface TraceUse {
  readonly id: string
  readonly line: number
}

/** 文件里的追溯标记，以及写法不对的 TRACE 注释。 */
export function traceMarkers(text: string): { readonly uses: readonly TraceUse[]; readonly malformed: readonly string[] } {
  const uses: TraceUse[] = []
  const malformed: string[] = []
  const lines = text.split("\n")
  for (const token of tokenize(text)) {
    if (!isComment(token) || !token.text.includes("TRACE:")) continue
    const match = MARKER.exec(token.text)
    const lineText = (lines[token.line - 1] ?? "").trim()
    if (!match || lineText !== token.text) {
      malformed.push(`${token.line}: ${token.text}`)
      continue
    }
    for (const id of (match[1] ?? "").split(",")) uses.push({ id: id.trim(), line: token.line })
  }
  return { uses, malformed }
}

/** 说明表里某个包一节的 id。 */
export function tableIds(markdown: string, section: string): readonly string[] {
  const ids: string[] = []
  let inside = false
  for (const line of markdown.split("\n")) {
    if (line.startsWith("## ")) inside = line.slice(3).trim().replaceAll("`", "") === section
    if (!inside) continue
    const cell = /^\|\s*`([^`]+)`\s*\|/.exec(line)
    if (cell?.[1] !== undefined) ids.push(cell[1])
  }
  return ids
}

function planText(): string {
  return readdirSync(PLANS)
    .filter((name) => name.endsWith(".md"))
    .map((name) => readFileSync(join(PLANS, name), "utf8"))
    .join("\n")
}

describe("trace markers", () => {
  const sources = packageSources()

  test("every comment, test name and error message describes the current code", () => {
    const found: string[] = []
    for (const file of sources) {
      for (const fragment of fragments(file.text)) {
        for (const [label, pattern] of FORBIDDEN) {
          if (pattern.test(fragment.text)) found.push(`${file.path}:${fragment.line} ${fragment.where} contains ${label}`)
        }
      }
    }
    expect(found).toEqual([])
  })

  test("markers stand alone on their line in the documented form", () => {
    const found = sources.flatMap((file) => traceMarkers(file.text).malformed.map((item) => `${file.path}:${item}`))
    expect(found).toEqual([])
  })

  test("every assumed and source id is in the table and every table row is referenced", () => {
    const table = tableIds(readFileSync(TRACE_TABLE, "utf8"), PACKAGE_SECTION)
    for (const id of table) expect(TRACE_ID.test(id) && !id.startsWith("interim/"), id).toBe(true)
    const used = new Set(sources.flatMap((file) => traceMarkers(file.text).uses.map((use) => use.id)))
    const documented = [...used].filter((id) => !id.startsWith("interim/"))
    expect(documented.filter((id) => !table.includes(id))).toEqual([])
    expect(table.filter((id) => !used.has(id))).toEqual([])
  })

  test("every interim id is described in the plans", () => {
    const plans = planText()
    const interim = sources.flatMap((file) =>
      traceMarkers(file.text).uses.filter((use) => use.id.startsWith("interim/")).map((use) => `${file.path}:${use.line} ${use.id}`),
    )
    expect(interim.filter((entry) => !plans.includes(entry.split(" ")[1] ?? ""))).toEqual([])
  })

  test("every marker id has a known kind", () => {
    const ids = sources.flatMap((file) => traceMarkers(file.text).uses.map((use) => use.id))
    expect(ids.filter((id) => !TRACE_KINDS.some((kind) => id.startsWith(`${kind}/`)) || !TRACE_ID.test(id))).toEqual([])
  })
})

describe("trace scanner", () => {
  test("reads comments, test names and error messages", () => {
    const text = [
      "// line comment",
      "/* block */",
      'test("a test name", () => {})',
      "describe.skip(`a ${x} suite`, () => {})",
      'throw new RangeError("bad value")',
      'expect(x, "not scanned")',
    ].join("\n")
    expect(fragments(text).map((item) => `${item.where}:${item.text}`)).toEqual([
      "comment:// line comment",
      "comment:/* block */",
      "test name:a test name",
      "test name:a   suite",
      "error message:bad value",
    ])
  })

  test("accepts only a marker alone on its line", () => {
    const text = ["// TRACE: source/a, assumed/b", "const x = 1 // TRACE: source/c", "// TRACE: see the docs"].join("\n")
    const { uses, malformed } = traceMarkers(text)
    expect(uses.map((use) => use.id)).toEqual(["source/a", "assumed/b"])
    expect(malformed).toEqual(["2: // TRACE: source/c", "3: // TRACE: see the docs"])
  })

  test("reads the ids of one package section", () => {
    const markdown = ["## mission-core", "| id | rule |", "|---|---|", "| `source/a` | x |", "## mission-renderer", "| `source/b` | y |"].join("\n")
    expect(tableIds(markdown, "mission-core")).toEqual(["source/a"])
  })
})
