import { useIntent } from '../../infra/intent/context.js';
import { useMatch, useSession } from '../../infra/store/hook.js';
import { lookup, useText } from '../../infra/text/index.js';
import { cx } from '../../infra/theme/class-name.js';
import { Button, Panel, ToggleButton } from '../../ui/index.js';
import { Countdown } from '../countdown.js';
import styles from './panel.module.css';

/** Round, phase, own numbers and the match controls. */
export function Hud() {
  const t = useText();
  const intents = useIntent();
  const playerId = useSession((state) => state.playerId);
  const { view, own } = useMatch((state) => ({
    view: state.public,
    own: state.private,
  }));
  if (!view) {
    return null;
  }
  const me =
    view.players.find((player) => player.playerId === playerId) ?? null;
  return (
    <Panel title={lookup(`core:phase.${view.phase}`)}>
      <dl className={cx(styles.stats)}>
        <dt>
          {t('core:match.round', { round: view.round, last: view.lastRound })}
        </dt>
        <dd>
          <Countdown />
        </dd>
        {own ? (
          <>
            <dt>{t('core:match.lp')}</dt>
            <dd>{own.lp}</dd>
            <dt>{t('core:match.funds')}</dt>
            <dd>{own.funds}</dd>
            <dt>
              {t('core:match.deploy', {
                count: own.deployCount,
                cap: own.deployCap,
              })}
            </dt>
            <dd />
          </>
        ) : null}
      </dl>
      {own && me ? (
        <div className={cx(styles.list)}>
          <ToggleButton
            isSelected={own.ready}
            isDisabled={!own.canReady && !own.ready}
            onChange={(ready) =>
              void intents.dispatch({ type: 'g.ready', fields: { ready } })
            }
          >
            {own.ready ? t('core:common.unready') : t('core:common.ready')}
          </ToggleButton>
          <ToggleButton
            isSelected={me.autoplay}
            onChange={(on) =>
              void intents.dispatch({ type: 'g.autoplay', fields: { on } })
            }
          >
            {t('core:match.autoplay')}
          </ToggleButton>
          <Button
            onPress={() => {
              if (window.confirm(t('core:match.leaveConfirm'))) {
                void intents.dispatch({ type: 'g.leave' });
              }
            }}
          >
            {t('core:match.leave')}
          </Button>
        </div>
      ) : (
        <p>{t('core:spectating')}</p>
      )}
    </Panel>
  );
}
