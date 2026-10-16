'use client';

import { useState } from 'react';
import { Button, Dialog } from '#ui/index.js';

export function DialogDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onPress={() => setOpen(true)}>打开对话框</Button>
      <Dialog
        isOpen={open}
        onOpenChange={setOpen}
        title="离开房间"
        micro="CONFIRM"
        tone="danger"
        closeLabel="关闭"
        role="alertdialog"
        actions={
          <>
            <Button variant="ghost" onPress={() => setOpen(false)}>
              取消
            </Button>
            <Button variant="danger" onPress={() => setOpen(false)}>
              离开
            </Button>
          </>
        }
      >
        离开后无法回到本局，确定要离开吗？
      </Dialog>
    </>
  );
}
