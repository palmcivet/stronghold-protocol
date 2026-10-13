import { resetMatch } from '../../infra/store/frame.js';
import { useMatch, useRoom, useSession } from '../../infra/store/hook.js';
import { dispatchPresence } from '../../infra/store/presence.js';
import { useText } from '../../infra/text/index.js';
import { cx } from '../../infra/theme/class-name.js';
import { Button, Panel } from '../../ui/index.js';
import styles from './screen.module.css';

interface ResultRow {
  readonly playerId?: string;
  readonly name?: string;
  readonly victory?: boolean;
  readonly roundsPassed?: number;
  readonly lp?: number;
}

export function ResultScreen() {
  const t = useText();
  const result = useMatch((state) => state.result);
  const hasRoom = useRoom((state) => state.room !== null);
  const playerId = useSession((state) => state.playerId);
  const rows = Array.isArray(result?.players)
    ? (result.players as readonly ResultRow[])
    : [];
  const victory = result?.victory === true;
  const leave = (): void => {
    resetMatch();
    dispatchPresence({ type: 'leave-result' });
  };
  return (
    <div className={cx(styles.screen)}>
      <h1 className={cx(styles.heading)}>{t('core:result.heading')}</h1>
      {result ? (
        <p role="status" className={cx(victory ? styles.win : styles.loss)}>
          {victory ? t('core:result.cleared') : t('core:result.failed')} ·{' '}
          {t('core:result.round', { round: Number(result.roundsPassed ?? 0) })}
        </p>
      ) : (
        <p role="status">{t('core:common.loading')}</p>
      )}
      <Panel title={t('core:match.players')}>
        <ul className={cx(styles.list)}>
          {rows.map((row, index) => (
            <li key={row.playerId ?? index} className={cx(styles.item)}>
              <strong>
                {row.name ?? row.playerId}
                {row.playerId === playerId ? ' ★' : ''}
              </strong>
              <span className={cx(row.victory ? styles.win : styles.loss)}>
                {row.victory
                  ? t('core:result.cleared')
                  : t('core:result.failed')}
              </span>
              <span className={cx(styles.number)}>
                {t('core:result.round', { round: row.roundsPassed ?? 0 })}
              </span>
              <span className={cx(styles.number)}>
                {t('core:match.lp')} {row.lp ?? 0}
              </span>
            </li>
          ))}
        </ul>
      </Panel>
      <div className={cx(styles.row)}>
        <Button variant="primary" onPress={leave}>
          {hasRoom ? t('core:result.back') : t('core:result.lobby')}
        </Button>
      </div>
    </div>
  );
}
