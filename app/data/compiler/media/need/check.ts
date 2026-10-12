import { needsListIssuesWithPackTypes } from '#schema/pack-layout.js';

export interface NeedsListText {
  /** Absolute path, as the extractor reports it. */
  readonly path: string;
  readonly text: string;
}

/**
 * The error `extract` prints for the first needs list whose pack type is not in `NEEDS_PACK_TYPES`, or null.
 * The extractor accepts any pack type, so 盟约 checks the type before handing the lists over. A list that fails
 * for another reason first is left to the extractor, which reports it in the same order as before.
 */
export function needsPackTypeError(
  lists: readonly NeedsListText[],
): string | null {
  for (const list of lists) {
    let value: unknown;
    try {
      value = JSON.parse(list.text);
    } catch {
      return null;
    }
    const issues = needsListIssuesWithPackTypes(value);
    if (issues.length === 0) {
      continue;
    }
    if (!issues.some((issue) => issue.path === 'pack.type')) {
      return null;
    }
    return `extract: ${list.path}: invalid needs list: ${issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ')}`;
  }
  return null;
}
