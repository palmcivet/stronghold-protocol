'use client';

import { ICON_NAMES, Icon } from '#ui/index.js';

export function IconDemo() {
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 24 }}>
      <Icon name="play" />
      <Icon name="shield" label="护盾" />
      <Icon name="chevron-right" />
      <span style={{ color: 'var(--wsde-tone-amber-base)' }}>
        <Icon name="warning" />
      </span>
    </div>
  );
}

export function IconNamesDemo() {
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      {ICON_NAMES.map((name) => (
        <span key={name} style={{ display: 'grid', justifyItems: 'center' }}>
          <Icon name={name} />
          <code style={{ fontSize: 12 }}>{name}</code>
        </span>
      ))}
    </div>
  );
}
