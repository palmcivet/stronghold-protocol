import { EMOTE_BUBBLE_MS } from '@alliance/contract/match.js';
import type { PlayerView } from '@alliance/contract/server-message.js';
import { useIntent } from '#infra/intent/context.js';
import { useArt } from '#infra/resource/art.js';
import { useMatch, useMatchCatalog, useSession } from '#infra/store/hook.js';
import { dataName, useText } from '#infra/text/index.js';
import { cx } from '#infra/theme/class-name.js';
import { usePlayback } from '#match/playback-state.js';
import { Part } from '#part/registry.js';
import {
  Avatar,
  Badge,
  Button,
  Icon,
  LpTower,
  Num,
  Tooltip,
} from '#ui/index.js';
import { emoteName } from './emote.js';
import styles from './hud.module.css';

/** Status tone for the glyph beside the LP tower, as master's STATUS_META. */
function statusMeta(
  status: string,
  offline: boolean,
  t: (
    key:
      | 'core:room.offline'
      | 'core:room.ready'
      | 'core:match.deciding'
      | 'core:playback.ended'
      | 'core:match.eliminated'
      | 'core:combat.heading'
      | 'core:match.acting',
  ) => string,
): { readonly tip: string; readonly tone: string } {
  if (offline) {
    return { tip: t('core:room.offline'), tone: 'offline' };
  }
  switch (status) {
    case 'ready':
      return { tip: t('core:room.ready'), tone: 'mint' };
    case 'deciding':
      return { tip: t('core:match.deciding'), tone: 'gold' };
    case 'done':
      return { tip: t('core:playback.ended'), tone: 'mint' };
    case 'dead':
      return { tip: t('core:match.eliminated'), tone: 'red' };
    case 'combat':
      return { tip: t('core:combat.heading'), tone: 'orange' };
    default:
      return { tip: t('core:match.acting'), tone: 'lo' };
  }
}

/** One player: avatar (click to watch), name, LP tower, status, AI / you / eye. */
export function TeamRow({ player }: { readonly player: PlayerView }) {
  const t = useText();
  const intents = useIntent();
  const catalog = useMatchCatalog();
  const { playerId, watch } = useSession((state) => ({
    playerId: state.playerId,
    watch: state.backend?.capabilities.watchByField ?? false,
  }));
  const combat = useMatch((state) => (state.public?.fields.length ?? 0) > 0);
  const watching = usePlayback((state) => state.battle?.fieldId ?? null);
  const emote = useMatch((state) =>
    [...state.emotes]
      .reverse()
      .find(
        (line) =>
          line.playerId === player.playerId &&
          Date.now() - line.at < EMOTE_BUBBLE_MS,
      ),
  );
  const self = player.playerId === playerId;
  const art = useArt(player.bandId ? ['bands', player.bandId] : null);
  const watched = player.fieldId !== null && player.fieldId === watching;
  const offline = !player.connected && !player.isBot;
  const status = player.alive === false ? 'dead' : player.status;
  const meta = statusMeta(status, offline, t);
  const pending = Math.min(
    player.lp,
    Math.max(0, Math.trunc(player.pendingLp ?? 0)),
  );
  const shownLp = Math.max(0, player.lp - pending);
  const maxLp = Math.max(
    player.lp,
    player.bandId
      ? (catalog.bands[player.bandId]?.totalHp ?? player.lp)
      : player.lp,
    1,
  );
  const canWatch = watch && combat && player.fieldId !== null;
  const away = self && watching !== null && watching !== player.fieldId;
  const watchField = (fieldId: string | null): void => {
    if (!fieldId) {
      return;
    }
    void intents.dispatch({ type: 'g.watch', fields: { fieldId } });
  };
  const onAvatar = (): void => {
    if (!canWatch) {
      return;
    }
    if (self) {
      if (away) {
        watchField(player.fieldId);
      }
      return;
    }
    if (!watched) {
      watchField(player.fieldId);
    }
  };
  const title = self
    ? away
      ? t('core:watch.own')
      : t('core:watch.selfTip')
    : t('core:watch.field', { name: player.name });

  return (
    <li
      className={cx(styles.teamRow)}
      data-off={!player.alive || undefined}
      data-self={self || undefined}
      data-watched={watched || undefined}
    >
      <button
        type="button"
        className={cx(styles.teamBtn)}
        onClick={onAvatar}
        title={title}
        aria-label={title}
        disabled={!canWatch}
      >
        <span className={cx(styles.teamArt)}>
          <Avatar
            name={player.name}
            src={art}
            framed={self}
            off={!player.alive}
          />
          <span className={cx(styles.seatTag)}>P{player.seat + 1}</span>
          {player.isBot ? <span className={cx(styles.teamAi)}>AI</span> : null}
          {self ? (
            <span className={cx(styles.teamYou)} aria-hidden="true">
              <Icon name="user" />
            </span>
          ) : null}
        </span>
      </button>
      <div className={cx(styles.teamInfo)}>
        <span className={cx(styles.teamName)}>{player.name}</span>
        <div className={cx(styles.teamLine)}>
          <LpTower
            lp={shownLp}
            max={maxLp}
            label={
              pending > 0
                ? t('core:match.lpPending', {
                    lp: player.lp,
                    pending,
                  })
                : t('core:match.lp')
            }
          />
          {pending > 0 ? (
            <span
              className={cx(styles.teamPending)}
              title={t('core:match.lpPending', {
                lp: player.lp,
                pending,
              })}
            >
              −<Num>{pending}</Num>
            </span>
          ) : null}
          <Tooltip tip={meta.tip}>
            <span
              className={cx(styles.teamStatus)}
              data-tone={meta.tone}
              role="img"
              aria-label={meta.tip}
            >
              {status === 'ready' || status === 'done' ? (
                <Icon name="check" />
              ) : status === 'dead' || offline ? (
                <Icon name="close" />
              ) : status === 'combat' ? (
                <Icon name="bolt" />
              ) : (
                <Icon name="hourglass" />
              )}
            </span>
          </Tooltip>
          {watched && !self ? (
            <span
              className={cx(styles.teamEye)}
              title={t('core:watch.watching')}
            >
              <Icon name="eye" />
            </span>
          ) : null}
          {player.autoplay ? (
            <Badge tone="warn">{t('core:match.autoplay')}</Badge>
          ) : null}
        </div>
        {canWatch && !watched && !self ? (
          <Button onPress={() => watchField(player.fieldId)}>
            {t('core:watch.go')}
          </Button>
        ) : null}
        {canWatch && away ? (
          <Button onPress={() => watchField(player.fieldId)}>
            {t('core:watch.own')}
          </Button>
        ) : null}
        {player.bandId ? (
          <span className={cx(styles.teamBand)}>
            {dataName('band', player.bandId)}
          </span>
        ) : null}
      </div>
      {emote ? (
        <span className={cx(styles.bubble)}>{emoteName(emote.id)}</span>
      ) : null}
    </li>
  );
}

/** The team column. */
export function Team() {
  const t = useText();
  const players = useMatch((state) => state.public?.players ?? null);
  if (!players) {
    return null;
  }
  return (
    <ul className={cx(styles.team)} aria-label={t('core:match.players')}>
      {players.map((player) => (
        <Part key={player.playerId} id="core:match.team-row" player={player} />
      ))}
    </ul>
  );
}
