import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { SyntaxKind } from "typescript/unstable/ast"
import { createScanner } from "typescript/unstable/ast/scanner"

/** 包根目录。 */
export const PACKAGE_ROOT = fileURLToPath(new URL("..", import.meta.url))

const SKIPPED_DIRECTORIES = new Set(["node_modules", "dist", "dist-test"])

export interface SourceFile {
  /** 相对包根、用 / 分隔的路径。 */
  readonly path: string
  readonly text: string
}

export interface SourceToken {
  readonly kind: SyntaxKind
  readonly text: string
  /** 字符串与模板片段的值；其余 token 与 text 相同。 */
  readonly value: string
  readonly line: number
}

export function isTestFile(path: string): boolean {
  return path.startsWith("test/") || path.endsWith(".test.ts") || path.endsWith(".spec.ts")
}

/** 包内全部 .ts 文件，按路径排序。 */
export function packageSources(): readonly SourceFile[] {
  const files: SourceFile[] = []
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) walk(join(directory, entry.name))
        continue
      }
      if (!entry.name.endsWith(".ts") || entry.name.endsWith(".d.ts")) continue
      const absolute = join(directory, entry.name)
      files.push({ path: relative(PACKAGE_ROOT, absolute).split("\\").join("/"), text: readFileSync(absolute, "utf8") })
    }
  }
  walk(PACKAGE_ROOT)
  return files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
}

const VALUE_ENDS = new Set<SyntaxKind>([
  SyntaxKind.Identifier,
  SyntaxKind.NumericLiteral,
  SyntaxKind.BigIntLiteral,
  SyntaxKind.StringLiteral,
  SyntaxKind.NoSubstitutionTemplateLiteral,
  SyntaxKind.TemplateTail,
  SyntaxKind.RegularExpressionLiteral,
  SyntaxKind.CloseParenToken,
  SyntaxKind.CloseBracketToken,
  SyntaxKind.CloseBraceToken,
  SyntaxKind.ThisKeyword,
  SyntaxKind.SuperKeyword,
  SyntaxKind.TrueKeyword,
  SyntaxKind.FalseKeyword,
  SyntaxKind.NullKeyword,
  SyntaxKind.UndefinedKeyword,
])

const TRIVIA = new Set<SyntaxKind>([
  SyntaxKind.WhitespaceTrivia,
  SyntaxKind.NewLineTrivia,
  SyntaxKind.SingleLineCommentTrivia,
  SyntaxKind.MultiLineCommentTrivia,
  SyntaxKind.ConflictMarkerTrivia,
])

/** 用 TypeScript 扫描器切出 token，注释保留，模板与正则按上下文重扫。 */
export function tokenize(text: string): readonly SourceToken[] {
  const scanner = createScanner(false)
  scanner.setText(text)
  const lineStarts: number[] = [0]
  for (let index = 0; index < text.length; index += 1) if (text[index] === "\n") lineStarts.push(index + 1)
  const lineOf = (position: number): number => {
    let low = 0
    let high = lineStarts.length - 1
    while (low < high) {
      const middle = (low + high + 1) >> 1
      if ((lineStarts[middle] ?? 0) <= position) low = middle
      else high = middle - 1
    }
    return low + 1
  }
  const tokens: SourceToken[] = []
  const braces: number[] = []
  let previous: SyntaxKind = SyntaxKind.Unknown
  for (;;) {
    let kind = scanner.scan()
    if (kind === SyntaxKind.EndOfFile) break
    if (kind === SyntaxKind.OpenBraceToken && braces.length > 0) braces[braces.length - 1] = (braces[braces.length - 1] ?? 0) + 1
    if (kind === SyntaxKind.CloseBraceToken && braces.length > 0) {
      const depth = braces[braces.length - 1] ?? 0
      if (depth === 0) {
        kind = scanner.reScanTemplateToken(false)
        if (kind === SyntaxKind.TemplateTail) braces.pop()
      } else braces[braces.length - 1] = depth - 1
    }
    if ((kind === SyntaxKind.SlashToken || kind === SyntaxKind.SlashEqualsToken) && !VALUE_ENDS.has(previous)) {
      kind = scanner.reScanSlashToken()
    }
    if (kind === SyntaxKind.TemplateHead) braces.push(0)
    const literal =
      kind === SyntaxKind.StringLiteral ||
      kind === SyntaxKind.NoSubstitutionTemplateLiteral ||
      kind === SyntaxKind.TemplateHead ||
      kind === SyntaxKind.TemplateMiddle ||
      kind === SyntaxKind.TemplateTail
    tokens.push({
      kind,
      text: scanner.getTokenText(),
      value: literal ? scanner.getTokenValue() : scanner.getTokenText(),
      line: lineOf(scanner.getTokenStart()),
    })
    if (!TRIVIA.has(kind)) previous = kind
  }
  return tokens
}

/** 去掉注释与空白之后的 token。 */
export function significant(tokens: readonly SourceToken[]): readonly SourceToken[] {
  return tokens.filter((token) => !TRIVIA.has(token.kind))
}
