import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useStore } from 'zustand';
import { leftRoom } from '#infra/boot/presence.js';
import { useIntent } from '#infra/intent/context.js';
import { presenceStore } from '#infra/store/presence.js';
import { useText } from '#infra/text/index.js';
import { Button, Dialog, Modal } from '#ui/index.js';

/**
 * Leaves the room the server holds the player in, after a confirmation: sends the leave, waits until the server has
 * let the player go, then shows the entry page.
 */
export function LeaveRoom({ label }: { readonly label?: string } = {}) {
  const t = useText();
  const intents = useIntent();
  const navigate = useNavigate();
  const inMatch = useStore(
    presenceStore,
    (state) => state.presence.kind === 'in-match',
  );
  const [asking, setAsking] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const leave = async (): Promise<void> => {
    setLeaving(true);
    const outcome = await intents.dispatch({ type: 'room.leave' });
    const left = outcome.ok && (await leftRoom());
    setLeaving(false);
    setAsking(false);
    if (left) {
      await navigate({ to: '/' });
    }
  };
  return (
    <>
      <Button onPress={() => setAsking(true)}>
        {label ?? t('core:room.leave')}
      </Button>
      <Modal isOpen={asking} dismissable={!leaving} onOpenChange={setAsking}>
        <Dialog
          role="alertdialog"
          title={t('core:room.leave')}
          actions={
            <>
              <Button isDisabled={leaving} onPress={() => setAsking(false)}>
                {t('core:common.cancel')}
              </Button>
              <Button
                variant="primary"
                isDisabled={leaving}
                onPress={() => void leave()}
              >
                {t('core:common.confirm')}
              </Button>
            </>
          }
        >
          <p>
            {inMatch
              ? t('core:room.leaveMatchConfirm')
              : t('core:room.leaveConfirm')}
          </p>
        </Dialog>
      </Modal>
    </>
  );
}
