import { Fragment, type ReactNode } from 'react';
import { cx } from '#ui/base/class-name.js';
import styles from './rich-text.module.css';

/** A run of an official description: plain text, or text under a style tag. */
export interface RichRun {
  readonly text: string;
  /** The tag's style id, such as `ba.vup`, or `term` for a `<$…>` glossary term. */
  readonly style: string | null;
  readonly term?: string;
}

const TOKEN = /<([@$])([^>]+)>|<\/>|\n/g;

/** Splits the official description markup (`<@ba.vup>+10%</>`, `<$ba.stun>Stun</>`) into runs. */
export function parseRichText(source: string): readonly RichRun[] {
  const runs: RichRun[] = [];
  const stack: { style: string; term?: string }[] = [];
  let at = 0;
  const push = (text: string): void => {
    if (!text) {
      return;
    }
    const top = stack.at(-1);
    runs.push(
      top
        ? { text, style: top.style, ...(top.term ? { term: top.term } : {}) }
        : { text, style: null },
    );
  };
  for (const match of source.matchAll(TOKEN)) {
    push(source.slice(at, match.index));
    at = match.index + match[0].length;
    if (match[0] === '\n') {
      runs.push({ text: '\n', style: null });
    } else if (match[0] === '</>') {
      stack.pop();
    } else if (match[1] === '$') {
      stack.push({ style: 'term', term: match[2] ?? '' });
    } else {
      stack.push({ style: match[2] ?? '' });
    }
  }
  push(source.slice(at));
  return runs;
}

/** Kind of a style id; an unknown style shows as a keyword. */
function kindOf(style: string): string {
  if (style === 'term') {
    return 'term';
  }
  if (/vup|up$/.test(style)) {
    return 'positive';
  }
  if (/vdown|down$|rem/.test(style)) {
    return 'negative';
  }
  if (/value|num/.test(style)) {
    return 'value';
  }
  return 'keyword';
}

/** An official description with its styles; `{name}` placeholders must be filled by the caller. */
export function RichText({
  source,
  renderTerm,
}: {
  readonly source: string;
  /** Wraps a glossary term, such as in a tooltip with its explanation. */
  readonly renderTerm?: (term: string, text: ReactNode) => ReactNode;
}) {
  return (
    <span className={cx(styles.rich)}>
      {parseRichText(source).map((run, index) => {
        const key = `${index}:${run.text}`;
        if (run.text === '\n') {
          return <br key={key} />;
        }
        if (run.style === null) {
          return <Fragment key={key}>{run.text}</Fragment>;
        }
        const body = (
          <span className={cx(styles.richRun)} data-kind={kindOf(run.style)}>
            {run.text}
          </span>
        );
        return (
          <Fragment key={key}>
            {run.term && renderTerm ? renderTerm(run.term, body) : body}
          </Fragment>
        );
      })}
    </span>
  );
}
