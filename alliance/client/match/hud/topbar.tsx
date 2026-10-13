import { PHASE } from '@alliance/contract/match.js';
import { useStore } from 'zustand';
import { useIntent } from '../../infra/intent/context.js';
import {
  useMatch,
  useMatchCatalog,
  useSession,
} from '../../infra/store/hook.js';
import { dataName, lookup, useText } from '../../infra/text/index.js';
import { cx } from '../../infra/theme/class-name.js';
import { EnemyThumb } from '../../part/art.js';
import { openSettings } from '../../part/overlay.js';
import { Part } from '../../part/registry.js';
import { type PartInsert, Slot } from '../../part/slot.js';
import {
  Badge,
  Button,
  Cluster,
  Dialog,
  EmptyState,
  Icon,
  LpTower,
  Modal,
  Muted,
  Num,
  PhaseCapsule,
  Stack,
  Tabs,
  ToggleButton,
} from '../../ui/index.js';
import { ClockFace, usePhaseSeconds } from '../countdown.js';
import { usePlayback } from '../playback-state.js';
import { confirmLeave } from '../stephead.js';
import styles from './hud.module.css';
import { hudStore } from './state.js';

export const COMBAT_PHASES: ReadonlySet<string> = new Set([
  PHASE.COMBAT,
  PHASE.UNITE,
  PHASE.FINAL_ASSAULT,
  PHASE.HIDDEN_CORE,
]);

/** Leave and latency; the away switch (AI plays) and the settings. */
export function Exit() {
  const t = useText();
  const intents = useIntent();
  const ping = useSession((state) => state.connection.ping);
  const playerId = useSession((state) => state.playerId);
  const me = useMatch(
    (state) =>
      state.public?.players.find((player) => player.playerId === playerId) ??
      null,
  );
  return (
    <Cluster gap={2}>
      <Button
        aria-label={t('core:match.exit')}
        onPress={() => void confirmLeave(intents, t)}
      >
        <Icon name="exit" />
      </Button>
      {me ? (
        <ToggleButton
          isSelected={me.autoplay}
          onChange={(on) =>
            void intents.dispatch({ type: 'g.autoplay', fields: { on } })
          }
        >
          {t('core:match.autoplay')}
        </ToggleButton>
      ) : (
        <Badge tone="info">{t('core:spectating')}</Badge>
      )}
      <Button
        aria-label={t('core:settings.open')}
        onPress={() => openSettings()}
      >
        <Icon name="settings" />
      </Button>
      {ping === null ? null : (
        <Muted>{t('core:entry.ping', { ms: Math.round(ping) })}</Muted>
      )}
    </Cluster>
  );
}

/** The round and the phase capsule: preparation, kills of total in combat, the leader's health. */
export function Round() {
  const t = useText();
  const view = useMatch((state) => state.public);
  const battle = usePlayback((state) => state.battle);
  if (!view) {
    return null;
  }
  const combat = COMBAT_PHASES.has(view.phase);
  const boss = view.bossHp;
  return (
    <Cluster gap={2}>
      <span className={cx(styles.round)}>
        <Num>{view.round}</Num>
        <Muted>/{view.lastRound}</Muted>
      </span>
      {boss && combat ? (
        <PhaseCapsule
          tone="boss"
          label={lookup(`core:phase.${view.phase}`)}
          detail={`${boss.hp}/${boss.max}`}
          progress={boss.max > 0 ? boss.hp / boss.max : 0}
        />
      ) : combat && battle && battle.total > 0 ? (
        <PhaseCapsule
          tone="combat"
          label={lookup(`core:phase.${view.phase}`)}
          detail={t('core:playback.progress', {
            killed: battle.killed,
            total: battle.total,
          })}
          progress={battle.killed / battle.total}
        />
      ) : (
        <PhaseCapsule
          tone={combat ? 'combat' : 'prep'}
          label={lookup(`core:phase.${view.phase}`)}
        />
      )}
    </Cluster>
  );
}

/** Life points; the team's shared points in co-op once they are merged. */
export function Lp() {
  const t = useText();
  const view = useMatch((state) => state.public);
  const own = useMatch((state) => state.private);
  const catalog = useMatchCatalog();
  if (!view) {
    return null;
  }
  const shared = view.teamLp !== undefined;
  const lp = shared ? (view.teamLp ?? 0) : (own?.lp ?? 0);
  const bandId = own?.bandId ?? null;
  const max = Math.max(
    lp,
    bandId ? (catalog.bands[bandId]?.totalHp ?? lp) : lp,
    1,
  );
  return (
    <LpTower
      lp={lp}
      max={max}
      label={shared ? t('core:match.teamLp') : t('core:match.lp')}
    />
  );
}

