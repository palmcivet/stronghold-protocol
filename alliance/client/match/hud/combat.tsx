import { useIntent } from '../../infra/intent/context.js';
import { useMatch, useSession } from '../../infra/store/hook.js';
import { useText } from '../../infra/text/index.js';
import { cx } from '../../infra/theme/class-name.js';
import { Badge, Button, Cluster, ProgressBar, Stack } from '../../ui/index.js';
import { usePlayback } from '../playback-state.js';
import styles from './hud.module.css';

/** The combat HUD: the battle's progress, the wait for teammates, what is watched, and the way back. */
export function Combat() {
  const t = useText();
  const intents = useIntent();
  const battle = usePlayback((state) => state.battle);
  const playerId = useSession((state) => state.playerId);
  const watch = useSession(
    (state) => state.backend?.capabilities.watchByField ?? false,
  );
  const { fields, players } = useMatch((state) => ({
    fields: state.public?.fields ?? [],
    players: state.public?.players ?? [],
  }));
  const own = players.find((player) => player.playerId === playerId) ?? null;
  const watched = battle
    ? players.find((player) => player.fieldId === battle.fieldId)
    : undefined;
  const done = fields.filter((field) => field.progress?.done).length;
  return (
    <section
      className={cx(styles.combat)}
      aria-label={t('core:combat.heading')}
    >
      <Stack gap={2}>
        {battle && battle.total > 0 ? (
          <ProgressBar
            label={
              battle.done
                ? t('core:playback.ended')
                : t('core:playback.running')
            }
            value={battle.killed}
            max={battle.total}
            valueText={t('core:playback.progress', {
              killed: battle.killed,
              total: battle.total,
            })}
          />
        ) : (
          <span role="status">
            {battle?.mode === 'server'
              ? t('core:playback.server')
              : t('core:playback.running')}
          </span>
        )}
        {fields.length > 1 ? (
          <ProgressBar
            label={t('core:combat.waiting')}
            value={done}
            max={fields.length}
            valueText={`${done}/${fields.length}`}
          />
        ) : null}
      </Stack>
      <Cluster gap={2}>
        {watched && watched.playerId !== playerId ? (
          <Badge tone="accent">
            {t('core:watch.field', { name: watched.name })}
          </Badge>
        ) : null}
        {watch && own?.fieldId && battle && battle.fieldId !== own.fieldId ? (
          <Button
            onPress={() =>
              void intents.dispatch({
                type: 'g.watch',
                fields: { fieldId: own.fieldId },
              })
            }
          >
            {t('core:watch.own')}
          </Button>
        ) : null}
        {watch
          ? fields
              .filter(
                (field) =>
                  field.fieldId !== battle?.fieldId && field.kind !== 'solo',
              )
              .map((field) => (
                <Button
                  key={field.fieldId}
                  onPress={() =>
                    void intents.dispatch({
                      type: 'g.watch',
                      fields: { fieldId: field.fieldId },
                    })
                  }
                >
                  {t('core:combat.half', { kind: field.kind })}
                </Button>
              ))
          : null}
      </Cluster>
    </section>
  );
}
