import type { ResultRow } from '@alliance/contract/server-message.js';
import { resetMatch } from '../../infra/store/frame.js';
import {
  useMatch,
  useMatchCatalog,
  useRoom,
  useSession,
} from '../../infra/store/hook.js';
import { dispatchPresence } from '../../infra/store/presence.js';
import { dataName, lookup, useText } from '../../infra/text/index.js';
import { cx } from '../../infra/theme/class-name.js';
import { ChessThumb } from '../../part/art.js';
import { definePart, Part } from '../../part/registry.js';
import { Slot } from '../../part/slot.js';
import {
  Avatar,
  Badge,
  Button,
  Card,
  Cluster,
  DifficultyTag,
  LpTower,
  Muted,
  Num,
  Stack,
  Tone,
} from '../../ui/index.js';
import styles from './result.module.css';

export const RESULT = {
  layout: 'core:result.layout',
  hero: 'core:result.hero',
  player: 'core:result.player',
  extra: 'core:result.extra',
  actions: 'core:result.actions',
} as const;

/** One player of `m.result`. */
export type ResultPlayer = ResultRow;

/** The statistics a card lists, in master's order. */
export const STAT_KEYS = [
  'dmgDealt',
  'kills',
  'bossDamage',
  'activatedLayers',
  'merges',
  'itemsEquipped',
  'gold',
  'perfectRounds',
  'refreshes',
  'leaks',
  'lpLost',
] as const;

const STAT_LIMIT = 7;

function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Victory or defeat, the rounds passed, the leader's badge and the time. */
function Hero() {
  const t = useText();
  const result = useMatch((state) => state.result);
  if (!result) {
    return <p role="status">{t('core:common.loading')}</p>;
  }
  const victory = result.victory === true;
  const duration = result.durationMs ?? 0;
  const bossId = result.bossId ?? null;
  const difficulty = result.difficulty || null;
  return (
    <header className={cx(styles.hero)} data-victory={victory || undefined}>
      <p role="status" className={cx(styles.verdict)}>
        <Tone tone={victory ? 'good' : 'bad'}>
          {victory ? t('core:result.cleared') : t('core:result.failed')}
        </Tone>
      </p>
      <Cluster gap={3}>
        <span>
          {t('core:result.round', { round: Number(result.roundsPassed ?? 0) })}
        </span>
        {difficulty ? (
          <DifficultyTag
            id={difficulty.toLowerCase()}
            label={lookup(`core:difficulty.${difficulty}`)}
          />
        ) : null}
        {bossId ? (
          <Badge tone={victory ? 'gold' : 'neutral'}>
            {t('core:result.boss', { name: dataName('enemy', bossId) })}
          </Badge>
        ) : null}
        {result.hiddenReached === true ? (
          <Badge tone="danger">{t('core:result.hidden')}</Badge>
        ) : null}
        {duration > 0 ? (
          <Muted>
            {t('core:result.time', { time: formatDuration(duration) })}
          </Muted>
        ) : null}
      </Cluster>
    </header>
  );
}

/** One player's card: strategy, lineup with the elite mark, statistics, the remark. */
function PlayerCard({ player }: { readonly player: ResultPlayer }) {
  const t = useText();
  const playerId = useSession((state) => state.playerId);
  const catalog = useMatchCatalog();
  const self = player.playerId === playerId;
  const stats = STAT_KEYS.filter((key) =>
    Number.isFinite(player.stats?.[key]),
  ).slice(0, STAT_LIMIT);
  const lineup = (player.lineup ?? []).slice(0, 10);
  return (
    <Card
      as="li"
      selected={self}
      muted={player.alive === false}
      tone={player.victory ? 'good' : 'bad'}
    >
      <Cluster gap={2}>
        <Avatar name={player.name} framed={self} />
        <Stack gap={1}>
          <strong>
            {player.name}
            {player.isBot ? ` · ${t('core:room.bot')}` : ''}
            {self ? ` · ${t('core:result.you')}` : ''}
          </strong>
          <Muted>{player.bandId ? dataName('band', player.bandId) : '—'}</Muted>
        </Stack>
      </Cluster>
      <Cluster gap={1} label={t('core:result.lineup')}>
        {lineup.length ? (
          lineup.map((unit, index) => {
            const tier =
              unit.tier ?? (unit.id ? catalog.chess[unit.id]?.tier : undefined);
            return (
              <ChessThumb
                // biome-ignore lint/suspicious/noArrayIndexKey: a lineup slot is its index
                key={index}
                chessId={unit.id}
                size="sm"
                elite={unit.golden === true}
                {...(tier === undefined ? {} : { tier })}
              />
            );
          })
        ) : (
          <Muted>
            {player.alive === false
              ? t('core:result.lineupGone')
              : t('core:result.noInfo')}
          </Muted>
        )}
      </Cluster>
      <dl className={cx(styles.stats)}>
        <dt>{t('core:result.rounds')}</dt>
        <dd>
          <Num>{player.roundsPassed ?? 0}</Num>
        </dd>
        {stats.map((key) => (
          <div key={key} className={cx(styles.stat)}>
            <dt>{t(`core:result.stat.${key}`)}</dt>
            <dd>
              <Num>{player.stats?.[key]}</Num>
            </dd>
          </div>
        ))}
      </dl>
      {Number.isFinite(player.lp) ? (
        <LpTower
          lp={player.lp ?? 0}
          max={Math.max(player.lp ?? 0, 1)}
          label={t('core:match.lp')}
        />
      ) : null}
      {player.title?.name ? (
        <Badge tone="gold">
          {t('core:result.title', { name: player.title.name })}
        </Badge>
      ) : null}
    </Card>
  );
}

function Players() {
  const result = useMatch((state) => state.result);
  const rows = result?.players ?? [];
  return (
    <ul className={cx(styles.cards)}>
      {rows.map((row) => (
        <Part key={row.playerId} id={RESULT.player} player={row} />
      ))}
    </ul>
  );
}

function Actions() {
  const t = useText();
  const hasRoom = useRoom((state) => state.room !== null);
  const leave = (): void => {
    resetMatch();
    dispatchPresence({ type: 'leave-result' });
  };
  return (
    <Cluster justify="end">
      <Button variant="primary" onPress={leave}>
        {hasRoom ? t('core:result.back') : t('core:result.lobby')}
      </Button>
    </Cluster>
  );
}

/** The result: the verdict, the player cards, the extension area and the actions. */
function ResultLayout() {
  const t = useText();
  return (
    <div className={cx(styles.layout)} data-layout="result">
      <h1 className={cx(styles.heading)}>{t('core:result.heading')}</h1>
      <Part id={RESULT.hero} />
      <Players />
      <Slot id={RESULT.extra} />
      <Part id={RESULT.actions} />
    </div>
  );
}

export function registerResultParts(): readonly (() => void)[] {
  return [
    definePart(RESULT.layout, ResultLayout, { extensible: true }),
    definePart(RESULT.hero, Hero, { extensible: true }),
    definePart(RESULT.player, PlayerCard, { extensible: true }),
    definePart(RESULT.actions, Actions),
  ];
}
