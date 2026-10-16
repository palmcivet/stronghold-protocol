'use client';

import { AvatarFrame } from '#ui/index.js';

export function AvatarFrameDemo() {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      <AvatarFrame
        name="阿米娅"
        size="lg"
        startMark={{ icon: 'crown', tone: 'gold' }}
      />
      <AvatarFrame
        name="凯尔希"
        hue={196}
        active
        endMark={{ icon: 'user', tone: 'accent' }}
      />
      <AvatarFrame name="机器人" hue={38} icon="bot" tag="AI" />
      <AvatarFrame name="" empty />
    </div>
  );
}
