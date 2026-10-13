import { useRouteContext } from '@tanstack/react-router';
import { LobbyScreen } from '../entry/lobby.js';
import { TitleScreen } from '../entry/title.js';
import { PAGE } from '../infra/router/page.js';
import { useSession } from '../infra/store/hook.js';
import { useText } from '../infra/text/index.js';
import { cx } from '../infra/theme/class-name.js';
import styles from '../shell/shell.module.css';
import { Panel } from '../ui/index.js';

function ServerInfo() {
  const t = useText();
  const { mode, ping, status } = useSession((state) => ({
    mode: state.backend?.mode ?? null,
    ping: state.connection.ping,
    status: state.connection.status,
  }));
  return (
    <Panel title={t('core:entry.server')}>
      <p>
        {mode === null
          ? t(`core:entry.status.${status === 'online' ? 'online' : 'offline'}`)
          : t(`core:entry.mode.${mode}`)}
        {ping === null
          ? null
          : ` · ${t('core:entry.ping', { ms: Math.round(ping) })}`}
      </p>
    </Panel>
  );
}

export function EntryPage() {
  const { runtime } = useRouteContext({ from: '__root__' });
  const entered = useSession((state) => state.entered);
  return (
    <section data-part={PAGE.entry} className={cx(styles.page)}>
      <ServerInfo />
      {entered ? <LobbyScreen /> : <TitleScreen api={runtime.api} />}
    </section>
  );
}

/** Waits for the next key and binds it to the action. */
