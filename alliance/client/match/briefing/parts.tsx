import { useIntent } from '../../infra/intent/context.js';
import {
  useMatch,
  useMatchCatalog,
  useRoom,
  useSession,
} from '../../infra/store/hook.js';
import { has, lookup, shownName, useText } from '../../infra/text/index.js';
import { cx } from '../../infra/theme/class-name.js';
import { EnemyThumb } from '../../part/art.js';
import { definePart, Part } from '../../part/registry.js';
import { type PartInsert, Slot } from '../../part/slot.js';
import {
  Badge,
  Button,
  Chip,
  Cluster,
  Muted,
  Panel,
  ProgressBar,
  Stack,
} from '../../ui/index.js';
import styles from '../match.module.css';

export const BRIEFING = {
  layout: 'core:briefing.layout',
  columns: 'core:briefing.columns',
  boss: 'core:briefing.boss',
  stage: 'core:briefing.stage',
  factions: 'core:briefing.factions',
  ready: 'core:briefing.ready',
} as const;

/** The enemy leader of the match: silhouette, name, the round it comes. */
function Boss() {
  const t = useText();
  const view = useMatch((state) => state.public);
  const catalog = useMatchCatalog();
  const enemyId = catalog.bosses?.[view?.bossId ?? '']?.enemyId ?? null;
  if (!view?.bossId) {
    return null;
  }
  const name = shownName('boss', view.bossId);
  return (
    <Panel title={t('core:briefing.bossHeading')}>
      <Cluster align="start">
        <EnemyThumb enemyId={enemyId} name={name} size="lg" />
        <Stack gap={1}>
          <strong>{name}</strong>
          <span>
            {t('core:briefing.boss', {
              round: view.bossRound ?? view.lastRound,
            })}
          </span>
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

function Stage() {
  const t = useText();
  const view = useMatch((state) => state.public);
  if (!view) {
    return null;
  }
  return (
    <Panel title={t('core:briefing.stage')}>
      <strong>{view.stageId ? shownName('stage', view.stageId) : '—'}</strong>
      <Muted>{shownName('mode', view.modeId)}</Muted>
      {has(`data:mode.${view.modeId}.desc`) ? (
        <span>{lookup(`data:mode.${view.modeId}.desc`)}</span>
      ) : null}
      <span>{t('core:briefing.rounds', { last: view.lastRound })}</span>
    </Panel>
  );
}

function Factions() {
  const t = useText();
  const factions = useMatch((state) => state.public?.factions ?? null);
  if (!factions?.length) {
    return null;
  }
  return (
    <Panel title={t('core:briefing.factions')}>
      <Cluster gap={2}>
        {factions.map((id) => (
          <Chip key={id} icon="shield">
            {shownName('faction', id)}
          </Chip>
        ))}
      </Cluster>
    </Panel>
  );
}

/** The `core:match.info` part in a column of its own. */
function InfoColumn() {
  const t = useText();
  return (
    <Panel title={t('core:briefing.heading')}>
      <Part id="core:match.info" />
    </Panel>
  );
}

/** How many are ready, and the ready button. */
function Ready() {
  const t = useText();
  const intents = useIntent();
  const view = useMatch((state) => state.public);
  const playerId = useSession((state) => state.playerId);
  const host = useRoom((state) => state.room?.hostId === playerId);
  if (!view) {
    return null;
  }
  const humans = view.players.filter((player) => !player.isBot);
  const ready = humans.filter((player) => player.ready).length;
  const me =
    view.players.find((player) => player.playerId === playerId) ?? null;
  const vote = view.rerollVote ?? null;
  return (
    <div className={cx(styles.stepFoot)}>
      {host && me ? (
        <Button
          isDisabled={vote !== null || me.ready}
          onPress={() =>
            void intents.dispatch({
              type: 'room.rerollSetup',
              fields: { setupRevision: view.setupRevision ?? 0 },
            })
          }
        >
          {t('core:briefing.reroll')}
        </Button>
      ) : null}
      <div style={{ minWidth: '12rem' }}>
        <ProgressBar
          label={t('core:briefing.readyCount')}
          value={ready}
          max={Math.max(1, humans.length)}
          valueText={`${ready}/${humans.length}`}
        />
      </div>
      <Button
        variant="primary"
        isDisabled={!me || me.ready}
        onPress={() =>
          void intents.dispatch({
            type: 'g.infoReady',
            fields: { setupRevision: view.setupRevision ?? 0 },
          })
        }
      >
        {me
          ? me.ready
            ? t('core:room.ready')
            : t('core:common.ready')
          : t('core:spectating')}
      </Button>
    </div>
  );
}

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
      <div className={cx(styles.stepColumns)}>
        <Slot id={BRIEFING.columns} defaults={COLUMN_DEFAULTS} />
      </div>
      <Part id={BRIEFING.ready} />
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
  ];
}
