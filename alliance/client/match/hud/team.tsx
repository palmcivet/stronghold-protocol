import { EMOTE_BUBBLE_MS } from '@alliance/contract/match.js';
import type { PlayerView } from '@alliance/contract/server-message.js';
import { useIntent } from '../../infra/intent/context.js';
import { useMatch, useSession } from '../../infra/store/hook.js';
import { dataName, useText } from '../../infra/text/index.js';
import { cx } from '../../infra/theme/class-name.js';
import { Part } from '../../part/registry.js';
import { Avatar, Badge, Button, Cluster, Num, Stack } from '../../ui/index.js';
import { usePlayback } from '../playback-state.js';
import { emoteName } from './emote.js';
import styles from './hud.module.css';

/** One player: avatar, name, strategy, LP, state, AI, watched, the latest emote; go and watch, or back. */
export function TeamRow({ player }: { readonly player: PlayerView }) {
  const t = useText();
  const intents = useIntent();
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
  const watched = player.fieldId !== null && player.fieldId === watching;
  return (
    <li
      className={cx(styles.teamRow)}
      data-off={!player.alive || undefined}
      data-self={self || undefined}
    >
      <Avatar name={player.name} framed={self} off={!player.alive} />
      <Stack gap={1}>
        <Cluster gap={1}>
          <strong>{player.name}</strong>
          {player.isBot ? <Badge tone="info">AI</Badge> : null}
          {player.autoplay ? (
            <Badge tone="warn">{t('core:match.autoplay')}</Badge>
          ) : null}
          {!player.connected ? (
            <Badge tone="danger">{t('core:room.offline')}</Badge>
          ) : null}
          {watched ? (
            <Badge tone="accent">{t('core:watch.watching')}</Badge>
          ) : null}
          {player.ready ? (
            <Badge tone="accent">{t('core:room.ready')}</Badge>
          ) : null}
        </Cluster>
        <Cluster gap={2}>
          <span>{player.bandId ? dataName('band', player.bandId) : '—'}</span>
          <span>
            LP <Num tone={player.lp > 0 ? undefined : 'bad'}>{player.lp}</Num>
          </span>
        </Cluster>
        {emote ? (
          <span className={cx(styles.bubble)}>{emoteName(emote.id)}</span>
        ) : null}
      </Stack>
      {watch && combat && player.fieldId && !watched ? (
        <Button
          onPress={() =>
            void intents.dispatch({
              type: 'g.watch',
              fields: { fieldId: player.fieldId },
            })
          }
        >
          {self ? t('core:watch.own') : t('core:watch.go')}
        </Button>
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
