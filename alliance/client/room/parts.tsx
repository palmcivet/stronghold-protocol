import { DIFFICULTIES } from '@alliance/contract/match.js';
import type { SeatView } from '@alliance/contract/server-message.js';
import { useState } from 'react';
import { useIntent } from '../infra/intent/context.js';
import { PAGE } from '../infra/router/page.js';
import { useRoom, useSession } from '../infra/store/hook.js';
import { isHost } from '../infra/store/room.js';
import { lookup, useText } from '../infra/text/index.js';
import { cx } from '../infra/theme/class-name.js';
import { definePart, Part } from '../part/registry.js';
import { insertPart, type PartInsert, Slot } from '../part/slot.js';
import {
  Avatar,
  Badge,
  Button,
  ChoiceGroup,
  Cluster,
  DifficultyTag,
  EmptyState,
  Icon,
  Muted,
  Panel,
  Region,
  Stack,
  Switch,
} from '../ui/index.js';
import { ROOM_ACTIONS } from './actions.js';
import styles from './room.module.css';

export const ROOM = {
  header: 'core:room.header',
  roster: 'core:room.roster',
  seat: 'core:room.seat',
  host: 'core:room.host',
  spectators: 'core:room.spectators',
  main: 'core:room.main',
  side: 'core:room.side',
  actions: 'core:room.actions',
  below: 'core:room.below',
} as const;

/** Copies text; false when the clipboard refuses. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Room code, invite copy, mode and difficulty. */
function Header() {
  const t = useText();
  const room = useRoom((state) => state.room);
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  if (!room) {
    return null;
  }
  const link = `${globalThis.location?.origin ?? ''}/room/${room.code}`;
  const copy = async (what: 'code' | 'link'): Promise<void> => {
    if (await copyText(what === 'code' ? room.code : link)) {
      setCopied(what);
    }
  };
  return (
    <header className={cx(styles.header)}>
      <Stack gap={1}>
        <Muted>{t('core:lobby.code')}</Muted>
        <h1 className={cx(styles.code)}>{room.code}</h1>
      </Stack>
      <Cluster gap={2}>
        <Badge tone="accent">{lookup(`core:lobby.mode.${room.mode}`)}</Badge>
        <DifficultyTag
          id={room.difficulty.toLowerCase()}
          label={lookup(`core:difficulty.${room.difficulty}`)}
        />
      </Cluster>
      <Cluster gap={2}>
        <Button onPress={() => void copy('code')}>
          <Icon name="copy" />
          {t('core:room.copyCode')}
        </Button>
        <Button onPress={() => void copy('link')}>
          <Icon name="link" />
          {t('core:room.copyLink')}
        </Button>
        {copied ? <span role="status">{t('core:room.copied')}</span> : null}
      </Cluster>
    </header>
  );
}

/** One seat: avatar, name, ready, AI, host, offline; the host may remove an AI teammate. */
function Seat({
  seat,
  index,
}: {
  readonly seat: SeatView | null;
  readonly index: number;
}) {
  const t = useText();
  const intents = useIntent();
  const room = useRoom((state) => state.room);
  const playerId = useSession((state) => state.playerId);
  if (!room) {
    return null;
  }
  if (!seat) {
    return (
      <li className={cx(styles.seat)} data-empty>
        <span className={cx(styles.seatIndex)}>{index + 1}</span>
        <Muted>{t('core:room.empty')}</Muted>
      </li>
    );
  }
  const host = isHost(room, playerId);
  return (
    <li className={cx(styles.seat)}>
      <span className={cx(styles.seatIndex)}>{index + 1}</span>
      <Avatar
        name={seat.name}
        framed={seat.playerId === playerId}
        off={!seat.connected}
      />
      <Stack gap={1}>
        <strong>{seat.name}</strong>
        <Cluster gap={1}>
          {seat.playerId === room.hostId ? (
            <Badge tone="gold">{t('core:room.host')}</Badge>
          ) : null}
          {seat.isBot ? (
            <Badge tone="info">
              <Icon name="bot" /> {t('core:room.bot')}
            </Badge>
          ) : null}
          {seat.connected ? null : (
            <Badge tone="danger">{t('core:room.offline')}</Badge>
          )}
          {room.mode === 'coop' && !seat.isBot ? (
            <Badge tone={seat.ready ? 'accent' : 'neutral'}>
              {seat.ready ? t('core:room.ready') : t('core:room.notReady')}
            </Badge>
          ) : null}
        </Cluster>
      </Stack>
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
    </li>
  );
}

