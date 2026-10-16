import { Button, Dialog, Stack } from '@alliance/ui';
import { useEffect, useState } from 'react';
import type { Recoverable } from '#infra/boot/identity.js';
import { resumeSeat, seatStore } from '#infra/boot/seat.js';
import { useText } from '#infra/text/index.js';

const list = (): readonly Recoverable[] =>
  seatStore.getState().identity?.recoverable() ?? [];

/** Master's 恢复本机对局: the seats of this device's closed tabs, taken back one at a time. */
export function ResumeSeat() {
  const t = useText();
  const [items, setItems] = useState(list);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const refresh = (): void => setItems(list());
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
    refresh();
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);
  if (!items.length) {
    return null;
  }
  const resume = async (item: Recoverable): Promise<void> => {
    setBusy(true);
    const ok = await resumeSeat(item.id);
    setBusy(false);
    setFailed(!ok);
    if (ok) {
      setOpen(false);
    }
  };
  return (
    <>
      <Button onPress={() => setOpen(true)}>{t('core:resume.open')}</Button>
      <Dialog
        isOpen={open}
        onOpenChange={(next) => !busy && setOpen(next)}
        title={t('core:resume.open')}
        closeLabel={t('core:common.cancel')}
      >
        <Stack gap={2}>
          <p>{t('core:resume.hint')}</p>
          {items.map((item) => (
            <Button
              key={item.id}
              isDisabled={busy}
              onPress={() => void resume(item)}
            >
              {t('core:resume.item', {
                name: item.name || t('core:resume.noName'),
                code: item.code || '—',
              })}
            </Button>
          ))}
          {failed ? <p role="status">{t('core:resume.failed')}</p> : null}
        </Stack>
      </Dialog>
    </>
  );
}
