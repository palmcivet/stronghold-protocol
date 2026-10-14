import { PHASE } from '@alliance/contract/match.js';
import { useState } from 'react';
import { useStore } from 'zustand';
import { useIntent } from '#infra/intent/context.js';
import {
  useMatch,
  useMatchCatalog,
  useRoom,
  useSession,
} from '#infra/store/hook.js';
import { matchRulesStore } from '#infra/store/match-rules.js';
import { dataName, lookup, useText } from '#infra/text/index.js';
import { cx } from '#infra/theme/class-name.js';
import { ClockFace, usePhaseSeconds } from '#match/countdown.js';
import { overtimeState } from '#match/overtime.js';
import { penStore, setPen } from '#match/pen-state.js';
import { usePlayback } from '#match/playback-state.js';
import { selectionStore } from '#match/selection.js';
import { EnemyThumb } from '#part/art.js';
import { BoundHotkey } from '#part/hotkey.js';
import { Part } from '#part/registry.js';
import { type PartInsert, Slot } from '#part/slot.js';
import {
  Badge,
  Button,
  Cluster,
  Dialog,
  DifficultyTag,
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
} from '#ui/index.js';
import styles from './hud.module.css';
import { hudStore } from './state.js';

export const COMBAT_PHASES: ReadonlySet<string> = new Set([
  PHASE.COMBAT,
  PHASE.UNITE,
  PHASE.FINAL_ASSAULT,
  PHASE.HIDDEN_CORE,
]);

