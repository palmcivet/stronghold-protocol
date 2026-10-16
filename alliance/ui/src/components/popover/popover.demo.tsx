'use client';

import { Button, ListBox, Popover, PopoverTrigger } from '#ui/index.js';

export function PopoverDemo() {
  return (
    <PopoverTrigger>
      <Button>更多操作</Button>
      <Popover label="更多操作">
        {(close) => (
          <ListBox
            label="更多操作"
            onAction={() => close()}
            items={[
              { id: 'copy', label: '复制同盟密钥' },
              { id: 'leave', label: '离开房间' },
            ]}
          />
        )}
      </Popover>
    </PopoverTrigger>
  );
}
