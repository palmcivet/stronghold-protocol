import { DIFFICULTIES } from '@alliance/contract/match.js';
import { useIntent } from '../infra/intent/context.js';
import { useRoom, useSession } from '../infra/store/hook.js';
import { isHost } from '../infra/store/room.js';
import { lookup, useText } from '../infra/text/index.js';
import { cx } from '../infra/theme/class-name.js';
import { Slot } from '../part/slot.js';
import { Button, ChoiceGroup, Panel } from '../ui/index.js';
import { roomActionDefaults } from './actions.js';
import styles from './screen.module.css';

export function RoomScreen() {
  const t = useText();
  const intents = useIntent();
  const room = useRoom((state) => state.room);
  const playerId = useSession((state) => state.playerId);
  if (!room) {
    return null;
  }
  const host = isHost(room, playerId);

  return (
    <div className={cx(styles.screen)}>
      <h1 className={cx(styles.heading)}>
        {t('core:room.heading', { code: room.code })}
      </h1>
      <div className={cx(styles.columns)}>
        <Panel title={lookup(`core:lobby.mode.${room.mode}`)}>
          <ul className={cx(styles.list)}>
            {room.seats.map((seat, index) => (
              <li
                // biome-ignore lint/suspicious/noArrayIndexKey: a seat is its index
                key={index}
                className={cx(styles.item)}
              >
                {seat ? (
                  <>
                    <span>
                      {seat.name}
                      {seat.playerId === room.hostId
                        ? ` · ${t('core:room.host')}`
                        : ''}
                      {seat.isBot ? ` · ${t('core:room.bot')}` : ''}
                      {seat.connected ? '' : ` · ${t('core:room.offline')}`}
                    </span>
                    <span className={cx(styles.row)}>
                      {room.mode === 'coop' && !seat.isBot ? (
                        <span className={cx(styles.muted)}>
                          {seat.ready
                            ? t('core:room.ready')
                            : t('core:room.notReady')}
                        </span>
                      ) : null}
                      {host && seat.isBot ? (
                        <Button
                          onPress={() =>
                            void intents.dispatch({
                              type: 'room.removeBot',
                              fields: { seat: seat.seat },
                            })
                          }
                        >
                          {t('core:room.removeBot')}
                        </Button>
                      ) : null}
                    </span>
                  </>
                ) : (
                  <span className={cx(styles.muted)}>
                    {t('core:room.empty')}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {room.spectators.length > 0 ? (
            <p className={cx(styles.muted)}>
              {t('core:room.spectators')}：
              {room.spectators.map((spectator) => spectator.name).join('、')}
            </p>
          ) : null}
        </Panel>
        <Panel title={t('core:lobby.difficulty')}>
          <ChoiceGroup
            label={t('core:lobby.difficulty')}
            value={room.difficulty}
            isDisabled={!host}
            onChange={(difficulty) =>
              void intents.dispatch({
                type: 'room.setDifficulty',
                fields: { difficulty },
              })
            }
            options={DIFFICULTIES.map((value) => ({
              value,
              label: lookup(`core:difficulty.${value}`),
            }))}
          />
          <div className={cx(styles.row)}>
            <Slot id="core:room.actions" defaults={roomActionDefaults()} />
          </div>
        </Panel>
      </div>
      <Slot id="core:room.below" />
    </div>
  );
}
