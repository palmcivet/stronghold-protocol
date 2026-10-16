'use client';

import { Button } from '#ui/index.js';

export function ButtonDemo() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
      <Button variant="primary">主要</Button>
      <Button variant="secondary">次要</Button>
      <Button variant="ghost">幽灵</Button>
      <Button variant="amber">琥珀</Button>
      <Button variant="ice">冰蓝</Button>
      <Button variant="danger">危险</Button>
    </div>
  );
}

export function ButtonSizeDemo() {
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 12,
        alignItems: 'center',
      }}
    >
      <Button size="sm">小</Button>
      <Button size="md">中</Button>
      <Button size="lg">大</Button>
      <Button size="xl" variant="primary" icon="play">
        超大
      </Button>
    </div>
  );
}

export function ButtonIconDemo() {
  return (
    <div style={{ display: 'flex', gap: 12 }}>
      <Button icon="users">加入</Button>
      <Button iconEnd="chevron-right">继续</Button>
      <Button square aria-label="设置" icon="settings" />
    </div>
  );
}

export function BusyButtonDemo() {
  return (
    <Button busy variant="primary" size="lg">
      正在连接
    </Button>
  );
}
