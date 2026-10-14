// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { resetWsde } from './index.js';
import { registerPartMount } from './mount.js';
import { listMountedParts, partAtPoint, partFromNode } from './query.js';

afterEach(() => {
  resetWsde();
  document.body.replaceChildren();
});

describe('query', () => {
  it('walks to the nearest data-part ancestor', () => {
    const slot = document.createElement('div');
    slot.setAttribute('data-slot', 'core:room.main');
    const part = document.createElement('div');
    part.setAttribute('data-part', 'core:room.roster');
    const child = document.createElement('span');
    child.textContent = 'x';
    part.appendChild(child);
    slot.appendChild(part);
    document.body.appendChild(slot);

    registerPartMount('core:room.roster', part);
    expect(partFromNode(child)).toBe('core:room.roster');
    expect(partFromNode(part)).toBe('core:room.roster');
    expect(partFromNode(null)).toBeNull();
    expect(listMountedParts()[0]?.slotId).toBe('core:room.main');
  });

  it('partAtPoint returns the topmost part under the point', () => {
    const part = document.createElement('div');
    part.setAttribute('data-part', 'core:shell.banner');
    part.style.cssText =
      'position:fixed;left:10px;top:10px;width:40px;height:40px;';
    document.body.appendChild(part);
    registerPartMount('core:shell.banner', part);

    const original = document.elementsFromPoint;
    document.elementsFromPoint = ((x: number, y: number) => {
      if (x === 20 && y === 20) {
        return [part];
      }
      return [];
    }) as Document['elementsFromPoint'];
    try {
      expect(partAtPoint(20, 20)).toBe('core:shell.banner');
      expect(partAtPoint(0, 0)).toBeNull();
    } finally {
      if (original) {
        document.elementsFromPoint = original;
      } else {
        // jsdom may omit the method
        // @ts-expect-error cleanup stub
        delete document.elementsFromPoint;
      }
    }
  });
});
