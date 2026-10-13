import { useIntent } from '../infra/intent/context.js';
import { useRoom, useSession } from '../infra/store/hook.js';
import { isHost } from '../infra/store/room.js';
import { useText } from '../infra/text/index.js';
import { Button, ToggleButton } from '../ui/index.js';

/** Adds an AI teammate while the host has a free seat in a co-op room. */
export function AddBotAction() {
  const t = useText();
  const intents = useIntent();
  const room = useRoom((state) => state.room);
  if (!room?.seats.some((seat) => seat === null)) {
    return null;
  }
  return (
    <Button onPress={() => void intents.dispatch({ type: 'room.addBot' })}>
      {t('core:room.addBot')}
    </Button>
  );
}

/** Ready toggle of a seated co-op player who is not the host. */
export function ReadyAction() {
  const t = useText();
  const intents = useIntent();
  const room = useRoom((state) => state.room);
  const playerId = useSession((state) => state.playerId);
  const me = room?.seats.find((seat) => seat?.playerId === playerId) ?? null;
  if (!me || isHost(room, playerId)) {
    return null;
  }
  return (
    <ToggleButton
      isSelected={me.ready}
      onChange={(ready) =>
        void intents.dispatch({ type: 'room.ready', fields: { ready } })
      }
    >
      {me.ready ? t('core:common.unready') : t('core:common.ready')}
    </ToggleButton>
  );
}

/** Starts the match; only the host sees it. */
export function StartAction() {
  const t = useText();
  const intents = useIntent();
  return (
    <Button
      variant="primary"
      onPress={() => void intents.dispatch({ type: 'room.start' })}
    >
      {t('core:room.start')}
    </Button>
  );
}

/** Leaves the room. */
export function LeaveAction() {
  const t = useText();
  const intents = useIntent();
  return (
    <Button onPress={() => void intents.dispatch({ type: 'room.leave' })}>
      {t('core:room.leave')}
    </Button>
  );
}

/** Built-in contributions of `core:room.actions`. */
export function roomActionDefaults() {
  return [
    {
      into: 'core:room.actions',
      id: 'core:room.addBot',
      order: 10,
      when: { seat: 'host' as const, coop: true },
      component: AddBotAction,
    },
    {
      into: 'core:room.actions',
      id: 'core:room.ready',
      order: 20,
      when: { seat: 'player' as const, coop: true },
      component: ReadyAction,
    },
    {
      into: 'core:room.actions',
      id: 'core:room.start',
      order: 40,
      when: { seat: 'host' as const },
      component: StartAction,
    },
    {
      into: 'core:room.actions',
      id: 'core:room.leave',
      order: 60,
      component: LeaveAction,
    },
  ];
}
