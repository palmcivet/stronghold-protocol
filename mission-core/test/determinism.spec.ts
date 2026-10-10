import { describe, expect, test } from "vitest"
import { SyntaxKind } from "typescript/unstable/ast"
import { isTestFile, packageSources, significant, tokenize, type SourceToken } from "#test/source.js"

/** 规范允许各引擎给出近似结果的 Math 函数。 */
const APPROXIMATED_MATH = new Set([
  "acos", "acosh", "asin", "asinh", "atan", "atanh", "atan2", "cbrt", "cos", "cosh", "exp", "expm1",
  "hypot", "log", "log1p", "log10", "log2", "pow", "sin", "sinh", "tan", "tanh",
])

/** 读时钟或系统熵的全局成员。 */
const NONDETERMINISTIC_MEMBERS: Readonly<Record<string, ReadonlySet<string>>> = {
  Math: new Set(["random"]),
  Date: new Set(["now"]),
  performance: new Set(["now"]),
  crypto: new Set(["getRandomValues", "randomUUID"]),
}

function member(tokens: readonly SourceToken[], index: number): [string, string] | null {
  const object = tokens[index]
  const dot = tokens[index + 1]
  const property = tokens[index + 2]
  if (object?.kind !== SyntaxKind.Identifier || dot?.kind !== SyntaxKind.DotToken || property?.kind !== SyntaxKind.Identifier) return null
  if (tokens[index - 1]?.kind === SyntaxKind.DotToken) return null
  return [object.text, property.text]
}

function isIntegerLiteral(token: SourceToken | undefined): boolean {
  return token?.kind === SyntaxKind.NumericLiteral && /^\d+$/.test(token.text.replaceAll("_", ""))
}

/** 找出一份源码里会让结果随引擎或时刻变化的用法。 */
function violations(text: string): readonly string[] {
  const tokens = significant(tokenize(text))
  const found: string[] = []
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (!token) continue
    const access = member(tokens, index)
    if (access) {
      const [object, property] = access
      if (object === "Math" && APPROXIMATED_MATH.has(property)) found.push(`${token.line}: Math.${property}`)
      if (NONDETERMINISTIC_MEMBERS[object]?.has(property) === true) found.push(`${token.line}: ${object}.${property}`)
    }
    if (token.kind === SyntaxKind.NewKeyword && tokens[index + 1]?.text === "Date") found.push(`${token.line}: new Date`)
    if (token.kind === SyntaxKind.AsteriskAsteriskToken && !isIntegerLiteral(tokens[index + 1])) found.push(`${token.line}: ** with a non-integer exponent`)
    if (token.kind === SyntaxKind.AsteriskAsteriskEqualsToken) found.push(`${token.line}: **=`)
  }
  return found
}

describe("determinism scan", () => {
  test("finds approximated math, clocks, entropy and non-integer powers", () => {
    const text = [
      "const a = Math.hypot(1, 2)",
      "const b = Math . sin(1)",
      "const c = Math.random()",
      "const d = Date.now() + performance.now()",
      "const e = new Date()",
      "const f = x ** y + x ** 2 + x ** 0.5",
      "const g = Math.sqrt(2) + Math.abs(-1) + vec.Math.pow",
      "// Math.hypot in a comment",
      'const h = "Math.cos in a string"',
    ].join("\n")
    expect(violations(text)).toEqual([
      "1: Math.hypot",
      "2: Math.sin",
      "3: Math.random",
      "4: Date.now",
      "4: performance.now",
      "5: new Date",
      "6: ** with a non-integer exponent",
      "6: ** with a non-integer exponent",
    ])
  })

  test("engine sources use only deterministic math and no clock or entropy", () => {
    const sources = packageSources().filter((file) => !isTestFile(file.path))
    expect(sources.length).toBeGreaterThan(50)
    const found = sources.flatMap((file) => violations(file.text).map((item) => `${file.path}:${item}`))
    expect(found).toEqual([])
  })
})
