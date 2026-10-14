import { type ReactNode, useEffect } from 'react';
import { useStore } from 'zustand';
import { lookup, useText } from '#infra/text/index.js';
import { cx } from '#infra/theme/class-name.js';
import { DefaultError } from '#part/boundary.js';
import { BACK_KEYS, closeDialog, dialogStore } from '#part/dialog.js';
import { answerConfirm, overlayStore } from '#part/overlay.js';
import { definePart, Part } from '#part/registry.js';
import { type PartInsert, Slot } from '#part/slot.js';
import { Button, Dialog, Modal } from '#ui/index.js';
import { ConnectionBanner } from './banner.js';
import { MENU_ENTRY, MenuEntry } from './menu.js';
import styles from './shell.module.css';
import { Toasts } from './toast.js';

/** Ids of the shell's parts and containers. */
export const SHELL = {
  backdrop: 'core:shell.backdrop',
  banner: 'core:shell.banner',
  overlay: 'core:shell.overlay',
  toast: 'core:shell.toast',
  tooltip: 'core:shell.tooltip',
  confirm: 'core:shell.confirm',
  dialog: 'core:shell.dialog',
  error: 'core:shell.error',
} as const;

/** The season backdrop under every page. */
function Backdrop() {
  return <div className={cx(styles.backdropArt)} aria-hidden="true" />;
}

/** The shell's confirm and notice dialog, one request at a time. */
function Confirm() {
  const request = useStore(overlayStore, (state) => state.confirms[0] ?? null);
  if (!request) {
    return null;
  }
  return (
    <Modal
      isOpen
      dismissable={request.cancel !== null}
      onOpenChange={(open) => !open && answerConfirm(request.id, false)}
    >
      <Dialog
        role="alertdialog"
        title={request.title}
        actions={
          <>
            {request.cancel === null ? null : (
              <Button onPress={() => answerConfirm(request.id, false)}>
                {request.cancel}
              </Button>
            )}
            <Button
              variant="primary"
              onPress={() => answerConfirm(request.id, true)}
            >
              {request.confirm}
            </Button>
          </>
        }
      >
        {request.body ? <p>{request.body}</p> : null}
      </Dialog>
    </Modal>
  );
}

/**
 * The dialog layer: the dialog showing, its content the part of its id. Escape (the modal) and the back keys close
 * it (the browser back key and the mouse back button; a host's back button calls `closeDialog`); the address stays.
 */
function DialogHost() {
  const t = useText();
  const open = useStore(dialogStore, (state) =>
    state.open
      ? (state.dialogs.find((item) => item.id === state.open) ?? null)
      : null,
  );
  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (event: KeyboardEvent): void => {
      if (BACK_KEYS.includes(event.key) && event.key !== 'Escape') {
        event.preventDefault();
        closeDialog();
      }
    };
    const onPointer = (event: MouseEvent): void => {
      // the mouse's back button
      if (event.button === 3) {
        event.preventDefault();
        closeDialog();
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mouseup', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mouseup', onPointer);
    };
  }, [open]);
  if (!open) {
    return null;
  }
  return (
    <Modal
      isOpen
      size={open.size ?? 'panel'}
      onOpenChange={(next) => !next && closeDialog()}
    >
      <Dialog
        title={lookup(open.title)}
        closeLabel={t('core:common.close')}
        onClose={closeDialog}
      >
        <Part id={open.id} boundary="page" />
      </Dialog>
    </Modal>
  );
}

const OVERLAY_DEFAULTS: readonly PartInsert[] = [
  { into: SHELL.overlay, id: SHELL.dialog, order: 10 },
  { into: SHELL.overlay, id: SHELL.confirm, order: 20 },
];

/** Tooltips render in a portal from their triggers; this layer only fixes where they stack (`--wsde-layer-tooltip`). */
function TooltipLayer() {
  return null;
}

/** The layers of the shell, bottom to top: backdrop, banner, page, overlay, toast. */
export function ShellFrame({
  children,
  bare = false,
}: {
  readonly children: ReactNode;
  /** The match page moves the banner under its top bar. */
  readonly bare?: boolean;
}) {
  return (
    <div className={cx(styles.app)} data-bare={bare || undefined}>
      <div className={cx(styles.backdrop)} data-layer="backdrop">
        <Part id={SHELL.backdrop} />
      </div>
      <div className={cx(styles.barLayer)} data-layer="bar">
        <div className={cx(styles.bannerSlot)}>
          <Part id={SHELL.banner} />
        </div>
      </div>
      <main className={cx(styles.main)} data-layer="main">
        {children}
      </main>
      <div data-layer="overlay">
        <Slot id={SHELL.overlay} defaults={OVERLAY_DEFAULTS} />
      </div>
      <div data-layer="toast">
        <Part id={SHELL.toast} />
        <Part id={SHELL.tooltip} />
      </div>
    </div>
  );
}

/** Registers the shell's parts. */
export function registerShellParts(): () => void {
  const stops = [
    definePart(SHELL.backdrop, Backdrop, { extensible: true }),
    definePart(MENU_ENTRY, MenuEntry, { extensible: true }),
    definePart(SHELL.banner, ConnectionBanner, { extensible: true }),
    definePart(SHELL.toast, Toasts, { extensible: true }),
    definePart(SHELL.tooltip, TooltipLayer),
    definePart(SHELL.confirm, Confirm),
    definePart(SHELL.dialog, DialogHost, { extensible: true }),
    definePart(SHELL.error, DefaultError),
  ];
  return () => {
    for (const stop of stops) {
      stop();
    }
  };
}
