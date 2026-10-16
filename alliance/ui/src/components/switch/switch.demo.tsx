'use client';

import { useState } from 'react';
import { Switch } from '#ui/index.js';

export function SwitchDemo() {
  const [on, setOn] = useState(true);
  return (
    <Switch isSelected={on} onChange={setOn} onText="开" offText="关">
      显示战场提示
    </Switch>
  );
}