/** Leaving, as master's exit dialog: step away (AI plays your seat, co-op only) or give up; a spectator just leaves. */
function ExitDialog({
  open,
  onClose,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
}) {
  const t = useText();
  const intents = useIntent();
  const playerId = useSession((state) => state.playerId);
  const { seated, solo } = useMatch((state) => ({
    seated:
      state.public?.players.some((player) => player.playerId === playerId) ??
      false,
    solo:
      (state.public?.players.filter((player) => !player.isBot).length ?? 0) <=
      1,
  }));
  const leave = () => {
    onClose();
    void intents.dispatch({ type: 'g.leave' });
  };
  return (
    <Modal isOpen={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog
        title={
          seated ? t('core:match.leaveTitle') : t('core:match.leaveSpectate')
        }
        closeLabel={t('core:common.cancel')}
        onClose={onClose}
        actions={
          <>
            {seated && !solo ? (
              <Button
                onPress={() => {
                  onClose();
                  void intents.dispatch({
                    type: 'g.autoplay',
                    fields: { on: true },
                  });
                }}
              >
                <Icon name="bot" />
                {t('core:match.awayAction')}
              </Button>
            ) : null}
            <Button variant="primary" onPress={leave}>
              <Icon name="exit" />
              {seated ? t('core:match.leave') : t('core:match.leaveSpectate')}
            </Button>
          </>
        }
      >
        {seated ? (
          <Stack gap={2}>
            {solo ? null : <p>{t('core:match.awayNote')}</p>}
            <p>{t('core:match.quitNote')}</p>
          </Stack>
        ) : (
          <p>{t('core:match.leaveSpectateNote')}</p>
        )}
      </Dialog>
    </Modal>
  );
}

/** Spectator roster pill beside the ping, as master's SpectatorPill. */
function Spectators() {
  const t = useText();
  const intents = useIntent();
  const playerId = useSession((state) => state.playerId);
  const room = useRoom((state) => state.room);
  const spectators = room?.spectators ?? NONE;
  const host = room?.hostId === playerId;
  if (!spectators.length) {
    return null;
  }
  return (
    <details className={cx(styles.specPill)}>
      <summary>
        <Icon name="eye" />
        <Num>{spectators.length}</Num>
        <span className={cx(styles.microLabel)}>
          {t('core:match.spectators')}
        </span>
      </summary>
      <ul className={cx(styles.specRoster)}>
        {spectators.map((seat) => (
          <li key={seat.playerId} className={cx(styles.specRow)}>
            <span>{seat.name}</span>
            {host && seat.playerId !== playerId ? (
              <Button
                aria-label={t('core:room.removeSpectator', { name: seat.name })}
                onPress={() =>
                  void intents.dispatch({
                    type: 'room.removeSpectator',
                    fields: { playerId: seat.playerId },
                  })
                }
              >
                <Icon name="close" />
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </details>
  );
}

/** Leave, the latency and the difficulty; spectators are marked. */
export function Exit() {
  const t = useText();
  const ping = useSession((state) => state.connection.ping);
  const playerId = useSession((state) => state.playerId);
  const difficulty = useMatch((state) => state.public?.difficulty ?? null);
  const seated = useMatch(
    (state) =>
      state.public?.players.some((player) => player.playerId === playerId) ??
      false,
  );
  const [open, setOpen] = useState(false);
  return (
    <Cluster gap={2}>
      <Button aria-label={t('core:match.exit')} onPress={() => setOpen(true)}>
        <Icon name="exit" />
      </Button>
      <Stack gap={1}>
        <Cluster gap={1}>
          {ping === null ? null : (
            <Muted>{t('core:entry.ping', { ms: Math.round(ping) })}</Muted>
          )}
          <Spectators />
        </Cluster>
        {difficulty ? (
          <DifficultyTag
            id={difficulty.toLowerCase()}
            label={lookup(`core:difficulty.${difficulty}`)}
          />
        ) : null}
      </Stack>
      {seated ? null : <Badge tone="info">{t('core:spectating')}</Badge>}
      <ExitDialog open={open} onClose={() => setOpen(false)} />
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
      <Muted>{t('core:match.roundLabel')}</Muted>
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

/** Boss-round DOT warning from m.public.overtimeAt, as master's OvertimeWarning. */
function OvertimeWarning() {
  const t = useText();
  const view = useMatch((state) => state.public);
  const clockOffset = useMatch((state) => state.clockOffset);
  const perSec = useStore(
    matchRulesStore,
    (state) => state.bossOvertimeDrainPerSec,
  );
  // tick with the phase clock so pending secs / lost LP stay live
  usePhaseSeconds(view?.deadline);
  const now = Date.now() + clockOffset;
  const ot = overtimeState(view, now, { perSec });
  if (!ot) {
    return null;
  }
  if (ot.state === 'pending') {
    return (
      <div className={cx(styles.otWarn)} data-state="pending" role="alert">
        <span className={cx(styles.microLabel)}>DOT</span>
        <span>{t('core:match.overtimePending', { seconds: ot.secs })}</span>
      </div>
    );
  }
  return (
    <div className={cx(styles.otWarn)} data-state="drain" role="alert">
      <span className={cx(styles.otBlood)} aria-hidden="true" />
      <span className={cx(styles.microLabel)}>DOT</span>
      <span>{t('core:match.overtimeDrainRate', { rate: ot.perSec })}</span>
      {ot.lost > 0 ? (
        <span className={cx(styles.otLost)}>
          {t('core:match.overtimeLost', { lost: ot.lost })}
        </span>
      ) : null}
      <span key={ot.secs} className={cx(styles.otTick)} aria-hidden="true">
        −{ot.perSec}
      </span>
    </div>
  );
}

/** The seven-segment countdown, overtime warning and the solo pause (Ready sits at the right, as master). */
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
      <OvertimeWarning />
      {seconds !== null && seconds <= 5 && prep ? (
        <Badge tone="danger">{t('core:match.overtime')}</Badge>
      ) : null}
      {own && prep && !own.canReady && !own.ready && own.temp.some(Boolean) ? (
        <Muted>{t('core:match.tempBlocks')}</Muted>
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

/** Ready on the right of the top bar, as master's ReadyToggle. */
export function Ready() {
  const t = useText();
  const intents = useIntent();
  const view = useMatch((state) => state.public);
  const own = useMatch((state) => state.private);
  if (!view || !own || view.phase !== PHASE.PREP || own.alive === false) {
    return null;
  }
  return (
    <ToggleButton
      isSelected={own.ready}
      isDisabled={!own.canReady && !own.ready}
      onChange={(ready) =>
        void intents.dispatch({ type: 'g.ready', fields: { ready } })
      }
    >
      {own.ready ? t('core:common.unready') : t('core:common.ready')}
      <BoundHotkey id="core:ready" />
    </ToggleButton>
  );
}

/**
 * Master's check-player / check-enemy lenses: left opens 本局信息 (or returns from the pen);
 * right pans the camera to the enemy preview pen in prep (or returns). Outside prep the right
 * lens opens the intel enemies tab as the secondary list.
 */
export function Lens() {
  const t = useText();
  const page = useStore(hudStore, (state) => state.intel);
  const pen = useStore(penStore, (state) => state.pen);
  const phase = useMatch((state) => state.public?.phase ?? null);
  const enemies = useMatch((state) => state.private?.nextEnemies ?? NONE);
  const prep = phase === PHASE.PREP;
  const penAvail = prep && enemies.length > 0;

  const onLeft = (): void => {
    if (pen) {
      setPen(false);
      return;
    }
    hudStore.setState({ intel: page === 'info' ? null : 'info' });
  };
  const onRight = (): void => {
    if (pen) {
      setPen(false);
      return;
    }
    if (penAvail) {
      setPen(true);
      hudStore.setState({ intel: null, shopCollapsed: true });
      selectionStore.setState({ uid: null, enemyDetail: null });
      return;
    }
    hudStore.setState({ intel: page === 'enemies' ? null : 'enemies' });
  };

  return (
    <Cluster gap={1}>
      <Button
        aria-label={pen ? t('core:match.lens.back') : t('core:match.lens.info')}
        aria-pressed={!pen && page === 'info'}
        onPress={onLeft}
      >
        <Icon name="search" />
        {pen ? <Muted>◀◀</Muted> : null}
      </Button>
      <Button
        aria-label={
          pen
            ? t('core:match.lens.back')
            : penAvail
              ? t('core:match.lens.pen')
              : t('core:match.lens.enemies')
        }
        aria-pressed={pen || (!penAvail && page === 'enemies')}
        onPress={onRight}
      >
        <Icon name="search" />
        {penAvail && !pen ? <Muted>▶▶</Muted> : null}
      </Button>
    </Cluster>
  );
}

/** Shared by every render without a private view, so the selection stays equal. */
const NONE: readonly never[] = [];

function Enemies() {
  const t = useText();
  const enemies = useMatch((state) => state.private?.nextEnemies ?? NONE);
  const round = useMatch((state) => state.public?.round ?? null);
  const bossId = useMatch((state) => state.public?.bossId ?? null);
  const catalog = useMatchCatalog();
  const total = enemies.reduce((sum, enemy) => sum + enemy.count, 0);
  const openEnemy = (id: string, count: number): void => {
    selectionStore.setState({ uid: null, enemyDetail: { id, count } });
    hudStore.setState({ intel: null });
  };
  if (!enemies.length) {
    return <EmptyState title={t('core:match.noEnemies')} />;
  }
  return (
    <Stack gap={2}>
      <Muted>
        {round !== null
          ? t('core:match.enemyWave', { round, count: total })
          : t('core:match.nextEnemies')}
      </Muted>
      <ul className={cx(styles.enemyList)}>
        {enemies.map((enemy, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: a preview line is its index
          <li key={index}>
            <button
              type="button"
              className={cx(styles.enemyRow)}
              data-boss={enemy.boss || undefined}
              onClick={() => openEnemy(enemy.enemyKey, enemy.count)}
            >
              <EnemyThumb
                enemyId={enemy.enemyKey}
                name={dataName('enemy', enemy.enemyKey)}
                size="sm"
                elite={enemy.elite === true}
              />
              <span className={cx(styles.enemyRowText)}>
                <b className={cx(styles.enemyRowName)}>
                  {dataName('enemy', enemy.enemyKey)}
                </b>
                <Cluster gap={1}>
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
              </span>
              <b className={cx(styles.enemyRowCount)}>
                <Num>×{enemy.count}</Num>
              </b>
            </button>
          </li>
        ))}
      </ul>
      {bossId && catalog.bosses?.[bossId] ? (
        <div className={cx(styles.enemyBoss)}>
          <Cluster gap={2}>
            <EnemyThumb
              enemyId={catalog.bosses[bossId]?.enemyId ?? null}
              name={dataName('boss', bossId)}
              size="sm"
            />
            <Stack gap={1}>
              <span className={cx(styles.microLabel)}>
                {t('core:match.enemyLeader')}
              </span>
              <strong>{dataName('boss', bossId)}</strong>
            </Stack>
          </Cluster>
        </div>
      ) : null}
    </Stack>
  );
}

/** Match intel as master's EnemyDrawer: a panel under the top bar, not a full modal. */
export function Intel() {
  const t = useText();
  const page = useStore(hudStore, (state) => state.intel);
  const close = (): void => hudStore.setState({ intel: null });
  if (page === null) {
    return null;
  }
  return (
    <aside
      className={cx(styles.intelDrawer)}
      role="dialog"
      aria-label={
        page === 'info'
          ? t('core:briefing.heading')
          : t('core:match.nextEnemies')
      }
    >
      <div className={cx(styles.intelClose)}>
        <Button aria-label={t('core:common.close')} onPress={close}>
          <Icon name="close" />
        </Button>
      </div>
      <Tabs
        label={t('core:match.intel')}
        selected={page}
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
    </aside>
  );
}

const TOP_DEFAULTS: readonly PartInsert[] = [
  { into: 'core:match.hud.top', id: 'core:match.exit', order: 10 },
  { into: 'core:match.hud.top', id: 'core:match.round', order: 20 },
  { into: 'core:match.hud.top', id: 'core:match.lp', order: 30 },
  { into: 'core:match.hud.top', id: 'core:match.lens', order: 40 },
  { into: 'core:match.hud.top', id: 'core:match.clock', order: 50 },
  { into: 'core:match.hud.top', id: 'core:match.ready', order: 60 },
];

/** The top bar container. */
export function TopBar() {
  return (
    <div className={cx(styles.topbar)}>
      <Slot id="core:match.hud.top" defaults={TOP_DEFAULTS} />
    </div>
  );
}
