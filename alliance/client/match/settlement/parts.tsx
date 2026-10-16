import type {
  ResultLineupEntry,
  ResultRow,
} from '@alliance/contract/server-message.js';
import { Badge, Button, Cluster, cx, Icon, Stack, Text } from '@alliance/ui';
import { resetMatch } from '#infra/store/frame.js';
import {
  useCatalog,
  useMatch,
  useMatchCatalog,
  useRoom,
  useSession,
} from '#infra/store/hook.js';
import { dispatchPresence } from '#infra/store/presence.js';
import { dataName, lookup, shownName, useText } from '#infra/text/index.js';
import {
  BandIcon,
  BondIcon,
  ChessThumb,
  EnemyThumb,
  PlayerAvatar,
} from '#part/art.js';
import { DifficultyBadge } from '#part/badge.js';
import { LpTower } from '#part/lp-tower.js';
import { definePart, Part } from '#part/registry.js';
import { Slot } from '#part/slot.js';
import styles from './result.module.css';
import {
  bestOf,
  cardOf,
  formatDuration,
  formatStat,
  type StatKey,
  seatOrder,
} from './result-model.js';

export const RESULT = {
  layout: 'core:result.layout',
  hero: 'core:result.hero',
  player: 'core:result.player',
  extra: 'core:result.extra',
  actions: 'core:result.actions',
} as const;

/** Victory or defeat, huge rounds, leader medals and the time — master's left column. */
function Hero() {
  const t = useText();
  const result = useMatch((state) => state.result);
  const lastRound = useMatch((state) => state.public?.lastRound ?? null);
  const catalog = useMatchCatalog();
  if (!result) {
    return <p role="status">{t('core:common.loading')}</p>;
  }
  const victory = result.victory === true;
  const duration = result.durationMs ?? 0;
  const difficulty = result.difficulty || null;
  const hiddenReached =
    result.hiddenReached === true || result.hiddenCleared === true;
  const medal = (
    bossId: string,
    done: boolean,
    label: 'core:result.leader' | 'core:result.hiddenCore',
    hidden = false,
  ) => (
    <span
      className={cx(styles.medal)}
      data-done={done || undefined}
      data-hidden={hidden || undefined}
      title={shownName('boss', bossId)}
    >
      <EnemyThumb
        enemyId={catalog.bosses?.[bossId]?.enemyId ?? null}
        name={shownName('boss', bossId)}
        size="sm"
      />
      <span className={cx(styles.medalMark)}>
        <Icon name={done ? 'check' : 'close'} />
      </span>
      <span className={cx(styles.medalLabel)}>{t(label)}</span>
    </span>
  );
  return (
    <header className={cx(styles.hero)} data-victory={victory || undefined}>
      <span className={cx(styles.brand)}>STRONGHOLD PROTOCOL</span>
      {difficulty ? (
        <DifficultyBadge
          difficulty={difficulty}
          label={lookup(`core:difficulty.${difficulty}`)}
        />
      ) : null}
      <p role="status" className={cx(styles.verdict)}>
        {victory ? t('core:result.cleared') : t('core:result.failed')}
      </p>
      <p className={cx(styles.sub)}>
        {victory ? t('core:result.clearedLine') : t('core:result.failedLine')}
      </p>
      <div className={cx(styles.rounds)}>
        <span className={cx(styles.roundsLabel)}>
          {t('core:result.rounds')}
        </span>
        <b className={cx(styles.roundsNum)}>
          <Text variant="number">{result.roundsPassed}</Text>
        </b>
        {lastRound !== null && result.roundsPassed <= lastRound ? (
          <span className={cx(styles.roundsOf)}>/{lastRound}</span>
        ) : null}
      </div>
      <div className={cx(styles.medals)}>
        {result.bossId
          ? medal(result.bossId, victory, 'core:result.leader')
          : null}
        {result.hiddenBossId && hiddenReached
          ? medal(
              result.hiddenBossId,
              result.hiddenCleared === true,
              'core:result.hiddenCore',
              true,
            )
          : null}
      </div>
      {duration > 0 ? (
        <p className={cx(styles.time)}>
          {t('core:result.time', { time: formatDuration(duration) })}
        </p>
      ) : null}
    </header>
  );
}

/** One unit of a final lineup. */
function LineupUnit({ unit }: { readonly unit: ResultLineupEntry }) {
  const t = useText();
  const catalog = useMatchCatalog();
  const tier =
    unit.tier ?? (unit.id ? catalog.chess[unit.id]?.tier : undefined);
  const base = {
    size: 'sm' as const,
    elite: unit.golden === true,
    ...(tier === undefined ? {} : { tier }),
  };
  if (unit.diy) {
    return <ChessThumb chessId={unit.id} charId={unit.diy.charId} {...base} />;
  }
  if (unit.standInFor) {
    return (
      <ChessThumb
        chessId={unit.id}
        label={t('core:result.standIn', {
          name: dataName('chess', unit.id),
          for: dataName('operator', unit.standInFor),
        })}
        {...base}
      />
    );
  }
  return <ChessThumb chessId={unit.id} {...base} />;
}

