// @vitest-environment jsdom

import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { IntentBus } from '../../infra/intent/bus.js';
import { t } from '../../infra/text/index.js';
import { renderPart } from '../support/part.js';

afterEach(cleanup);

const bus: IntentBus = {
  dispatch: async () => ({ ok: true, reply: { t: 'ok' } }),
  preview: () => null,
  onOutcome: () => () => {},
};

describe('guide pager', () => {
  it('turns pages with the buttons and the arrow keys, and wraps around', () => {
    renderPart('core:guide.pager');
    const position = (page: number) =>
      screen.getByText(t('core:guide.position', { page, total: 19 }));
    expect(position(1)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: t('core:guide.next') }));
    expect(position(2)).toBeTruthy();
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(position(19)).toBeTruthy();
  });
});

describe('loadout roster', () => {
  it('says so when no operator can be adjusted', () => {
    renderPart('core:loadout.roster', { bus });
    expect(screen.getByText(t('core:loadout.empty'))).toBeTruthy();
    expect(screen.getByText(t('core:loadout.pick'))).toBeTruthy();
  });
});
