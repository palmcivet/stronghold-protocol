import { useText } from '#infra/text/index.js';
import { cx } from '#infra/theme/class-name.js';
import { usePlayback } from '#match/playback-state.js';
import { Meter } from '#ui/index.js';
import styles from './field.module.css';

/** What the field shows of a battle it does not draw. */
export function BattleStatus() {
  const t = useText();
  const battle = usePlayback((state) => state.battle);
  if (!battle) {
    return null;
  }
  return (
    <div role="status" className={cx(styles.status)}>
      <p>
        {battle.done
          ? t('core:playback.ended')
          : battle.mode === 'server'
            ? t('core:playback.server')
            : t('core:playback.running')}
      </p>
      {battle.total > 0 ? (
        <Meter
          label={t('core:playback.running')}
          value={battle.killed}
          max={battle.total}
          valueLabel={t('core:playback.progress', {
            killed: battle.killed,
            total: battle.total,
          })}
        />
      ) : null}
    </div>
  );
}
