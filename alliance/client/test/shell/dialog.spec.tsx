// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { initialSession, sessionStore } from '#infra/store/session.js';
import { t } from '#infra/text/index.js';
import {
  closeDialog,
  DIALOG,
  defineDialog,
  dialogStore,
  openDialog,
} from '#part/dialog.js';
import { openSettings } from '#part/overlay.js';
import { definePart, Part, replacePart, wrapPart } from '#part/registry.js';
import { renderPart } from '#test/support/part.js';

afterEach(() => {
  act(() => {
    closeDialog();
  });
  cleanup();
  sessionStore.setState(initialSession());
});

const host = () => render(<Part id="core:shell.dialog" />);

describe('dialog registry', () => {
  it('opens a core dialog in the overlay layer and closes it without touching the address', async () => {
    const before = window.location.href;
    host();
    await act(() => openDialog(DIALOG.guide));
    expect(
      screen.getByRole('dialog', { name: t('core:nav.guide') }),
    ).toBeTruthy();
    expect(
      document.querySelector(`[data-part="${DIALOG.guide}"]`),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: t('core:common.close') }),
    );
    expect(dialogStore.getState().open).toBeNull();
    expect(window.location.href).toBe(before);
  });

  it('closes on Escape and on the back keys', async () => {
    host();
    await act(() => openDialog(DIALOG.profile));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(dialogStore.getState().open).toBeNull();
    await act(() => openDialog(DIALOG.profile));
    fireEvent.keyDown(window, { key: 'GoBack' });
    expect(dialogStore.getState().open).toBeNull();
    await act(() => openDialog(DIALOG.profile));
    fireEvent.mouseUp(window, { button: 3 });
    expect(dialogStore.getState().open).toBeNull();
  });

  it('shares the profile dialog with the in-match settings', async () => {
    host();
    await act(async () => {
      openSettings();
      await Promise.resolve();
    });
    expect(dialogStore.getState().open).toBe(DIALOG.profile);
    expect(
      document.querySelector(`[data-part="${DIALOG.profile}"]`),
    ).toBeTruthy();
  });

  it('lets a mod add a dialog, and replace or wrap a core one', async () => {
    const stops = [
      defineDialog({ id: 'example/chat:dialog.log', title: 'core:nav.guide' }),
      definePart('example/chat:dialog.log', () => <p>chat log</p>),
      wrapPart(DIALOG.guide, ({ Inner }) => (
        <div data-testid="wrapped">
          <Inner />
        </div>
      )),
    ];
    expect(() =>
      defineDialog({ id: DIALOG.guide, title: 'core:nav.guide' }),
    ).toThrow();
    host();
    await act(() => openDialog('example/chat:dialog.log'));
    expect(screen.getByText('chat log')).toBeTruthy();
    await act(() => openDialog(DIALOG.guide));
    expect(screen.getByTestId('wrapped')).toBeTruthy();
    const stopReplace = replacePart(DIALOG.profile, () => <p>own profile</p>);
    await act(() => openDialog(DIALOG.profile));
    expect(screen.getByText('own profile')).toBeTruthy();
    stopReplace();
    for (const stop of stops.reverse()) {
      stop();
    }
    expect(await openDialog('example/chat:dialog.log')).toBe(false);
  });

  it("opens core:dialog.loadout from the briefing's loadout button", async () => {
    sessionStore.setState({
      backend: { mode: 'next', capabilities: { loadout: true } } as never,
    });
    renderPart('core:loadout.briefing');
    fireEvent.click(
      screen.getByRole('button', { name: t('core:room.loadout') }),
    );
    await act(() => Promise.resolve());
    expect(dialogStore.getState().open).toBe(DIALOG.loadout);
  });
});
