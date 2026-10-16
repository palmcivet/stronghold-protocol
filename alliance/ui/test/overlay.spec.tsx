// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Button,
  Dialog,
  Popover,
  PopoverTrigger,
  ToastStack,
  Tooltip,
} from '#ui/index.js';

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe('dialog', () => {
  it('is named by its title, with the micro label above it and the actions below', () => {
    render(
      <Dialog
        isOpen
        onOpenChange={() => {}}
        title="Leave"
        micro="CONFIRM"
        actions={<Button>Stay</Button>}
        closeLabel="Close"
      >
        <p>Sure?</p>
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Leave' });
    expect(dialog.textContent).toContain('CONFIRM');
    expect(screen.getByText('Sure?')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Stay' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
  });

  it('asks to close from its close button', () => {
    const onOpenChange = vi.fn();
    render(
      <Dialog
        isOpen
        onOpenChange={onOpenChange}
        title="Leave"
        closeLabel="Close"
      >
        <p>Sure?</p>
      </Dialog>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows nothing while closed', () => {
    render(
      <Dialog isOpen={false} title="Hidden">
        <p>a</p>
      </Dialog>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('carries the corner marks in its tone, accent unless it names one', () => {
    render(
      <Dialog isOpen title="Plain">
        <p>a</p>
      </Dialog>,
    );
    const plain = screen.getByRole('dialog', { name: 'Plain' });
    expect(plain.classList.contains('wsde-brackets')).toBe(true);
    expect(plain.getAttribute('data-tone')).toBe('accent');
    cleanup();
    render(
      <Dialog isOpen title="Risky" tone="danger" role="alertdialog">
        <p>b</p>
      </Dialog>,
    );
    expect(
      screen
        .getByRole('alertdialog', { name: 'Risky' })
        .getAttribute('data-tone'),
    ).toBe('danger');
  });

  it('has no body without content', () => {
    render(
      <Dialog
        isOpen
        dismissable={false}
        title="Paused"
        actions={<Button>Resume</Button>}
      />,
    );
    const dialog = screen.getByRole('dialog', { name: 'Paused' });
    expect(dialog.querySelector('[class*="body"]')).toBeNull();
    expect(screen.getByRole('button', { name: 'Resume' })).toBeTruthy();
  });

  it('has no close button without a label and a handler', () => {
    render(
      <Dialog isOpen title="Notice">
        <p>Done</p>
      </Dialog>,
    );
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
    expect(screen.getByRole('dialog').querySelector('button')).toBeNull();
  });

  it('takes the frame from its size', () => {
    render(
      <Dialog isOpen size="wide" title="Guide">
        <p>text</p>
      </Dialog>,
    );
    const frame = screen.getByRole('dialog').parentElement;
    expect(frame?.getAttribute('data-size')).toBe('wide');
  });

  it('closes on Escape unless it is not dismissable', () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <Dialog isOpen onOpenChange={onOpenChange} title="Esc">
        <p>x</p>
      </Dialog>,
    );
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    onOpenChange.mockClear();
    rerender(
      <Dialog
        isOpen
        dismissable={false}
        onOpenChange={onOpenChange}
        title="Esc"
      >
        <p>x</p>
      </Dialog>,
    );
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});

describe('popover and tooltip', () => {
  it('shows a tip on keyboard focus of its trigger', async () => {
    render(
      <Tooltip tip="Spends one fund" delay={0}>
        <Button>Refresh</Button>
      </Tooltip>,
    );
    await act(async () => {
      fireEvent.keyDown(document.body, { key: 'Tab' });
      screen.getByRole('button', { name: 'Refresh' }).focus();
    });
    expect(screen.getByRole('tooltip').textContent).toBe('Spends one fund');
  });

  it('reaches a piece of display from the keyboard and reads out its label', async () => {
    render(
      <Tooltip tip="Refreshes every round" label="Round info" delay={0}>
        <span>Round 3</span>
      </Tooltip>,
    );
    const image = screen.getByRole('img', { name: 'Round info' });
    expect(image.getAttribute('tabindex')).toBe('0');
    await act(async () => {
      fireEvent.keyDown(document.body, { key: 'Tab' });
      image.focus();
    });
    expect(screen.getByRole('tooltip').textContent).toBe(
      'Refreshes every round',
    );
  });

  it('opens from its trigger and hands over a way to close', () => {
    render(
      <PopoverTrigger>
        <Button>Menu</Button>
        <Popover label="Actions">
          {(close) => (
            <button type="button" onClick={close}>
              Copy
            </button>
          )}
        </Popover>
      </PopoverTrigger>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    expect(screen.getByRole('dialog', { name: 'Actions' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('names its dialog', () => {
    render(
      <Popover
        label="Bond detail"
        isOpen
        triggerRef={{ current: document.body }}
      >
        <p>3 of 4</p>
      </Popover>,
    );
    expect(screen.getByRole('dialog', { name: 'Bond detail' })).toBeTruthy();
  });
});

describe('toast stack', () => {
  it('gives each toast an icon and the repeat count of a same text', () => {
    render(
      <ToastStack
        label="Toasts"
        toasts={[
          { id: 1, text: 'Saved', tone: 'accent' },
          { id: 2, text: 'Refused', tone: 'danger', count: 3 },
        ]}
      />,
    );
    const saved = screen.getByText('Saved');
    expect(saved.querySelector('svg[data-icon="check"]')).toBeTruthy();
    const refused = screen.getByText('Refused');
    expect(refused.querySelector('svg[data-icon="warning"]')).toBeTruthy();
    expect(refused.textContent).toContain('×3');
  });
});
