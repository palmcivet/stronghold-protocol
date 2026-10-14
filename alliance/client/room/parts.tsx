import { DIFFICULTIES, MAX_SPECTATORS } from '@alliance/contract/match.js';
import type { SeatView } from '@alliance/contract/server-message.js';
import { useState } from 'react';
import { useIntent } from '#infra/intent/context.js';
import { getPlatform } from '#infra/platform/index.js';
import { PAGE } from '#infra/router/page.js';
import {
  useCatalog,
  useRoom,
  useSession,
  useSettings,
} from '#infra/store/hook.js';
import { lookup, useText } from '#infra/text/index.js';
import { cx } from '#infra/theme/class-name.js';
import { PlayerAvatar } from '#part/art.js';
import { difficultyInfo } from '#part/difficulty.js';
import { requestConfirm } from '#part/overlay.js';
import { definePart, Part } from '#part/registry.js';
import { insertPart, type PartInsert, Slot } from '#part/slot.js';
import { MENU_ENTRY } from '#shell/menu.js';
import {
  Badge,
  Button,
  ChoiceGroup,
  Cluster,
  DifficultyTag,
  Icon,
  Muted,
  Panel,
  Region,
  Stack,
  Switch,
  Tooltip,
} from '#ui/index.js';
import { ROOM_ACTIONS } from './actions.js';
import { roomFacts, type SeatState, seatState } from './facts.js';
import styles from './room.module.css';

export const ROOM = {
  header: 'core:room.header',
  roster: 'core:room.roster',
  seat: 'core:room.seat',
  brief: 'core:room.brief',
  host: 'core:room.host',
  status: 'core:room.status',
  spectators: 'core:room.spectators',
  main: 'core:room.main',
  side: 'core:room.side',
  actions: 'core:room.actions',
  below: 'core:room.below',
} as const;