/** The seven-segment countdown, the overtime warning, ready and the solo pause. */
export function Clock() {
  const t = useText();
  const intents = useIntent();
  const view = useMatch((state) => state.public);
  const own = useMatch((state) => state.private);
  const seconds = usePhaseSeconds();
  if (!view) {
    return null;
  }
  const solo = view.players.filter((player) => !player.isBot).length <= 1;
  const prep = view.phase === PHASE.PREP;
  return (
    <Cluster gap={2}>
      <ClockFace />
      {seconds !== null && seconds <= 5 && prep ? (
        <Badge tone="danger">{t('core:match.overtime')}</Badge>
      ) : null}
      {own && prep ? (
        <ToggleButton
          isSelected={own.ready}
          isDisabled={!own.canReady && !own.ready}
          onChange={(ready) =>
            void intents.dispatch({ type: 'g.ready', fields: { ready } })
          }
        >
          {own.ready ? t('core:common.unready') : t('core:common.ready')}
        </ToggleButton>
      ) : null}
      {own && solo ? (
        <Button
          aria-label={t('core:match.pause')}
          onPress={() =>
            void intents.dispatch({ type: 'g.pause', fields: { on: true } })
          }
        >
          <Icon name="pause" />
        </Button>
      ) : null}
    </Cluster>
  );
}

/** The two lenses: the match information, and the enemy preview. */
export function Lens() {
  const t = useText();
  return (
    <Cluster gap={1}>
      <Button
        aria-label={t('core:match.lens.info')}
        onPress={() => hudStore.setState({ intel: 'info' })}
      >
        <Icon name="search" />
      </Button>
      <Button
        aria-label={t('core:match.lens.enemies')}
        onPress={() => hudStore.setState({ intel: 'enemies' })}
      >
        <Icon name="eye" />
      </Button>
    </Cluster>
  );
}

/** Shared by every render without a private view, so the selection stays equal. */
const NONE: readonly never[] = [];

function Enemies() {
  const t = useText();
  const enemies = useMatch((state) => state.private?.nextEnemies ?? NONE);
  if (!enemies.length) {
    return <EmptyState title={t('core:match.noEnemies')} />;
  }
  return (
    <Stack as="ul" gap={2}>
      {enemies.map((enemy, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a preview line is its index
        <li key={index} className={cx(styles.line)}>
          <Cluster gap={2}>
            <EnemyThumb
              enemyId={enemy.enemyKey}
              name={dataName('enemy', enemy.enemyKey)}
              size="sm"
              elite={enemy.elite === true}
            />
            <span>{dataName('enemy', enemy.enemyKey)}</span>
            {enemy.boss ? (
              <Badge tone="danger">{t('core:match.enemy.boss')}</Badge>
            ) : null}
            {enemy.elite ? (
              <Badge tone="gold">{t('core:match.enemy.elite')}</Badge>
            ) : null}
            {enemy.fly ? (
              <Badge tone="info">{t('core:match.enemy.fly')}</Badge>
            ) : null}
          </Cluster>
          <Num>×{enemy.count}</Num>
        </li>
      ))}
    </Stack>
  );
}

/** The match information dialog: this match's information, and the enemy intel. */
export function Intel() {
  const t = useText();
  const page = useStore(hudStore, (state) => state.intel);
  const close = (): void => hudStore.setState({ intel: null });
  return (
    <Modal isOpen={page !== null} onOpenChange={(open) => !open && close()}>
      <Dialog
        title={t('core:match.intel')}
        closeLabel={t('core:common.close')}
        onClose={close}
      >
        <Tabs
          label={t('core:match.intel')}
          selected={page ?? 'info'}
          onSelect={(id) =>
            hudStore.setState({ intel: id === 'enemies' ? 'enemies' : 'info' })
          }
          items={[
            {
              id: 'info',
              label: t('core:briefing.heading'),
              content: <Part id="core:match.info" />,
            },
            {
              id: 'enemies',
              label: t('core:match.nextEnemies'),
              content: <Enemies />,
            },
          ]}
        />
      </Dialog>
    </Modal>
  );
}

const TOP_DEFAULTS: readonly PartInsert[] = [
  { into: 'core:match.hud.top', id: 'core:match.exit', order: 10 },
  { into: 'core:match.hud.top', id: 'core:match.round', order: 20 },
  { into: 'core:match.hud.top', id: 'core:match.lp', order: 30 },
  { into: 'core:match.hud.top', id: 'core:match.clock', order: 40 },
  { into: 'core:match.hud.top', id: 'core:match.lens', order: 50 },
];

/** The top bar container. */
export function TopBar() {
  return (
    <div className={cx(styles.topbar)}>
      <Slot id="core:match.hud.top" defaults={TOP_DEFAULTS} />
    </div>
  );
}
