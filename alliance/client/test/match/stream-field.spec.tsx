// @vitest-environment jsdom

import type { ServerMessage } from '@alliance/contract/server-message.js';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { applyFrame, resetMatch } from '#infra/store/frame.js';
import { streamStore } from '#infra/store/stream.js';
import { t } from '#infra/text/index.js';
import { StreamField } from '#match/field/stream-field.js';

const frame = (message: Record<string, unknown>): void =>
  act(() => applyFrame(message as unknown as ServerMessage));

afterEach(() => {
  cleanup();
  resetMatch();
});

describe('streamed battle', () => {
  it('draws units, HP, deaths and damage from master snapshots and events', () => {
    render(<StreamField />);
    expect(screen.queryByRole('region')).toBeNull();
    frame({
      t: 'm.field',
      fieldId: 'n:p1',
      kind: 'normal',
      live: true,
      units: [{ id: 1, name: 'Amiya', side: 'ally' }],
    });
    frame({
      t: 'b.ev',
      fieldId: 'n:p1',
      gt: 1,
      ev: [
        ['spawn', { id: 2, name: 'Slug', side: 'enemy' }],
        ['dmg', 2, 120, 'phys'],
      ],
    });
    frame({
      t: 'b.snap',
      fieldId: 'n:p1',
      gt: 1,
      units: [
        [1, 2, 3, 900, 1000, 0, 0, 0, 0],
        [2, 6, 3, 80, 200, 0, 0, 0, 0],
      ],
      killed: 0,
      total: 3,
    });
    const field = screen.getByRole('region', { name: t('core:stream.label') });
    expect(field).toBeTruthy();
    expect(
      screen.getByRole('meter', {
        name: t('core:stream.unit', { name: 'Amiya', hp: 900, max: 1000 }),
      }),
    ).toBeTruthy();
    expect(screen.getByRole('log').textContent).toContain(
      t('core:stream.damage', { name: 'Slug', amount: 120 }),
    );
    const slug = field.querySelector<HTMLElement>('[data-unit="2"]');
    const amiya = field.querySelector<HTMLElement>('[data-unit="1"]');
    expect(Number.parseFloat(slug?.style.left ?? '0')).toBeGreaterThan(
      Number.parseFloat(amiya?.style.left ?? '0'),
    );

    frame({ t: 'b.ev', fieldId: 'n:p1', gt: 2, ev: [['die', 2, 'killed']] });
    frame({
      t: 'b.snap',
      fieldId: 'n:p1',
      gt: 2,
      units: [
        [1, 2, 3, 900, 1000, 0, 0, 0, 0],
        [2, 6, 3, 0, 200, 0, 0, 0, 6],
      ],
      killed: 1,
      total: 3,
    });
    expect(slug?.getAttribute('data-alive')).toBe('false');
    expect(
      screen.getByRole('meter', {
        name: t('core:stream.down', { name: 'Slug' }),
      }),
    ).toBeTruthy();
    expect(screen.getByRole('log').textContent).toContain(
      t('core:stream.death', { name: 'Slug' }),
    );
  });

  it('starts over on a new field and clears with the match', () => {
    frame({ t: 'b.snap', fieldId: 'a', gt: 1, units: [[1, 0, 0, 5, 5]] });
    frame({ t: 'b.ev', fieldId: 'b', gt: 1, ev: [['leak', 9]] });
    expect(streamStore.getState()).toMatchObject({
      fieldId: 'b',
      snapshot: null,
    });
    expect(streamStore.getState().events).toHaveLength(1);
    resetMatch();
    expect(streamStore.getState()).toMatchObject({ fieldId: null, events: [] });
  });

  it('keeps the last snapshot through the settlement and clears it when a new battle starts', () => {
    const snap = {
      t: 'b.snap',
      fieldId: 'n:p1',
      gt: 9,
      units: [[1, 0, 0, 5, 5]],
    };
    frame(snap);
    frame({ t: 'm.public', phase: 'SETTLE', round: 3 });
    expect(streamStore.getState().snapshot?.units).toHaveLength(1);
    frame({ t: 'b.start', battleId: 'b4', fieldId: 'n:p1', kind: 'normal' });
    expect(streamStore.getState().snapshot).toBeNull();
    frame(snap);
    frame({ t: 'm.field', fieldId: 'n:p1', kind: 'normal', live: true });
    expect(streamStore.getState().snapshot).toBeNull();
  });
});
