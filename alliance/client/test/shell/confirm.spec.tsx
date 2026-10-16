// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { overlayStore, requestConfirm } from '#part/overlay.js';
import { Part } from '#part/registry.js';
import { renderPart } from '#test/support/part.js';

afterEach(() => {
  act(() => overlayStore.setState({ confirms: [] }));
  cleanup();
});

describe('confirm dialog', () => {
  it('asks in an alert dialog and answers with the button pressed', async () => {
    renderPart('core:shell.confirm');
    let answer: Promise<boolean> | undefined;
    act(() => {
      answer = requestConfirm({
        title: 'Remove',
        body: 'Remove this player?',
        confirm: 'Remove',
        cancel: 'Keep',
      });
    });
    const dialog = screen.getByRole('alertdialog', { name: 'Remove' });
    expect(dialog.getAttribute('data-tone')).toBe('accent');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Keep' }));
    });
    expect(await answer).toBe(false);
  });

  it('turns the dialog and its confirm button to danger for a dangerous request', async () => {
    render(<Part id="core:shell.confirm" />);
    let answer: Promise<boolean> | undefined;
    act(() => {
      answer = requestConfirm({
        title: 'Leave',
        confirm: 'Leave now',
        cancel: 'Stay',
        tone: 'danger',
      });
    });
    expect(
      screen
        .getByRole('alertdialog', { name: 'Leave' })
        .getAttribute('data-tone'),
    ).toBe('danger');
    const confirm = screen.getByRole('button', { name: 'Leave now' });
    expect(confirm.getAttribute('data-variant')).toBe('danger');
    await act(async () => {
      fireEvent.click(confirm);
    });
    expect(await answer).toBe(true);
  });

  it('is a notice with one button when there is nothing to cancel', () => {
    renderPart('core:shell.confirm');
    act(() => {
      void requestConfirm({ title: 'Notice', confirm: 'OK', cancel: null });
    });
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'OK',
    ]);
  });
});
