// @vitest-environment jsdom

import { parseRichText } from '@alliance/ui';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { registerAllParts } from '#infra/boot/parts.js';
import {
  definePart,
  listParts,
  Part,
  replacePart,
  wrapPart,
} from '#part/registry.js';

afterEach(cleanup);

/** Part ids named in the UI inventory (regions and slots excluded: they are containers, not parts). */
const UI_PARTS = [
  'core:shell.backdrop',
  'core:menu.entry',
  'core:shell.banner',
  'core:shell.toast',
  'core:shell.tooltip',
  'core:shell.confirm',
  'core:shell.dialog',
  'core:entry.hero',
  'core:entry.name',
  'core:entry.create',
  'core:entry.join',
  'core:entry.server',
  'core:entry.resume',
  'core:room.header',
  'core:room.roster',
  'core:room.seat',
  'core:room.host',
  'core:room.spectators',
  'core:briefing.stage',
  'core:briefing.boss',
  'core:briefing.factions',
  'core:briefing.ready',
  'core:strategy.grid',
  'core:strategy.detail',
  'core:strategy.order',
  'core:match.field',
  'core:match.topbar',
  'core:match.exit',
  'core:match.round',
  'core:match.lp',
  'core:match.clock',
  'core:match.lens',
  'core:match.intel',
  'core:match.ticker',
  'core:match.bonds',
  'core:match.bond-detail',
  'core:match.effects',
  'core:match.team',
  'core:match.team-row',
  'core:match.shop',
  'core:match.shop-card',
  'core:match.shop-tools',
  'core:match.reward',
  'core:match.detail',
  'core:match.combat',
  'core:match.choice',
  'core:match.equip-replace',
  'core:match.pause',
  'core:match.away',
  'core:match.vote',
  'core:match.emote',
  'core:match.corner',
  'core:match.phase-banner',
  'core:match.info',
  'core:match.stephead',
  'core:result.hero',
  'core:result.player',
  'core:result.actions',
  'core:loadout.roster',
  'core:loadout.detail',
  'core:loadout.ownership',
  'core:loadout.diy',
  'core:dialog.profile',
  'core:dialog.loadout',
  'core:dialog.guide',
];

describe('part registry', () => {
  it('registers every part the UI inventory names', async () => {
    await registerAllParts();
    const known = new Set(listParts());
    expect(UI_PARTS.filter((id) => !known.has(id))).toEqual([]);
  });

  it('replaces and wraps only extensible parts, and refuses a second replacement', () => {
    const undo = [
      definePart('test:open', () => <p>base</p>, { extensible: true }),
      definePart('test:closed', () => <p>closed</p>),
    ];
    expect(() => replacePart('test:closed', () => null)).toThrow();
    expect(() => wrapPart('test:closed', ({ Inner }) => <Inner />)).toThrow();
    const restore = replacePart('test:open', () => <p>new</p>);
    expect(() => replacePart('test:open', () => null)).toThrow();
    const unwrap = wrapPart('test:open', ({ Inner }) => (
      <section aria-label="wrap">
        <Inner />
      </section>
    ));
    render(<Part id="test:open" />);
    expect(screen.getByRole('region', { name: 'wrap' }).textContent).toBe(
      'new',
    );
    unwrap();
    restore();
    for (const u of undo) {
      u();
    }
  });
});

describe('rich text', () => {
  it('splits marked runs from plain text', () => {
    const runs = parseRichText('plain');
    expect(runs.length).toBe(1);
  });
});
