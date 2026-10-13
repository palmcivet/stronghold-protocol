import { useIntent } from '../../infra/intent/context.js';
import { useMatch, useSession } from '../../infra/store/hook.js';
import { useText } from '../../infra/text/index.js';
import { cx } from '../../infra/theme/class-name.js';
import { Button, Panel } from '../../ui/index.js';
import { usePlayback } from '../playback-state.js';
import styles from './panel.module.css';

/** Players of the match, and the fields that can be watched. */
export function Team() {
  const t = useText();
  const intents = useIntent();
  const { playerId, watch } = useSession((state) => ({
    playerId: state.playerId,
    watch: state.backend?.capabilities.watchByField ?? false,
  }));
  const view = useMatch((state) => state.public);
  const watching = usePlayback((state) => state.battle?.fieldId ?? null);
  if (!view) {
    return null;
  }
  const combat = view.fields.length > 0;
  return (
    <Panel title={t('core:match.players')}>
      <ul className={cx(styles.list)}>
        {view.players.map((player) => (
          <li key={player.playerId} className={cx(styles.line)}>
            <span className={cx(!player.alive && styles.off)}>
              {player.name}
              {player.playerId === playerId ? ' ★' : ''}
            </span>
            <span>
              {t('core:match.lp')} {player.lp}
            </span>
            {watch &&
            combat &&
            player.fieldId &&
            player.fieldId !== watching ? (
              <Button
                onPress={() =>
                  void intents.dispatch({
                    type: 'g.watch',
                    fields: { fieldId: player.fieldId },
                  })
                }
              >
                {player.playerId === playerId
                  ? t('core:watch.own')
                  : t('core:watch.field', { name: player.name })}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </Panel>
  );
}
