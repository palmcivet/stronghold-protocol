'use client';

import { Panel } from '#ui/index.js';

export function PanelDemo() {
  return (
    <Panel
      title="同盟大厅"
      micro="LOBBY"
      tone="amber"
      actions={<span>3 / 4</span>}
    >
      <p>选择模式与难度后创建同盟。</p>
    </Panel>
  );
}

export function PanelGlowDemo() {
  return (
    <Panel title="领袖" micro="LEADER" tone="gold" glow flush>
      <p style={{ padding: 16 }}>带光晕的面板，正文不留内边距。</p>
    </Panel>
  );
}
