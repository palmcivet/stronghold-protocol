import {
  Badge,
  Button,
  Cluster,
  cx,
  Icon,
  Panel,
  RichText,
  Stack,
  Text,
} from '@alliance/ui';
import { useIntent } from '#infra/intent/context.js';
import {
  useMatch,
  useMatchCatalog,
  useRoom,
  useSession,
} from '#infra/store/hook.js';
import { has, lookup, shownName, useText } from '#infra/text/index.js';
import styles from '#match/match.module.css';
import { EnemyThumb, FactionIcon } from '#part/art.js';
import { definePart, Part } from '#part/registry.js';
import { type PartInsert, Slot } from '#part/slot.js';

export const BRIEFING = {
  layout: 'core:briefing.layout',
  columns: 'core:briefing.columns',
  boss: 'core:briefing.boss',
  stage: 'core:briefing.stage',
  factions: 'core:briefing.factions',
  ready: 'core:briefing.ready',
  actions: 'core:briefing.actions',
} as const;

/** The enemy leader of the match: silhouette, name, the round it comes. */
function Boss() {
  const t = useText();
  const view = useMatch((state) => state.public);
  const catalog = useMatchCatalog();
  const boss = catalog.bosses?.[view?.bossId ?? ''];
  const enemyId = boss?.enemyId ?? null;
  if (!view) {
    return null;
  }
  const name = view.bossId
    ? shownName('boss', view.bossId)
    : t('core:briefing.unknownBoss');
  const abilitiesKey = `data:boss.${view.bossId ?? ''}.abilities` as const;
  const abilities = has(abilitiesKey)
    ? lookup(abilitiesKey).split('\n').slice(0, 3)
    : [];
  const mode = catalog.modes[view.modeId];
  return (
    <Panel title={t('core:briefing.bossHeading')}>
      <Cluster align="start">
        <EnemyThumb enemyId={enemyId} name={name} size="lg" />
        <Stack gap={1}>
          <strong>{name}</strong>
          <span>
            {t('core:briefing.boss', {
              round: view.bossRound ?? mode?.bossRound ?? view.lastRound,
            })}
          </span>
          {abilities.length ? (
            <ul
              className={cx(styles.abilities)}
              aria-label={t('core:briefing.abilities')}
            >
              {abilities.map((ability) => (
                <li key={ability}>
                  <RichText source={ability} />
                </li>
              ))}
            </ul>
          ) : null}
          {view.hiddenRound ? (
            <Badge tone="danger">
              {t('core:briefing.hidden', { round: view.hiddenRound })}
            </Badge>
          ) : null}
        </Stack>
      </Cluster>
    </Panel>
  );
}

/** The battlefield and its pool: fixed, or drawn from several. */
function Stage() {
  const t = useText();
  const view = useMatch((state) => state.public);
  const catalog = useMatchCatalog();
  if (!view) {
    return null;
  }
  const pool = catalog.modes[view.modeId]?.stages ?? 0;
  return (
    <Panel title={t('core:briefing.stage')}>
      <Cluster gap={2}>
        <strong>{view.stageId ? shownName('stage', view.stageId) : '—'}</strong>
        {pool > 1 ? (
          <Badge>{t('core:briefing.poolRandom', { count: pool })}</Badge>
        ) : pool === 1 ? (
          <Badge>{t('core:briefing.poolFixed')}</Badge>
        ) : null}
      </Cluster>
      <Text kind="muted">{shownName('mode', view.modeId)}</Text>
      {has(`data:mode.${view.modeId}.desc`) ? (
        <span>{lookup(`data:mode.${view.modeId}.desc`)}</span>
      ) : null}
      <span>{t('core:briefing.rounds', { last: view.lastRound })}</span>
    </Panel>
  );
}

/** The special enemies: badge, name, what they do; or that there are none. */
function Factions() {
  const t = useText();
  const factions = useMatch((state) => state.public?.factions ?? null);
  return (
    <Panel title={t('core:briefing.factions')}>
      {factions?.length ? (
        <Stack as="ul" gap={2}>
          {factions.map((id) => (
            <li key={id}>
              <Cluster gap={2} align="start">
                <FactionIcon factionId={id} size="sm" />
                <Stack gap={1}>
                  <strong>{shownName('faction', id)}</strong>
                  {has(`data:faction.${id}.desc`) ? (
                    <Text kind="muted">
                      {lookup(`data:faction.${id}.desc`)}
                    </Text>
                  ) : null}
                </Stack>
              </Cluster>
            </li>
          ))}
        </Stack>
      ) : (
        <Text kind="muted">{t('core:briefing.noFactions')}</Text>
      )}
    </Panel>
  );
}

