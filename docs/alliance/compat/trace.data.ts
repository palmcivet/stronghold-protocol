import { TRACE_RULES } from '../../../alliance/compat/upstream/trace/rules.ts';

export interface TraceRow {
  readonly id: string;
  readonly package: string;
  readonly cells: readonly string[];
  readonly next: readonly string[];
  readonly upstreamCases: readonly string[];
  readonly gap: string | null;
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** 把行内代码 `x` 渲染成 <code>，其余转义。 */
function inline(text: string): string {
  return escapeHtml(text).replace(/`([^`]+)`/g, '<code>$1</code>');
}

declare const data: readonly TraceRow[];

export { data };

export default {
  watch: ['../../../alliance/compat/upstream/trace/rules.ts'],
  load(): readonly TraceRow[] {
    return TRACE_RULES.map((entry) => ({
      id: entry.id,
      package: entry.package,
      cells: [
        entry.rule,
        entry.location,
        entry.source,
        entry.basis,
        entry.verified,
      ].map(inline),
      next: entry.next.map(escapeHtml),
      upstreamCases: (entry.upstreamCases ?? []).map(escapeHtml),
      gap: entry.gap === undefined ? null : inline(entry.gap),
    }));
  },
};
