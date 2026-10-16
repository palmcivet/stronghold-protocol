'use client';

import { useState } from 'react';
import { Segmented } from '#ui/index.js';

export function SegmentedDemo() {
  const [difficulty, setDifficulty] = useState('normal');
  const [mode, setMode] = useState('solo');
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Segmented
        label="难度"
        value={difficulty}
        onChange={setDifficulty}
        options={[
          { value: 'funny', label: '简单' },
          { value: 'normal', label: '普通' },
          { value: 'hard', label: '困难' },
          { value: 'abyss', label: '深渊', icon: 'warning' },
        ]}
      />
      <Segmented
        variant="cards"
        label="模式"
        value={mode}
        onChange={setMode}
        options={[
          {
            value: 'solo',
            label: '单人',
            content: (
              <>
                <strong>单人</strong>
                <span>独自挑战</span>
              </>
            ),
          },
          {
            value: 'coop',
            label: '合作',
            content: (
              <>
                <strong>合作</strong>
                <span>与同盟并肩</span>
              </>
            ),
          },
        ]}
      />
    </div>
  );
}
