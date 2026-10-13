import type { ReactNode } from 'react';
import {
  Dialog as AriaDialog,
  Modal as AriaModal,
  Popover as AriaPopover,
  type PopoverProps as AriaPopoverProps,
  Tooltip as AriaTooltip,
  Heading,
  ModalOverlay,
  TooltipTrigger,
} from 'react-aria-components';
import { cx } from '../infra/theme/class-name.js';
import { Button } from './button.js';
import { Icon } from './icon.js';
import styles from './widget.module.css';

export interface DialogProps {
  readonly title: string;
  readonly children: ReactNode;
  /** Buttons at the foot of the dialog. */
  readonly actions?: ReactNode;
  /** Label of the close button; without it the dialog has none. */
  readonly closeLabel?: string;
  readonly onClose?: () => void;
  /** `alertdialog` for a confirmation that needs an answer. */
  readonly role?: 'dialog' | 'alertdialog';
}

/** The body of a dialog: a title, content and actions. */
export function Dialog({
  title,
  children,
  actions,
  closeLabel,
  onClose,
  role = 'dialog',
}: DialogProps) {
  return (
    <AriaDialog role={role} className={cx(styles.dialog)}>
      <div className={cx(styles.dialogHead)}>
        <Heading slot="title" className={cx(styles.dialogTitle)}>
          {title}
        </Heading>
        {closeLabel && onClose ? (
          <Button aria-label={closeLabel} onPress={onClose}>
            <Icon name="close" />
          </Button>
        ) : null}
      </div>
      <div className={cx(styles.dialogBody)}>{children}</div>
      {actions ? (
        <div className={cx(styles.dialogActions)}>{actions}</div>
      ) : null}
    </AriaDialog>
  );
}

export interface ModalProps {
  readonly isOpen: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  /** Escape and a press outside close the modal. */
  readonly dismissable?: boolean;
  readonly children: ReactNode;
}

/** A centered dialog over a scrim. */
export function Modal({
  isOpen,
  onOpenChange,
  dismissable = true,
  children,
}: ModalProps) {
  return (
    <ModalOverlay
      isOpen={isOpen}
      {...(onOpenChange ? { onOpenChange } : {})}
      isDismissable={dismissable}
      isKeyboardDismissDisabled={!dismissable}
      className={cx(styles.scrim)}
    >
      <AriaModal className={cx(styles.modal)}>{children}</AriaModal>
    </ModalOverlay>
  );
}

/** A full-screen cover over the page, such as a pause or away screen. */
export function Overlay({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className={cx(styles.cover)}
    >
      <div className={cx(styles.coverBody)}>{children}</div>
    </div>
  );
}

export interface PopoverProps
  extends Omit<AriaPopoverProps, 'className' | 'children'> {
  readonly children: ReactNode;
  /** Accessible name of the popover's dialog. */
  readonly label: string;
}

/** A floating panel anchored to its trigger. */
export function Popover({ children, label, ...rest }: PopoverProps) {
  return (
    <AriaPopover {...rest} className={cx(styles.popover)}>
      <AriaDialog aria-label={label} className={cx(styles.popoverBody)}>
        {children}
      </AriaDialog>
    </AriaPopover>
  );
}

/** A tip shown on hover or focus of its only child, which must be focusable. */
export function Tooltip({
  tip,
  children,
  delay = 400,
}: {
  readonly tip: ReactNode;
  readonly children: ReactNode;
  readonly delay?: number;
}) {
  return (
    <TooltipTrigger delay={delay}>
      {children}
      <AriaTooltip className={cx(styles.tooltip)}>{tip}</AriaTooltip>
    </TooltipTrigger>
  );
}

export interface ToastItem {
  readonly id: string | number;
  readonly text: string;
  readonly tone?: 'info' | 'success' | 'warn' | 'error';
  /** Times the same text came in a row. */
  readonly count?: number;
}

/** The stack of toasts. The host owns the queue. */
export function ToastStack({
  toasts,
  label,
}: {
  readonly toasts: readonly ToastItem[];
  readonly label: string;
}) {
  return (
    <div
      role="log"
      aria-live="assertive"
      aria-label={label}
      className={cx(styles.toasts)}
    >
      {toasts.map((toast) => (
        <p
          key={toast.id}
          className={cx(styles.toast)}
          data-tone={toast.tone ?? 'error'}
        >
          {toast.text}
          {toast.count && toast.count > 1 ? (
            <span className={cx(styles.toastCount)}>×{toast.count}</span>
          ) : null}
        </p>
      ))}
    </div>
  );
}
