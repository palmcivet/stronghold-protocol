// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PartSlot } from '#part/boundary.js';
import { getWsde, resetWsde } from './index.js';
import { registerPartMount, resetMounts } from './mount.js';

afterEach(() => {
  cleanup();
  resetWsde();
});

beforeEach(() => {
  resetWsde();
});

describe('highlight', () => {
  it('toggles filter on and off with default all', () => {
    const api = getWsde();
    expect(api).not.toBeNull();
    expect(api!.isHighlighting()).toBe(false);
    expect(api!.getHighlightTarget()).toBeNull();

    api!.highlight();
    expect(api!.isHighlighting()).toBe(true);
    expect(api!.getHighlightTarget()).toEqual({ type: 'all' });

    api!.highlight({ type: 'part', id: 'core:room.roster' });
    expect(api!.getHighlightTarget()).toEqual({
      type: 'part',
      id: 'core:room.roster',
    });

    api!.clearHighlight();
    expect(api!.isHighlighting()).toBe(false);
    expect(api!.getHighlightTarget()).toBeNull();
  });

  it('lists mounted parts after a PartSlot render', () => {
    const api = getWsde()!;
    render(
      <div data-slot="core:room.main">
        <PartSlot part="core:room.roster">
          <p>roster</p>
        </PartSlot>
      </div>,
    );
    const listed = api.listMountedParts();
    expect(listed.some((part) => part.partId === 'core:room.roster')).toBe(
      true,
    );
    const roster = listed.find((part) => part.partId === 'core:room.roster');
    expect(roster?.slotId).toBe('core:room.main');
    expect(roster?.element.getAttribute('data-part')).toBe('core:room.roster');
  });

  it('registerPartMount / reset clears the snapshot', () => {
    const host = document.createElement('div');
    host.setAttribute('data-part', 'core:test');
    document.body.appendChild(host);
    const stop = registerPartMount('core:test', host);
    expect(getWsde()!.listMountedParts()).toHaveLength(1);
    stop();
    expect(getWsde()!.listMountedParts()).toHaveLength(0);
    registerPartMount('core:test', host);
    resetMounts();
    expect(getWsde()!.listMountedParts()).toHaveLength(0);
    host.remove();
  });
});
