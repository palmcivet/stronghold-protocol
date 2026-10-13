import * as v from 'valibot';

// MARK: schema

const text = v.pipe(v.string(), v.trim(), v.minLength(1));

/** `assumed`：沿用参考实现中标为假定的规则或数值；`source`：行为或数值有明确出处。 */
export const TRACE_KINDS = ['assumed', 'source'] as const;
export const TRACE_PACKAGES = ['mission-core', 'mission-renderer'] as const;

const traceId = v.pipe(text, v.regex(/^(assumed|source)\/[a-z0-9-]+$/));

/** 一条追溯记录：引擎里的一条规则、它在上游的出处，以及在 next 里锁住它的用例。 */
export const TraceRuleSchema = v.pipe(
  v.object({
    id: traceId,
    package: v.picklist(TRACE_PACKAGES),
    rule: text,
    /** 规则在包里的代码位置，相对包根。 */
    location: text,
    /** 上游出处：参考实现的文件与设计记录，或官方资料。 */
    source: text,
    basis: text,
    /** 核对状态。 */
    verified: text,
    /** 锁住这条规则的 next 用例，写法与 case-map 一致：`<包>/<测试文件>::<用例名>`。 */
    next: v.array(text),
    /** inventory.json 里对应的上游用例。 */
    upstreamCases: v.optional(v.array(text)),
    /** next 为空时必须写明原因。 */
    gap: v.optional(text),
  }),
  v.check(
    (entry) => entry.next.length > 0 || entry.gap !== undefined,
    'next is empty: list the locking cases or explain the gap',
  ),
);

export const TraceRulesSchema = v.array(TraceRuleSchema);

export type TraceRule = v.InferInput<typeof TraceRuleSchema>;

/** 校验追溯表。失败时返回带路径的问题列表。 */
export function parseTraceRules(
  input: unknown,
): { rules: readonly TraceRule[] } | { issues: readonly string[] } {
  const result = v.safeParse(TraceRulesSchema, input);
  if (!result.success) {
    return {
      issues: result.issues.map((issue) => {
        const path = v.getDotPath(issue);
        return path === null ? issue.message : `${path}: ${issue.message}`;
      }),
    };
  }
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const entry of result.output) {
    if (seen.has(entry.id)) {
      duplicates.push(entry.id);
    }
    seen.add(entry.id);
  }
  return duplicates.length > 0
    ? { issues: duplicates.map((id) => `duplicate id: ${id}`) }
    : { rules: result.output };
}
