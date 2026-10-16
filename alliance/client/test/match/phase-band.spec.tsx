// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PhaseBand } from '#match/hud/phase-band.js';

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe('phase band', () => {
  it('shows its words as a status', () => {
    render(<PhaseBand title="Combat" micro="ROUND 02" sub="Act in turn" />);
    const band = screen.getByRole('status');
    expect(band.textContent).toContain('ROUND 02');
    expect(band.textContent).toContain('Combat');
    expect(band.textContent).toContain('Act in turn');
    expect(band.getAttribute('data-tone')).toBe('accent');
  });

  it('closes after its duration and says so once', () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(<PhaseBand title="Prep" duration={1000} onDone={onDone} />);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByRole('status').hasAttribute('data-leaving')).toBe(true);
    expect(onDone).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.queryByRole('status')).toBeNull();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('stays without a duration', () => {
    vi.useFakeTimers();
    render(<PhaseBand title="Prep" />);
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByRole('status')).toBeTruthy();
  });
});