/** Copies text; false when the clipboard refuses. */
async function copyText(text: string): Promise<boolean> {
  if (!getPlatform().clipboardWrite) {
    return false;
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function useFacts() {
  const room = useRoom((state) => state.room);
  const { playerId, online } = useSession((state) => ({
    playerId: state.playerId,
    online: state.connection.status === 'online',
  }));
  return room
    ? { room, playerId, facts: roomFacts(room, playerId, online) }
    : null;
}

/** Mode and difficulty, the latency, and the invite (co-op) or the one-seat note (solo). */
function Header() {
  const t = useText();
  const room = useRoom((state) => state.room);
  const ping = useSession((state) => state.connection.ping);
  const name = useSettings((state) => state.name);
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  if (!room) {
    return null;
  }
  const link = `${globalThis.location?.origin ?? ''}/room/${room.code}`;
  const copy = async (what: 'code' | 'link'): Promise<void> => {
    const text =
      what === 'code'
        ? room.code
        : `${t('core:room.invite', {
            name,
            difficulty: lookup(`core:difficulty.${room.difficulty}`),
          })} ${link}`;
    if (await copyText(text)) {
      setCopied(what);
    }
  };
  return (
    <header className={cx(styles.header)}>
      <Stack gap={1}>
        <h1 className={cx(styles.title)}>
          {lookup(`core:room.title.${room.mode}`)}
          <DifficultyTag
            id={room.difficulty.toLowerCase()}
            label={lookup(`core:difficulty.${room.difficulty}`)}
          />
        </h1>
        {ping === null ? null : (
          <Muted>{t('core:entry.ping', { ms: Math.round(ping) })}</Muted>
        )}
      </Stack>
      {room.mode === 'coop' ? (
        <div className={cx(styles.invite)}>
          <Muted>{t('core:lobby.code')}</Muted>
          <span className={cx(styles.code)}>{room.code}</span>
          <Cluster gap={2}>
            <Button onPress={() => void copy('code')}>
              <Icon name="copy" />
              {t('core:room.copyCode')}
            </Button>
            <Button onPress={() => void copy('link')}>
              <Icon name="link" />
              {t('core:room.copyLink')}
            </Button>
            {copied ? (
              <span role="status">
                {t(
                  copied === 'code'
                    ? 'core:room.copiedCode'
                    : 'core:room.copiedLink',
                  {
                    code: room.code,
                  },
                )}
              </span>
            ) : null}
          </Cluster>
        </div>
      ) : (
        <Muted>{t('core:room.soloNote')}</Muted>
      )}
    </header>
  );
}

const SEAT_STATE: Readonly<
  Record<
    SeatState,
    {
      key:
        | 'core:room.ready'
        | 'core:room.offline'
        | 'core:room.standby'
        | 'core:room.preparing';
      icon: 'check' | 'close' | 'star' | 'refresh';
    }
  >
> = {
  ready: { key: 'core:room.ready', icon: 'check' },
  offline: { key: 'core:room.offline', icon: 'close' },
  host: { key: 'core:room.standby', icon: 'star' },
  waiting: { key: 'core:room.preparing', icon: 'refresh' },
};

/** One seat card: number, host mark, avatar, name, state; the host may add or remove AI teammates and move players out. */
function Seat({
  seat,
  index,
}: {
  readonly seat: SeatView | null;
  readonly index: number;
}) {
  const t = useText();
  const intents = useIntent();
  const known = useFacts();
  const avatar = useSettings((state) => state.avatar);
  if (!known) {
    return null;
  }
  const { room, playerId, facts } = known;
  const number = t('core:room.seatNumber', { index: index + 1 });
  if (!seat) {
    return (
      <li className={cx(styles.seat)} data-empty>
        <span className={cx(styles.seatNo)}>{number}</span>
        <span className={cx(styles.seatArt)}>
          <Muted>{t('core:room.waitingDoctor')}</Muted>
        </span>
        {room.mode === 'coop' && facts.host ? (
          <Button
            onPress={() => void intents.dispatch({ type: 'room.addBot' })}
          >
            <Icon name="bot" />
            {t('core:room.addBot')}
          </Button>
        ) : (
          <Muted>{t('core:room.empty')}</Muted>
        )}
      </li>
    );
  }
  const me = seat.playerId === playerId;
  const state = seatState(room, seat);
  const kick = async (): Promise<void> => {
    const ok = await requestConfirm({
      title: t('core:room.kick'),
      body: t('core:room.kickConfirm', { name: seat.name }),
      confirm: t('core:room.kickOk'),
      cancel: t('core:common.cancel'),
      tone: 'danger',
    });
    if (ok) {
      await intents.dispatch({
        type: 'room.kick',
        fields: { seat: seat.seat, playerId: seat.playerId },
      });
    }
  };
  const { key, icon } = SEAT_STATE[state];
  return (
    <li
      className={cx(styles.seat)}
      data-state={state}
      data-me={me || undefined}
    >
      <span className={cx(styles.seatNo)}>
        {number}
        {seat.playerId === room.hostId ? (
          <Badge tone="gold">
            <Icon name="star" /> {t('core:room.host')}
          </Badge>
        ) : null}
      </span>
      <span className={cx(styles.seatArt)}>
        <PlayerAvatar
          avatar={me ? avatar : null}
          name={seat.name}
          size="lg"
          framed={me}
          off={state === 'offline'}
        />
        {seat.isBot ? (
          <Badge tone="info">
            <Icon name="bot" /> {t('core:room.bot')}
          </Badge>
        ) : null}
      </span>
      <strong>
        {seat.name || t('core:room.doctor')}
        {me ? <Badge tone="accent">{t('core:room.you')}</Badge> : null}
      </strong>
      <Cluster gap={1} justify="between">
        <span className={cx(styles.seatState)}>
          <Icon name={icon} /> {t(key)}
        </span>
        {facts.host && seat.isBot ? (
          <Tooltip tip={t('core:room.removeBot')}>
            <Button
              aria-label={t('core:room.removeBot')}
              onPress={() =>
                void intents.dispatch({
                  type: 'room.removeBot',
                  fields: { seat: seat.seat },
                })
              }
            >
              <Icon name="close" />
            </Button>
          </Tooltip>
        ) : null}
        {facts.host && !seat.isBot && !me ? (
          <Tooltip tip={t('core:room.kick')}>
            <Button
              aria-label={t('core:room.kick')}
              onPress={() => void kick()}
            >
              <Icon name="close" />
            </Button>
          </Tooltip>
        ) : null}
      </Cluster>
    </li>
  );
}

function Roster() {
  const t = useText();
  const seats = useRoom((state) => state.room?.seats ?? null);
  const solo = useRoom((state) => state.room?.mode === 'solo');
  if (!seats) {
    return null;
  }
  // a solo room has one doctor: master shows only the taken seat
  return (
    <ul className={cx(styles.roster)} aria-label={t('core:room.seats')}>
      {seats.map((seat, index) =>
        solo && !seat ? null : (
          // biome-ignore lint/suspicious/noArrayIndexKey: a seat is its index
          <Part key={index} id={ROOM.seat} seat={seat} index={index} />
        ),
      )}
    </ul>
  );
}

/** The solo briefing beside the seat: the difficulty, its effects and round count. */
function SoloBrief() {
  const t = useText();
  const room = useRoom((state) => state.room);
  const modes = useCatalog((state) => state.catalog.modes);
  if (!room) {
    return null;
  }
  const info = difficultyInfo(modes, room.mode, room.difficulty);
  return (
    <Panel
      title={
        info.code
          ? `${lookup(`core:difficulty.${room.difficulty}`)} ${info.code}`
          : lookup(`core:difficulty.${room.difficulty}`)
      }
    >
      <p>{info.desc}</p>
      <ul className={cx(styles.brief)}>
        {info.effects.map((effect) => (
          <li key={effect}>{effect}</li>
        ))}
        {info.rounds === null ? null : (
          <li>
            {t('core:room.rounds', { rounds: info.rounds })}
            {info.hidden ? t('core:room.hiddenCore') : null}
          </li>
        )}
        <li>{t('core:room.soloUntimed')}</li>
      </ul>
    </Panel>
  );
}

/** Difficulty and the AI-picks-last switch: the host sets them, the others see them read-only. */
function HostControls() {
  const t = useText();
  const intents = useIntent();
  const known = useFacts();
  if (!known) {
    return null;
  }
  const { room, facts } = known;
  return (
    <Stack gap={2}>
      <ChoiceGroup
        label={t('core:lobby.difficulty')}
        value={room.difficulty}
        isDisabled={!facts.host}
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
        <Tooltip tip={t('core:room.aiPicksLastHint')}>
          <Switch
            isSelected={room.aiPicksLast === true}
            isDisabled={!facts.host}
            onChange={(on) =>
              void intents.dispatch({
                type: 'room.setAiPicksLast',
                fields: { on },
              })
            }
          >
            {t('core:room.aiPicksLast')}
          </Switch>
        </Tooltip>
      ) : null}
      {facts.host ? null : <Muted>{t('core:room.hostOnly')}</Muted>}
    </Stack>
  );
}

