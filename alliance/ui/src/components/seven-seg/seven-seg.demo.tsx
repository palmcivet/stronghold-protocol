'use client';

import { SevenSeg } from '#ui/index.js';

export function SevenSegDemo() {
  return (
    <div style={{ display: 'flex', gap: 16 }}>
      <SevenSeg value="04:21" label="剩余 4 分 21 秒" />
      <SevenSeg value="00:05" warn label="剩余 5 秒" />
    </div>
  );
}
