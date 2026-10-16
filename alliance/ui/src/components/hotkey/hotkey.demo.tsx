'use client';

import { Hotkey } from '#ui/index.js';

export function HotkeyDemo() {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <span>攻击</span>
      <Hotkey code="KeyQ" />
      <span>暂停</span>
      <Hotkey code="Digit1" />
    </div>
  );
}
