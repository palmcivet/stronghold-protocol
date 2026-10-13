import { useEffect, useState } from 'react';
import { useConnection } from '../infra/connection/context.js';
import { useSession } from '../infra/store/hook.js';
import { useText } from '../infra/text/index.js';
import { cx } from '../infra/theme/class-name.js';
import { Button } from '../ui/index.js';
import styles from './shell.module.css';

/** Shows the connection state while the session is not online. */
export function ConnectionBanner() {
  const t = useText();
  const connection = useConnection();
  const { status, retryAt, error, entered, everOnline } = useSession(
    (state) => ({
      status: state.connection.status,
      retryAt: state.connection.retryAt,
      error: state.connection.error,
      entered: state.entered,
      everOnline: state.everOnline,
    }),
  );
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (status !== 'reconnecting') {
      return;
    }
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [status]);

  if (!entered || status === 'online') {
    return null;
  }
  let text: string;
  if (status === 'closed') {
    text =
      error?.code === 'REPLACED'
        ? t('core:connection.replaced')
        : t('core:connection.closed');
  } else if (status === 'reconnecting' && retryAt > 0) {
    text = t('core:connection.reconnecting', {
      seconds: Math.max(0, Math.ceil((retryAt - now) / 1000)),
    });
  } else if (error && status === 'connected') {
    text = error.serverText ?? error.code;
  } else if (
    !everOnline ||
    status === 'connecting' ||
    status === 'handshaking'
  ) {
    text = t('core:connection.connecting');
  } else {
    text = t('core:connection.offline');
  }
  return (
    <div role="status" className={cx(styles.banner)}>
      <span>{text}</span>
      {connection && (status === 'reconnecting' || status === 'closed') ? (
        <Button onPress={() => connection.retryNow()}>
          {t('core:connection.retry')}
        </Button>
      ) : null}
    </div>
  );
}
