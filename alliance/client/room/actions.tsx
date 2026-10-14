import { useIntent } from '#infra/intent/context.js';
import { useRoom, useSession } from '#infra/store/hook.js';
import { isHost } from '#infra/store/room.js';
import { useText } from '#infra/text/index.js';
import { LeaveRoom } from '#shell/leave.js';
import { Button, Icon, ToggleButton, Tooltip } from '#ui/index.js';
import { roomFacts } from './facts.js';

/** Ready toggle of a seated co-op player who is not the host. */
export function ReadyAction() {
  const t = useText();
  const intents = useIntent();
  const room = useRoom((state) => state.room);
  const { playerId, online } = useSession((state) => ({
    playerId: state.playerId,
    online: state.connection.status === 'online',
  }));
  const me = room?.seats.find((seat) => seat?.playerId === playerId) ?? null;
  if (!me || isHost(room, playerId)) {
    return null;
  }
  return (
    <ToggleButton
      isSelected={me.ready}
      isDisabled={!online}
      onChange={(ready) =>
        void intents.dispatch({ type: 'room.ready', fields: { ready } })
      }
    >
      {me.ready ? t('core:room.ready') : t('core:room.getReady')}
    </ToggleButton>
  );
}

/** Starts the match; only the host sees it, enabled once every other doctor is ready. */
export function StartAction() {
  const t = useText();
  const intents = useIntent();
  const room = useRoom((state) => state.room);
  const { playerId, online } = useSession((state) => ({
    playerId: state.playerId,
    online: state.connection.status === 'online',
  }));
  const canStart = room ? roomFacts(room, playerId, online).canStart : false;
  const button = (
    <Button
      variant="primary"
      isDisabled={!canStart || !online}
      onPress={() => void intents.dispatch({ type: 'room.start' })}
    >
      <Icon name="play" />
      {t('core:room.start')}
    </Button>
  );
  return canStart ? (
    button
  ) : (
    <Tooltip tip={t('core:room.notAllReady')}>{button}</Tooltip>
  );
}

/** A spectator's disabled stand-in for the ready button. */
export function SpectatingAction() {
  const t = useText();
  return (
    <Button isDisabled>
      <Icon name="eye" />
      {t('core:spectating')}
    </Button>
  );
}

/** Leaves the room after the confirmation; a state change, so it stays here and in the match exit. */
export function LeaveAction() {
  return <LeaveRoom />;
}

/** Built-in contributions of `core:room.actions`, defined as parts and inserted in this order. */
export const ROOM_ACTIONS = [
  {
    id: 'core:room.ready',
    order: 20,
    when: { seat: 'player' as const, coop: true },
    component: ReadyAction,
  },
  {
    id: 'core:room.spectating',
    order: 30,
    when: { seat: 'spectator' as const },
    component: SpectatingAction,
  },
  {
    id: 'core:room.start',
    order: 40,
    when: { seat: 'host' as const },
    component: StartAction,
  },
  { id: 'core:room.leave', order: 60, component: LeaveAction },
] as const;
