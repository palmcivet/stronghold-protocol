// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PlayerAvatar } from '#part/art.js';
import { LpTower } from '#part/lp-tower.js';

afterEach(cleanup);

describe('player avatar', () => {
  it('marks the host, yourself and a computer teammate', () => {
    const { container } = render(
      <PlayerAvatar name="Doctor" host self bot seat={2} />,
    );
    expect(
      container.querySelector('[data-side="start"]')?.getAttribute('data-tone'),
    ).toBe('gold');
    expect(container.querySelector('[data-side="end"]')).toBeTruthy();
    expect(screen.getByText('AI')).toBeTruthy();
    const frame = screen.getByRole('img', { name: 'Doctor' });
    expect(frame.getAttribute('data-tone')).toBe('accent');
    expect(frame.style.getPropertyValue('--hue')).toBe('38');
  });

  it('greys out a player who is gone', () => {
    render(<PlayerAvatar name="Doctor" offline />);
    expect(
      screen.getByRole('img', { name: 'Doctor' }).getAttribute('data-dimmed'),
    ).toBe('true');
  });
});

describe('lp tower', () => {
  it('reads out its label and turns low at a quarter of the scale', () => {
    const { rerender } = render(<LpTower lp={20} max={20} label="Team LP" />);
    const tower = screen.getByRole('img', { name: 'Team LP' });
    expect(tower.textContent).toBe('20');
    expect(tower.hasAttribute('data-low')).toBe(false);
    rerender(<LpTower lp={5} max={20} label="Team LP" />);
    expect(
      screen.getByRole('img', { name: 'Team LP' }).getAttribute('data-low'),
    ).toBe('true');
  });
});
