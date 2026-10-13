import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useStore } from 'zustand';
import { useSession } from '../infra/store/hook.js';
import { presenceStore } from '../infra/store/presence.js';
import { useText } from '../infra/text/index.js';
import { cx } from '../infra/theme/class-name.js';
import { DefaultError } from '../part/boundary.js';
import { answerConfirm, openSettings, overlayStore } from '../part/overlay.js';
import { definePart, Part } from '../part/registry.js';
import { type PartInsert, Slot } from '../part/slot.js';
import { PartTabs } from '../part/tabs.js';
import { Badge, Button, Dialog, Modal } from '../ui/index.js';
import { ConnectionBanner } from './banner.js';
import { LeaveRoom } from './leave.js';
import styles from './shell.module.css';
import { Toasts } from './toast.js';

/** Ids of the shell's parts and containers. */
export const SHELL = {
  backdrop: 'core:shell.backdrop',
  nav: 'core:shell.nav',
  banner: 'core:shell.banner',
  overlay: 'core:shell.overlay',
  toast: 'core:shell.toast',
  tooltip: 'core:shell.tooltip',
  confirm: 'core:shell.confirm',
  settings: 'core:shell.settings',
  error: 'core:shell.error',
} as const;

/** The season backdrop under every page. */
function Backdrop() {
  return <div className={cx(styles.backdropArt)} aria-hidden="true" />;
}

function NavLink({
  to,
  children,
}: {
  readonly to: '/' | '/profile' | '/loadout' | '/guide';
  readonly children: ReactNode;
}) {
  return (
    <Link
      to={to}
      className={cx(styles.navLink)}
      activeProps={{ 'aria-current': 'page' }}
    >
      {children}
    </Link>
  );
}

/** The lobby link, or the leave flow while the server holds the player in a room. */
function NavLobby() {
  const t = useText();
  const inRoom = useStore(presenceStore, (state) => 'code' in state.presence);
  return inRoom ? (
    <LeaveRoom />
  ) : (
    <NavLink to="/">{t('core:nav.entry')}</NavLink>
  );
}

function NavProfile() {
  const t = useText();
  return <NavLink to="/profile">{t('core:nav.profile')}</NavLink>;
}

function NavLoadout() {
  const t = useText();
  return <NavLink to="/loadout">{t('core:nav.loadout')}</NavLink>;
}

function NavGuide() {
  const t = useText();
  return <NavLink to="/guide">{t('core:nav.guide')}</NavLink>;
}

const NAV_DEFAULTS: readonly PartInsert[] = [
  { into: SHELL.nav, id: 'core:shell.nav.lobby', order: 10 },
  { into: SHELL.nav, id: 'core:shell.nav.profile', order: 20 },
  {
    into: SHELL.nav,
    id: 'core:shell.nav.loadout',
    order: 30,
    when: { capability: 'loadout' },
  },
  { into: SHELL.nav, id: 'core:shell.nav.guide', order: 40 },
];

/** The shell bar: the title, the backend's mode and the navigation container. */
function Nav() {
  const t = useText();
  const compat = useSession((state) => state.backend?.mode === 'compat');
  return (
    <header className={cx(styles.bar)}>
      <span className={cx(styles.brand)}>{t('core:app.title')}</span>
      {compat ? <Badge tone="warn">{t('core:connection.compat')}</Badge> : null}
      <nav className={cx(styles.nav)} aria-label={t('core:nav.label')}>
        <Slot id={SHELL.nav} defaults={NAV_DEFAULTS} />
      </nav>
    </header>
  );
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

/** The in-match settings overlay: the same `core:profile.*` tabs as the profile page. */
function SettingsOverlay() {
  const t = useText();
  const open = useStore(overlayStore, (state) => state.settings);
  return (
    <Modal isOpen={open} onOpenChange={openSettings}>
      <Dialog
        title={t('core:settings.heading')}
        closeLabel={t('core:common.close')}
        onClose={() => openSettings(false)}
      >
        <PartTabs id="core:profile.tabs" label={t('core:settings.heading')} />
      </Dialog>
    </Modal>
  );
}

const OVERLAY_DEFAULTS: readonly PartInsert[] = [
  { into: SHELL.overlay, id: SHELL.settings, order: 10 },
  { into: SHELL.overlay, id: SHELL.confirm, order: 20 },
];

/** Tooltips render in a portal from their triggers; this layer only fixes where they stack (`--layer-tooltip`). */
function TooltipLayer() {
  return null;
}

/** The five layers of the shell, bottom to top: backdrop, page, bar, overlay, toast. */
export function ShellFrame({
  children,
  bare = false,
}: {
  readonly children: ReactNode;
  /** The match page hides the nav and moves the banner under its top bar. */
  readonly bare?: boolean;
}) {
  return (
    <div className={cx(styles.app)} data-bare={bare || undefined}>
      <div className={cx(styles.backdrop)} data-layer="backdrop">
        <Part id={SHELL.backdrop} />
      </div>
      <div className={cx(styles.barLayer)} data-layer="bar">
        {bare ? null : <Part id={SHELL.nav} />}
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
    definePart(SHELL.nav, Nav, { extensible: true }),
    definePart('core:shell.nav.lobby', NavLobby),
    definePart('core:shell.nav.profile', NavProfile),
    definePart('core:shell.nav.loadout', NavLoadout),
    definePart('core:shell.nav.guide', NavGuide),
    definePart(SHELL.banner, ConnectionBanner, { extensible: true }),
    definePart(SHELL.toast, Toasts, { extensible: true }),
    definePart(SHELL.tooltip, TooltipLayer),
    definePart(SHELL.confirm, Confirm),
    definePart(SHELL.settings, SettingsOverlay, { extensible: true }),
    definePart(SHELL.error, DefaultError),
  ];
  return () => {
    for (const stop of stops) {
      stop();
    }
  };
}
