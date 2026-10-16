// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  BondBadge,
  DifficultyBadge,
  PingBadge,
  TierBadge,
} from '#part/badge.js';

afterEach(cleanup);

describe('ping badge', () => {
  it('colors by how good the link is', () => {
    const tones = [30, 120, 400].map((ms) => {
      const { container, unmount } = render(
        <PingBadge ms={ms} online label={`Ping ${ms}`} offlineText="Offline" />,
      );
      const badge = container.firstElementChild as HTMLElement;
      const tone = badge.getAttribute('data-tone');
      expect(badge.textContent).toContain(String(ms));
      expect(badge.getAttribute('title')).toBe(`Ping ${ms}`);
      unmount();
      return tone;
    });
    expect(tones).toEqual(['accent', 'amber', 'danger']);
  });

  it('shows the offline text without a link', () => {
    render(
      <PingBadge
        ms={null}
        online={false}
        label="Offline"
        offlineText="Offline"
      />,
    );
    const badge = screen.getByTitle('Offline');
    expect(badge.getAttribute('data-tone')).toBe('neutral');
    expect(badge.textContent).toBe('Offline');
  });
});

describe('game badges', () => {
  it('colors a tier and a difficulty by their tokens', () => {
    render(
      <>
        <TierBadge tier={4} label="Tier 4" />
        <DifficultyBadge difficulty="HARD" label="Hard" />
      </>,
    );
    expect(
      screen
        .getByRole('img', { name: 'Tier 4' })
        .style.getPropertyValue('--badge'),
    ).toBe('var(--wsde-color-tier-4)');
    expect(
      screen.getByText('Hard').style.getPropertyValue('--badge'),
    ).toContain('--wsde-color-difficulty-hard');
  });

  it('counts a bond toward its next level, with a halo once it is full', () => {
    render(
      <>
        <BondBadge label="Guard" count={2} next={4} state="on" />
        <BondBadge label="Medic" count={6} state="max" />
      </>,
    );
    const on = screen.getByText('Guard');
    expect(on.textContent).toBe('Guard2/4');
    expect(on.hasAttribute('data-glow')).toBe(false);
    expect(screen.getByText('Medic').getAttribute('data-glow')).toBe('true');
  });
});
