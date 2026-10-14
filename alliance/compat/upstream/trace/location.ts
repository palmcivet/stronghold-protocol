/**
 * Helpers for structured `location` entries: a file under the rule package,
 * and an optional symbol that must appear in that file.
 */

import { SyntaxKind } from 'typescript/unstable/ast';
import { createScanner } from 'typescript/unstable/ast/scanner';

interface Token {
  readonly kind: SyntaxKind;
  readonly text: string;
  /** String and template values; other tokens match `text`. */
  readonly value: string;
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
]);

const TRIVIA = new Set<SyntaxKind>([
  SyntaxKind.WhitespaceTrivia,
  SyntaxKind.NewLineTrivia,
  SyntaxKind.SingleLineCommentTrivia,
  SyntaxKind.MultiLineCommentTrivia,
  SyntaxKind.ConflictMarkerTrivia,
]);

const DECLARATION = new Set<SyntaxKind>([
  SyntaxKind.InterfaceKeyword,
  SyntaxKind.ClassKeyword,
  SyntaxKind.EnumKeyword,
  SyntaxKind.TypeKeyword,
]);

/**
 * Whether `symbol` appears in `content` as syntax. Comments are skipped.
 * A name without `.` matches an identifier or a string literal. A dotted
 * name matches a property or qualified-name chain, or a member of the
 * named interface, class, enum, or type-literal alias.
 */
export function contentHasSymbol(content: string, symbol: string): boolean {
  const segments = symbol.split('.');
  if (segments.some((segment) => segment.length === 0)) {
    return false;
  }
  const tokens = significant(tokenize(content));
  if (segments.length === 1) {
    const [name] = segments;
    return tokens.some(
      (token) =>
        (token.kind === SyntaxKind.Identifier && token.text === name) ||
        (token.kind === SyntaxKind.StringLiteral && token.value === name),
    );
  }
  return (
    chains(tokens).some((chain) => same(chain, segments)) ||
    declares(tokens, segments)
  );
}

function tokenize(text: string): readonly Token[] {
  const scanner = createScanner(false);
  scanner.setText(text);
  const tokens: Token[] = [];
  const braces: number[] = [];
  let previous: SyntaxKind = SyntaxKind.Unknown;
  for (;;) {
    let kind = scanner.scan();
    if (kind === SyntaxKind.EndOfFile) {
      break;
    }
    if (kind === SyntaxKind.OpenBraceToken && braces.length > 0) {
      braces[braces.length - 1] = (braces[braces.length - 1] ?? 0) + 1;
    }
    if (kind === SyntaxKind.CloseBraceToken && braces.length > 0) {
      const depth = braces[braces.length - 1] ?? 0;
      if (depth === 0) {
        kind = scanner.reScanTemplateToken(false);
        if (kind === SyntaxKind.TemplateTail) {
          braces.pop();
        }
      } else {
        braces[braces.length - 1] = depth - 1;
      }
    }
    if (
      (kind === SyntaxKind.SlashToken ||
        kind === SyntaxKind.SlashEqualsToken) &&
      !VALUE_ENDS.has(previous)
    ) {
      kind = scanner.reScanSlashToken();
    }
    if (kind === SyntaxKind.TemplateHead) {
      braces.push(0);
    }
    const literal =
      kind === SyntaxKind.StringLiteral ||
      kind === SyntaxKind.NoSubstitutionTemplateLiteral ||
      kind === SyntaxKind.TemplateHead ||
      kind === SyntaxKind.TemplateMiddle ||
      kind === SyntaxKind.TemplateTail;
    tokens.push({
      kind,
      text: scanner.getTokenText(),
      value: literal ? scanner.getTokenValue() : scanner.getTokenText(),
    });
    if (!TRIVIA.has(kind)) {
      previous = kind;
    }
  }
  return tokens;
}

function significant(tokens: readonly Token[]): readonly Token[] {
  return tokens.filter((token) => !TRIVIA.has(token.kind));
}

function chains(tokens: readonly Token[]): readonly (readonly string[])[] {
  const found: string[][] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (
      token?.kind !== SyntaxKind.Identifier ||
      tokens[index - 1]?.kind === SyntaxKind.DotToken
    ) {
      continue;
    }
    const names = [token.text];
    let cursor = index;
    while (
      tokens[cursor + 1]?.kind === SyntaxKind.DotToken &&
      tokens[cursor + 2]?.kind === SyntaxKind.Identifier
    ) {
      names.push(tokens[cursor + 2]?.text ?? '');
      found.push([...names]);
      cursor += 2;
    }
  }
  return found;
}

function declares(
  tokens: readonly Token[],
  segments: readonly string[],
): boolean {
  const [typeName, memberName] = segments;
  if (
    typeName === undefined ||
    memberName === undefined ||
    segments.length !== 2
  ) {
    return false;
  }
  for (let index = 0; index < tokens.length; index += 1) {
    const keyword = tokens[index];
    const name = tokens[index + 1];
    if (
      keyword === undefined ||
      !DECLARATION.has(keyword.kind) ||
      name?.kind !== SyntaxKind.Identifier ||
      name.text !== typeName
    ) {
      continue;
    }
    const open = bodyOpen(tokens, index + 2);
    if (open === undefined) {
      continue;
    }
    if (memberAtDepthOne(tokens, open, memberName)) {
      return true;
    }
  }
  return false;
}

function bodyOpen(tokens: readonly Token[], from: number): number | undefined {
  let angles = 0;
  let parens = 0;
  for (let index = from; index < tokens.length; index += 1) {
    const kind = tokens[index]?.kind;
    if (kind === SyntaxKind.LessThanToken) {
      angles += 1;
    } else if (kind === SyntaxKind.GreaterThanToken && angles > 0) {
      angles -= 1;
    } else if (kind === SyntaxKind.OpenParenToken) {
      parens += 1;
    } else if (kind === SyntaxKind.CloseParenToken && parens > 0) {
      parens -= 1;
    } else if (
      kind === SyntaxKind.OpenBraceToken &&
      angles === 0 &&
      parens === 0
    ) {
      return index;
    } else if (
      (kind === SyntaxKind.SemicolonToken ||
        kind === SyntaxKind.EqualsGreaterThanToken) &&
      angles === 0 &&
      parens === 0
    ) {
      return undefined;
    }
  }
  return undefined;
}

function memberAtDepthOne(
  tokens: readonly Token[],
  open: number,
  memberName: string,
): boolean {
  let depth = 0;
  for (let index = open; index < tokens.length; index += 1) {
    const kind = tokens[index]?.kind;
    if (kind === SyntaxKind.OpenBraceToken) {
      depth += 1;
      continue;
    }
    if (kind === SyntaxKind.CloseBraceToken) {
      depth -= 1;
      if (depth === 0) {
        return false;
      }
      continue;
    }
    if (
      depth === 1 &&
      kind === SyntaxKind.Identifier &&
      tokens[index]?.text === memberName
    ) {
      const next = tokens[index + 1]?.kind;
      if (
        next === SyntaxKind.QuestionToken ||
        next === SyntaxKind.ColonToken ||
        next === SyntaxKind.OpenParenToken ||
        next === SyntaxKind.CommaToken ||
        next === SyntaxKind.CloseBraceToken ||
        next === SyntaxKind.EqualsToken
      ) {
        return true;
      }
    }
  }
  return false;
}

function same(chain: readonly string[], segments: readonly string[]): boolean {
  return (
    chain.length === segments.length &&
    chain.every((part, index) => part === segments[index])
  );
}
