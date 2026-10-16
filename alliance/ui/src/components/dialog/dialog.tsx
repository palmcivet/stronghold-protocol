import type { ReactNode } from 'react';
import {
  Dialog as AriaDialog,
  Heading,
  Modal,
  ModalOverlay,
} from 'react-aria-components';
import { cx } from '#ui/base/class-name.js';
import type { ToneName } from '#ui/base/tone.js';
import { Button } from '#ui/components/button/button.js';
import { Icon } from '#ui/components/icon/icon.js';
import { Text } from '#ui/components/text/text.js';
import styles from './dialog.module.css';

export interface DialogProps {
  readonly isOpen: boolean;
  /** Called with `false` when the dialog asks to close: Escape, a press outside, or the close button. */
  readonly onOpenChange?: (open: boolean) => void;
  /** Escape and a press outside close the dialog. */
  readonly dismissable?: boolean;
  /** The frame: a centred column (default), a large card, or the whole canvas. */
  readonly size?: 'panel' | 'wide' | 'full';
  readonly title: string;
  readonly children?: ReactNode;
  /** English label above the title. */
  readonly micro?: string;
  /** Color of the stripe and the corner marks. */
  readonly tone?: ToneName;
  /** Buttons at the foot of the dialog. */
  readonly actions?: ReactNode;
  /** Label of the close button; without it the dialog has none. */
  readonly closeLabel?: string;
  /** `alertdialog` for a confirmation that needs an answer. */
  readonly role?: 'dialog' | 'alertdialog';
}

/** A centered dialog over a scrim: a hatched stripe, a title, scrolling content and actions, inside corner marks. */
export function Dialog({
  isOpen,
  onOpenChange,
  dismissable = true,
  size = 'panel',
  title,
  children,
  micro,
  tone = 'accent',
  actions,
  closeLabel,
  role = 'dialog',
}: DialogProps) {
  return (
    <ModalOverlay
      isOpen={isOpen}
      {...(onOpenChange ? { onOpenChange } : {})}
      isDismissable={dismissable}
      isKeyboardDismissDisabled={!dismissable}
      className={cx(styles.scrim)}
    >
      <Modal className={cx(styles.modal)} data-size={size}>
        <AriaDialog
          role={role}
          className={cx(styles.dialog, 'wsde-brackets')}
          data-tone={tone}
        >
          <div className={cx(styles.head)}>
            <div className={cx(styles.titles)}>
              {micro ? (
                <Text variant="micro" tone={tone}>
                  {micro}
                </Text>
              ) : null}
              <Heading slot="title" className={cx(styles.title)}>
                {title}
              </Heading>
            </div>
            {closeLabel && onOpenChange ? (
              <Button
                square
                size="sm"
                variant="ghost"
                aria-label={closeLabel}
                onPress={() => onOpenChange(false)}
              >
                <Icon name="close" />
              </Button>
            ) : null}
          </div>
          {children === undefined ? null : (
            <div className={cx(styles.body)}>{children}</div>
          )}
          {actions ? <div className={cx(styles.actions)}>{actions}</div> : null}
        </AriaDialog>
      </Modal>
    </ModalOverlay>
  );
}
