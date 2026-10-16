'use client';

import { RichText } from '#ui/index.js';

export function RichTextDemo() {
  return (
    <p>
      <RichText source="攻击力 <@ba.vup>+10%</>，并附加 <$ba.stun>眩晕</> 一回合。" />
    </p>
  );
}
