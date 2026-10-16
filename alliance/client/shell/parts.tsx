import { Button, cx, Dialog } from '@alliance/ui';
import { type ReactNode, useEffect } from 'react';
import { useStore } from 'zustand';
import { useArt } from '#infra/resource/art.js';
import { assetsStore } from '#infra/store/assets.js';
import { lookup, useText } from '#infra/text/index.js';
import { DefaultError } from '#part/boundary.js';
import { BACK_KEYS, closeDialog, dialogStore } from '#part/dialog.js';
import { answerConfirm, overlayStore } from '#part/overlay.js';
import { definePart, Part } from '#part/registry.js';
import { type PartInsert, Slot } from '#part/slot.js';
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

/** Full-viewport plate: decoration, and the season image when the pack declares `refs.backdrop`. */
function Backdrop() {
  const resources = useStore(assetsStore, (state) => state.resources);
  const url = useArt(resources?.ref('backdrop') ?? null);
  return (
    <div className={cx(styles.backdropArt)} aria-hidden="true">
      {url ? (
        <img className={cx(styles.backdropImage)} alt="" src={url} />
      ) : null}
    </div>
  );
}

/** The shell's confirm and notice dialog, one request at a time. */
function Confirm() {
  const request = useStore(overlayStore, (state) => state.confirms[0] ?? null);
  if (!request) {
    return null;
  }
  return (
    <Dialog
      isOpen
      dismissable={request.cancel !== null}
      onOpenChange={(open) => !open && answerConfirm(request.id, false)}
      role="alertdialog"
      title={request.title}
      tone={request.tone ?? 'accent'}
      actions={
        <>
          {request.cancel === null ? null : (
            <Button onPress={() => answerConfirm(request.id, false)}>
              {request.cancel}
            </Button>
          )}
          <Button
            variant={request.tone === 'danger' ? 'danger' : 'primary'}
            onPress={() => answerConfirm(request.id, true)}
          >
            {request.confirm}
          </Button>
        </>
      }
    >
      {request.body ? <p>{request.body}</p> : null}
    </Dialog>
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
    <Dialog
      isOpen
      size={open.size ?? 'panel'}
      onOpenChange={(next) => !next && closeDialog()}
      title={lookup(open.title)}
      closeLabel={t('core:common.close')}
    >
      <Part id={open.id} boundary="page" />
    </Dialog>
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

/**
 * Shell layers bottom to top: backdrop, page, banner, overlay, toast.
 * Pages sit on the contain stage. The match field is viewport-fixed so the
 * map fills the bands; `bare` only parks the banner and the toasts under the HUD.
 * Backdrop paints full-bleed under surplus bands outside the stage.
 */
export function ShellFrame({
  children,
  bare = false,
}: {
  readonly children: ReactNode;
  /** The match page moves the banner and the toasts under its top bar. */
  readonly bare?: boolean;
}) {
  const t = useText();
  return (
    <>
      <div className="wsde-rotate" role="status">
        {t('core:shell.rotate')}
      </div>
      <div className={cx(styles.app, 'wsde-app')} data-bare={bare || undefined}>
        <div className={cx(styles.backdrop)} data-layer="backdrop">
          <Part id={SHELL.backdrop} />
        </div>
        <div className="wsde-layout-host">
          <div className="wsde-layout-stage">
            <main className={cx(styles.main)} data-layer="main">
              {children}
            </main>
          </div>
        </div>
        <div data-layer="banner">
          <Part id={SHELL.banner} />
        </div>
        <div data-layer="overlay">
          <Slot id={SHELL.overlay} defaults={OVERLAY_DEFAULTS} />
        </div>
        <div data-layer="toast">
          <Part id={SHELL.toast} />
          <Part id={SHELL.tooltip} />
        </div>
      </div>
    </>
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
