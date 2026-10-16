import { Button, Dialog, Icon } from '@alliance/ui';
import { useState } from 'react';
import { useIntent } from '#infra/intent/context.js';
import { useText } from '#infra/text/index.js';

/**
 * A shared room link never seats the player by itself: join, spectate or go back. The route skips it when the server
 * already has the player in that room.
 */
export function InviteConfirm({
  code,
  onBack,
}: {
  readonly code: string;
  readonly onBack: () => void;
}) {
  const t = useText();
  const intents = useIntent();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const go = async (type: 'room.join' | 'room.spectate'): Promise<void> => {
    setBusy(true);
    const outcome = await intents.dispatch({ type, fields: { code } });
    setBusy(false);
    // once seated the presence follows and the room page replaces this
    setFailed(outcome.ok ? null : outcome.error.message);
  };
  return (
    <Dialog
      isOpen
      onOpenChange={(open) => !open && onBack()}
      title={t('core:invite.title', { code })}
      closeLabel={t('core:invite.back')}
      actions={
        <>
          <Button onPress={onBack}>{t('core:invite.back')}</Button>
          <Button isDisabled={busy} onPress={() => void go('room.spectate')}>
            <Icon name="eye" />
            {t('core:invite.spectate')}
          </Button>
          <Button
            variant="primary"
            isDisabled={busy}
            onPress={() => void go('room.join')}
          >
            {t('core:invite.join')}
          </Button>
        </>
      }
    >
      <p>{t('core:invite.body')}</p>
      {failed ? <p role="status">{failed}</p> : null}
    </Dialog>
  );
}
