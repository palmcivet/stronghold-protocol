'use client';

import { Grid } from '#ui/index.js';

const cell = {
  padding: 12,
  border: '1px dashed currentColor',
} as const;

export function GridDemo() {
  return (
    <Grid gap={2} min={160}>
      <div style={cell}>A</div>
      <div style={cell}>B</div>
      <div style={cell}>C</div>
    </Grid>
  );
}