/** Ready count (co-op) and the status line of the room bar. */
function Status() {
  const t = useText();
  const known = useFacts();
  if (!known) {
    return null;
  }
  const { room, facts } = known;
  return (
    <Stack gap={1}>
      {room.mode === 'coop' ? (
        <span>
          {t('core:room.readyCount', {
            ready: facts.readyHumans,
            total: facts.humans.length,
          })}
        </span>
      ) : null}
      <span role="status" data-status={facts.status}>
        {lookup(`core:room.status.${facts.status}`)}
      </span>
    </Stack>
  );
}

/** The spectator seats: who watches, the host may move them out, a spectator may take a free seat. */
function Spectators() {
  const t = useText();
  const intents = useIntent();
  const known = useFacts();
  if (!known) {
    return null;
  }
  const { room, playerId, facts } = known;
  return (
    <Panel title={t('core:room.spectators')} level={3}>
      <Muted>
        {t('core:room.spectatorCount', {
          count: room.spectators.length,
          max: MAX_SPECTATORS,
        })}
      </Muted>
      <Stack as="ul" gap={2}>
        {room.spectators.map((spectator) => (
          <li key={spectator.playerId} className={cx(styles.spectator)}>
            <Icon name={spectator.connected === false ? 'close' : 'eye'} />
            <span>{spectator.name || t('core:room.doctor')}</span>
            {spectator.playerId === playerId ? (
              <Badge tone="accent">{t('core:room.you')}</Badge>
            ) : null}
            {facts.host ? (
              <Button
                aria-label={t('core:room.removeSpectator', {
                  name: spectator.name,
                })}
                onPress={() =>
                  void intents.dispatch({
                    type: 'room.removeSpectator',
                    fields: { playerId: spectator.playerId },
                  })
                }
              >
                <Icon name="close" />
              </Button>
            ) : null}
          </li>
        ))}
      </Stack>
      {facts.spectating && facts.emptySeats > 0 ? (
        <Button
          onPress={() =>
            void intents.dispatch({
              type: 'room.join',
              fields: { code: room.code },
            })
          }
        >
          <Icon name="user" />
          {t('core:room.sit')}
        </Button>
      ) : null}
    </Panel>
  );
}

const MAIN_DEFAULTS: readonly PartInsert[] = [
  { into: ROOM.main, id: ROOM.roster, order: 10 },
  { into: ROOM.main, id: ROOM.brief, order: 20, when: { coop: false } },
];
const SIDE_DEFAULTS: readonly PartInsert[] = [
  { into: ROOM.side, id: ROOM.spectators, order: 10, when: { coop: true } },
];

/** The room page: head, main (seats, solo briefing), side (spectators), the room bar, and the area below. */
function RoomLayout() {
  const t = useText();
  const mode = useRoom((state) => state.room?.mode ?? null);
  if (mode === null) {
    return <p role="status">{t('core:common.loading')}</p>;
  }
  return (
    <section
      data-part={PAGE.room}
      data-mode={mode}
      className={cx(styles.layout)}
    >
      <Region name="header" className={cx(styles.headRegion)}>
        <Part id={ROOM.header} />
        <Part id={MENU_ENTRY} />
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
        <Part id={ROOM.host} />
        <Part id={ROOM.status} />
        <div className={cx(styles.actionButtons)}>
          <Slot id={ROOM.actions} />
        </div>
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
    definePart(ROOM.brief, SoloBrief, { extensible: true }),
    definePart(ROOM.host, HostControls, { extensible: true }),
    definePart(ROOM.status, Status, { extensible: true }),
    definePart(ROOM.spectators, Spectators),
    ...ROOM_ACTIONS.flatMap(({ component, ...action }) => [
      definePart(action.id, component),
      insertPart({ into: ROOM.actions, ...action }),
    ]),
  ];
}
