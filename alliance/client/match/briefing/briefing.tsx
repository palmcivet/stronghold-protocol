import { useIntent } from '../../infra/intent/context.js';
import { useMatch, useSession } from '../../infra/store/hook.js';
import { dataName, useText } from '../../infra/text/index.js';
import { cx } from '../../infra/theme/class-name.js';
import { Button, Panel } from '../../ui/index.js';
import { Countdown } from '../countdown.js';
import styles from './screen.module.css';

export function BriefingScreen() {
  const t = useText();
  const intents = useIntent();
  const view = useMatch((state) => state.public);
  const playerId = useSession((state) => state.playerId);
  if (!view) {
    return <p role="status">{t('core:common.loading')}</p>;
  }
  const me =
    view.players.find((player) => player.playerId === playerId) ?? null;
  return (
    <div className={cx(styles.screen)}>
      <h1 className={cx(styles.heading)}>{t('core:briefing.heading')}</h1>
      <div className={cx(styles.columns)}>
        <Panel title={dataName('mode', view.modeId)}>
          <p>
            {t('core:briefing.stage')}：{view.stageId ?? '—'}
          </p>
          {view.bossId ? (
            <p>
              {t('core:briefing.boss', {
                round: view.bossRound ?? view.lastRound,
              })}
            </p>
          ) : null}
          {view.factions?.length ? (
            <p>
              {t('core:briefing.factions')}：{view.factions.join('、')}
            </p>
          ) : null}
          {view.bannedChess?.length ? (
            <p className={cx(styles.muted)}>
              {t('core:briefing.banned', { count: view.bannedChess.length })}
            </p>
          ) : null}
        </Panel>
        <Panel title={t('core:match.players')}>
          <ul className={cx(styles.list)}>
            {view.players.map((player) => (
              <li key={player.playerId} className={cx(styles.item)}>
                <span>{player.name}</span>
                <span className={cx(styles.muted)}>
                  {player.ready
                    ? t('core:room.ready')
                    : t('core:room.notReady')}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
      <div className={cx(styles.row)}>
        <Countdown />
        <Button
          variant="primary"
          isDisabled={!me || me.ready}
          onPress={() =>
            void intents.dispatch({
              type: 'g.infoReady',
              fields: { setupRevision: view.setupRevision ?? 0 },
            })
          }
        >
          {me
            ? me.ready
              ? t('core:room.ready')
              : t('core:common.ready')
            : t('core:spectating')}
        </Button>
      </div>
    </div>
  );
}
