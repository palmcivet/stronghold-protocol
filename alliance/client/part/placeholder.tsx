import { cx } from '@alliance/ui';
import type { ReactNode } from 'react';
import { useText } from '#infra/text/index.js';
import styles from './placeholder.module.css';

/** A dashed box that stands in for a part or a picture, marked with its id so a layout can be checked. */
export function Placeholder({
  id,
  children,
}: {
  readonly id: string;
  readonly children?: ReactNode;
}) {
  return (
    <div className={cx(styles.placeholder)} data-placeholder={id}>
      <code>{id}</code>
      {children}
    </div>
  );
}

/** A part that only shows its id. */
export function placeholderPart(id: string) {
  return function PendingPart() {
    const t = useText();
    return (
      <Placeholder id={id}>
        <span>{t('core:part.pending')}</span>
      </Placeholder>
    );
  };
}
