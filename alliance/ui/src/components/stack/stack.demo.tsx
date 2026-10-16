'use client';

import { Stack } from '#ui/index.js';

const cell = {
  padding: 12,
  border: '1px dashed currentColor',
} as const;

export function StackDemo() {
  return (
    <Stack gap={3}>
      <div style={cell}>第一项</div>
      <div style={cell}>第二项</div>
    </Stack>
  );
}