/** One player's card: who / lineup / bonds / rounds / remark / stats with best marked. */
function PlayerCard({
  player,
  best = {},
  solo = true,
}: {
  readonly player: ResultRow;
  readonly best?: Partial<Record<StatKey, string>>;
  readonly solo?: boolean;
}) {
  const t = useText();
  const playerId = useSession((state) => state.playerId);
  const result = useMatch((state) => state.result);
  const bondCatalog = useCatalog((state) => state.catalog.bonds);
  const card = result ? cardOf(player, result, bondCatalog) : null;
  const self = player.playerId === playerId;
  const lineup = (player.lineup ?? []).slice(0, 10);
  const shared = (card?.lpShared ?? false) && !solo;
  return (
    <li
      className={cx(styles.card)}
      data-self={self || undefined}
      data-off={player.alive === false || undefined}
    >
      <header className={cx(styles.cardHead)}>
        <PlayerAvatar name={player.name} active={self} />
        <div className={cx(styles.cardWho)}>
          <b className={cx(styles.cardName)}>
            {player.name}
            {player.isBot ? <Badge tone="ice">AI</Badge> : null}
            {self ? <Badge tone="accent">{t('core:result.you')}</Badge> : null}
          </b>
          <span className={cx(styles.cardBand)}>
            {player.bandId ? (
              <>
                <BandIcon bandId={player.bandId} size="sm" />
                {dataName('band', player.bandId)}
              </>
            ) : (
              '—'
            )}
          </span>
        </div>
        <div className={cx(styles.cardMid)}>
          <div className={cx(styles.cardLineup)}>
            {lineup.length ? (
              lineup.map((unit, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: a lineup slot is its index
                <LineupUnit key={index} unit={unit} />
              ))
            ) : (
              <span className={cx(styles.cardNoinfo)}>
                {player.alive === false
                  ? t('core:result.lineupGone')
                  : t('core:result.noInfo')}
              </span>
            )}
          </div>
          {card?.bonds.length ? (
            <div className={cx(styles.cardBonds)}>
              {card.bonds.map((bond) => (
                <span
                  key={bond.bondId}
                  className={cx(styles.bond)}
                  data-on={bond.active || undefined}
                  title={dataName('bond', bond.bondId)}
                >
                  <BondIcon bondId={bond.bondId} size="sm" />
                  {bond.layers === null ? null : (
                    <Text variant="number">{bond.layers}</Text>
                  )}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <div className={cx(styles.cardRound)}>
          <span className={cx(styles.brand)}>ROUNDS</span>
          <b>
            <Text variant="number">{player.roundsPassed ?? 0}</Text>
          </b>
          {(player.trophies ?? 0) > 0 || (player.reward ?? 0) > 0 ? (
            <span className={cx(styles.cardGain)}>
              {(player.trophies ?? 0) > 0 ? (
                <span title={t('core:result.trophies')}>
                  <Icon name="crown" />
                  <Text variant="number">+{player.trophies}</Text>
                </span>
              ) : null}
              {(player.reward ?? 0) > 0 ? (
                <span title={t('core:result.reward')}>
                  <Icon name="shield" />
                  <Text variant="number">+{player.reward}</Text>
                </span>
              ) : null}
            </span>
          ) : null}
        </div>
        {player.title?.name ? (
          <div className={cx(styles.cardTitle)} title={player.title.text ?? ''}>
            <Icon name="crown" />
            <Stack gap={1}>
              <Text kind="muted">{t('core:result.remark')}</Text>
              <b>{player.title.name}</b>
            </Stack>
          </div>
        ) : (
          <span
            className={cx(styles.cardTitle)}
            data-none=""
            aria-hidden="true"
          />
        )}
      </header>
      <dl className={cx(styles.stats)}>
        {(card?.stats ?? []).map((key) => (
          <div
            key={key}
            className={cx(styles.stat)}
            data-best={best[key] === player.playerId || undefined}
          >
            <dt>{t(`core:result.stat.${key}`)}</dt>
            <dd>
              <Text variant="number">{formatStat(player.stats?.[key])}</Text>
            </dd>
          </div>
        ))}
        {card && card.lp !== null ? (
          <div
            className={cx(styles.stat)}
            title={shared ? t('core:result.lpSharedHint') : undefined}
          >
            <dt>
              {shared ? t('core:result.lpShared') : t('core:result.lpLeft')}
            </dt>
            <dd>
              <LpTower
                lp={card.lp}
                max={Math.max(card.lp, 1)}
                label={
                  shared ? t('core:result.lpShared') : t('core:result.lpLeft')
                }
              />
            </dd>
          </div>
        ) : null}
      </dl>
    </li>
  );
}

function Players() {
  const t = useText();
  const result = useMatch((state) => state.result);
  const rows = seatOrder(result?.players ?? []);
  const best = bestOf(rows);
  if (!rows.length) {
    return <Text kind="muted">{t('core:result.empty')}</Text>;
  }
  return (
    <ul className={cx(styles.cards)}>
      {rows.map((row) => (
        <Part
          key={row.playerId}
          id={RESULT.player}
          player={row}
          best={best}
          solo={rows.length < 2}
        />
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
    <Cluster justify="start">
      <Button variant="primary" onPress={leave}>
        <Icon name="chevron-left" />
        {hasRoom ? t('core:result.back') : t('core:result.lobby')}
      </Button>
    </Cluster>
  );
}

/** The result: left verdict, right player cards (master Alliance Report). */
function ResultLayout() {
  const t = useText();
  return (
    <div className={cx(styles.layout)} data-layout="result">
      <div className={cx(styles.summary)}>
        <h1 className={cx(styles.heading)}>{t('core:result.heading')}</h1>
        <Part id={RESULT.hero} />
        <div className={cx(styles.actions)}>
          <Part id={RESULT.actions} />
        </div>
      </div>
      <div className={cx(styles.report)}>
        <div className={cx(styles.reportHead)}>
          <strong>{t('core:result.alliance')}</strong>
          <span className={cx(styles.brand)}>
            {t('core:result.allianceReport')}
          </span>
        </div>
        <Players />
        <Slot id={RESULT.extra} />
      </div>
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