function Roster() {
  const t = useText();
  const seats = useRoom((state) => state.room?.seats ?? null);
  if (!seats) {
    return null;
  }
  return (
    <Panel title={t('core:room.seats')}>
      <ul className={cx(styles.roster)}>
        {seats.map((seat, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: a seat is its index
          <Part key={index} id={ROOM.seat} seat={seat} index={index} />
        ))}
      </ul>
    </Panel>
  );
}

/** The host's controls: difficulty and, in co-op, the AI teammates. Others see the settings read-only. */
function HostControls() {
  const t = useText();
  const intents = useIntent();
  const room = useRoom((state) => state.room);
  const playerId = useSession((state) => state.playerId);
  if (!room) {
    return null;
  }
  const host = isHost(room, playerId);
  const bots = room.seats.filter((seat) => seat?.isBot).length;
  const free = room.seats.some((seat) => seat === null);
  return (
    <Panel title={t('core:room.settings')}>
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
      {room.mode === 'coop' ? (
        <>
          <Cluster>
            <span>{t('core:room.bots', { count: bots })}</span>
            <Button
              aria-label={t('core:room.addBot')}
              isDisabled={!host || !free}
              onPress={() => void intents.dispatch({ type: 'room.addBot' })}
            >
              <Icon name="plus" />
            </Button>
          </Cluster>
          <Switch
            isSelected={room.aiPicksLast === true}
            onChange={(on) =>
              void intents.dispatch({
                type: 'room.setAiPicksLast',
                fields: { on },
              })
            }
          >
            {t('core:room.aiPicksLast')}
          </Switch>
        </>
      ) : null}
      {host ? null : <Muted>{t('core:room.hostOnly')}</Muted>}
    </Panel>
  );
}

function Spectators() {
  const t = useText();
  const intents = useIntent();
  const room = useRoom((state) => state.room);
  const playerId = useSession((state) => state.playerId);
  if (!room) {
    return null;
  }
  const host = isHost(room, playerId);
  return (
    <Panel title={t('core:room.spectators')} level={3}>
      {room.spectators.length === 0 ? (
        <EmptyState title={t('core:room.noSpectators')} icon="eye" />
      ) : (
        <Stack as="ul" gap={2}>
          {room.spectators.map((spectator) => (
            <li key={spectator.playerId} className={cx(styles.spectator)}>
              <Avatar name={spectator.name} size="sm" />
              <span>{spectator.name}</span>
              {host ? (
                <Button
                  onPress={() =>
                    void intents.dispatch({
                      type: 'room.removeSpectator',
                      fields: { playerId: spectator.playerId },
                    })
                  }
                >
                  {t('core:room.removeBot')}
                </Button>
              ) : null}
            </li>
          ))}
        </Stack>
      )}
    </Panel>
  );
}

const MAIN_DEFAULTS: readonly PartInsert[] = [
  { into: ROOM.main, id: ROOM.roster, order: 10 },
];
const SIDE_DEFAULTS: readonly PartInsert[] = [
  { into: ROOM.side, id: ROOM.host, order: 10 },
  { into: ROOM.side, id: ROOM.spectators, order: 20 },
];

/** The room page: head, main (seats), side (host controls, spectators), action bar, and the area below. */
function RoomLayout() {
  const t = useText();
  const hasRoom = useRoom((state) => state.room !== null);
  if (!hasRoom) {
    return <p role="status">{t('core:common.loading')}</p>;
  }
  return (
    <section data-part={PAGE.room} className={cx(styles.layout)}>
      <Region name="header" className={cx(styles.headRegion)}>
        <Part id={ROOM.header} />
      </Region>
      <Region name="main" className={cx(styles.mainRegion)}>
        <Slot id={ROOM.main} defaults={MAIN_DEFAULTS} />
      </Region>
      <Region name="side" className={cx(styles.sideRegion)}>
        <Slot id={ROOM.side} defaults={SIDE_DEFAULTS} />
      </Region>
      <Region
        name="actions"
        className={cx(styles.actionsRegion)}
        label={t('core:room.actions')}
      >
        <Slot id={ROOM.actions} />
      </Region>
      <Region name="below" className={cx(styles.belowRegion)}>
        <Slot id={ROOM.below} />
      </Region>
    </section>
  );
}

export function registerRoomParts(): readonly (() => void)[] {
  return [
    definePart(PAGE.room, RoomLayout, { extensible: true }),
    definePart(ROOM.header, Header, { extensible: true }),
    definePart(ROOM.roster, Roster, { extensible: true }),
    definePart(ROOM.seat, Seat, { extensible: true }),
    definePart(ROOM.host, HostControls, { extensible: true }),
    definePart(ROOM.spectators, Spectators),
    ...ROOM_ACTIONS.flatMap(({ component, ...action }) => [
      definePart(action.id, component),
      insertPart({ into: ROOM.actions, ...action }),
    ]),
  ];
}