/** The `core:match.info` part in a column of its own. */
function InfoColumn() {
  const t = useText();
  return (
    <Panel title={t('core:briefing.heading')}>
      <Part id="core:match.info" factions={false} />
    </Panel>
  );
}

/** Host's reroll of the setup, while no vote runs and before they are ready. */
function RerollAction() {
  const t = useText();
  const intents = useIntent();
  const view = useMatch((state) => state.public);
  const playerId = useSession((state) => state.playerId);
  const host = useRoom((state) => state.room?.hostId === playerId);
  const me = view?.players.find((player) => player.playerId === playerId);
  if (!view || !host || !me) {
    return null;
  }
  return (
    <Button
      isDisabled={(view.rerollVote ?? null) !== null || me.ready}
      onPress={() =>
        void intents.dispatch({
          type: 'room.rerollSetup',
          fields: { setupRevision: view.setupRevision ?? 0 },
        })
      }
    >
      <Icon name="refresh" />
      {t('core:briefing.reroll')}
    </Button>
  );
}

/** The ready count with a pip per player, and the ready button (spectators see "spectating"). */
function Ready() {
  const t = useText();
  const intents = useIntent();
  const view = useMatch((state) => state.public);
  const playerId = useSession((state) => state.playerId);
  if (!view) {
    return null;
  }
  const players = view.players;
  const ready = players.filter((player) => player.ready).length;
  const me = players.find((player) => player.playerId === playerId) ?? null;
  return (
    <Cluster gap={3}>
      <span className={cx(styles.readyCount)}>
        {t('core:briefing.readyCount')} <Text variant="number">{ready}</Text>/
        <Text variant="number">{players.length}</Text>
      </span>
      <span className={cx(styles.pips)} aria-hidden="true">
        {players.map((player) => (
          <span
            key={player.playerId}
            className={cx(styles.pip)}
            data-ready={player.ready || undefined}
            data-me={player.playerId === playerId || undefined}
            title={player.name}
          >
            <Icon name="user" />
          </span>
        ))}
      </span>
      <Button
        variant="primary"
        isDisabled={!me || me.ready || (view.rerollVote ?? null) !== null}
        onPress={() =>
          void intents.dispatch({
            type: 'g.infoReady',
            fields: { setupRevision: view.setupRevision ?? 0 },
          })
        }
      >
        <Icon name={me?.ready ? 'check' : me ? 'play' : 'eye'} />
        {me
          ? me.ready
            ? t('core:room.ready')
            : t('core:briefing.getReady')
          : t('core:spectating')}
      </Button>
    </Cluster>
  );
}

const ACTION_DEFAULTS: readonly PartInsert[] = [
  { into: BRIEFING.actions, id: 'core:briefing.reroll', order: 20 },
  { into: BRIEFING.actions, id: BRIEFING.ready, order: 40 },
];

const COLUMN_DEFAULTS: readonly PartInsert[] = [
  { into: BRIEFING.columns, id: BRIEFING.boss, order: 10 },
  { into: BRIEFING.columns, id: BRIEFING.stage, order: 20 },
  { into: BRIEFING.columns, id: BRIEFING.factions, order: 30 },
  { into: BRIEFING.columns, id: 'core:briefing.info', order: 40 },
];

/** The briefing: step head, the columns, and ready. */
function BriefingLayout() {
  const t = useText();
  const loaded = useMatch((state) => state.public !== null);
  if (!loaded) {
    return <p role="status">{t('core:common.loading')}</p>;
  }
  return (
    <div className={cx(styles.step)} data-layout="briefing">
      <Part id="core:match.stephead" />
      <div className={cx(styles.briefColumns)}>
        <Slot id={BRIEFING.columns} defaults={COLUMN_DEFAULTS} />
      </div>
      <div className={cx(styles.stepFoot, styles.stickyFoot)}>
        <Slot id={BRIEFING.actions} defaults={ACTION_DEFAULTS} />
      </div>
    </div>
  );
}

export function registerBriefingParts(): readonly (() => void)[] {
  return [
    definePart(BRIEFING.layout, BriefingLayout, { extensible: true }),
    definePart(BRIEFING.boss, Boss, { extensible: true }),
    definePart(BRIEFING.stage, Stage, { extensible: true }),
    definePart(BRIEFING.factions, Factions, { extensible: true }),
    definePart('core:briefing.info', InfoColumn),
    definePart(BRIEFING.ready, Ready),
    definePart('core:briefing.reroll', RerollAction),
  ];
}
