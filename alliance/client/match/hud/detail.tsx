import { PHASE } from '@alliance/contract/match.js';
import { type CSSProperties, type ReactNode, useEffect, useState } from 'react';
import { useStore } from 'zustand';
import { useIntent } from '#infra/intent/context.js';
import { combatDefsStore } from '#infra/store/combat-defs.js';
import { useMatch, useMatchCatalog, useStream } from '#infra/store/hook.js';
import { unitStatsStore } from '#infra/store/unit-stats.js';
import { dataName, has, lookup, useText } from '#infra/text/index.js';
import { cx } from '#infra/theme/class-name.js';
import {
  battleOpId,
  type LiveStatsView,
  liveStatsFromCatalog,
  liveStatsFromPrep,
  liveStatsFromUnit,
} from '#match/live-stats.js';
import { cardName } from '#match/piece-label.js';
import { usePlaybackRuntime } from '#match/playback-runtime.js';
import { findPiece, selectionStore } from '#match/selection.js';
import { EnemyThumb, PieceThumb } from '#part/art.js';
import {
  Badge,
  BondDisc,
  Button,
  Chip,
  Cluster,
  Icon,
  Muted,
  Num,
  RichText,
  Stack,
  TierChip,
} from '#ui/index.js';
import styles from './hud.module.css';
import { hudStore } from './state.js';

/** Shared empty lists so selectors stay equal. */
const NONE: readonly never[] = [];

function closeDetail(): void {
  selectionStore.setState({ uid: null, enemyDetail: null });
}

/** Header shared by chess / item / enemy cards. */
function Head({
  title,
  subtitle,
  chips,
  art,
}: {
  readonly title: string;
  readonly subtitle?: string | null;
  readonly chips: ReactNode;
  readonly art: ReactNode;
}) {
  const t = useText();
  return (
    <Cluster justify="between" gap={2}>
      <Cluster gap={2}>
        {art}
        <Stack gap={1}>
          <strong className={cx(styles.detailName)}>{title}</strong>
          {subtitle ? <Muted>{subtitle}</Muted> : null}
          <Cluster gap={1}>{chips}</Cluster>
        </Stack>
      </Cluster>
      <Button aria-label={t('core:common.close')} onPress={closeDetail}>
        <Icon name="close" />
      </Button>
    </Cluster>
  );
}

/** Bond chips of a chess: live strip state when the bond is on the board. */
function BondChips({ bondIds }: { readonly bondIds: readonly string[] }) {
  const t = useText();
  const live = useMatch((state) => state.private?.bonds ?? NONE);
  if (!bondIds.length) {
    return null;
  }
  return (
    <Cluster gap={1} label={t('core:bonds.heading')}>
      {bondIds.map((id) => {
        const view = live.find((bond) => bond.bondId === id);
        const top = view?.thresholds?.at(-1);
        const state = !view
          ? 'off'
          : view.off || !view.active
            ? 'off'
            : top !== undefined && view.count >= top
              ? 'max'
              : 'on';
        return (
          <Button key={id} onPress={() => hudStore.setState({ bond: id })}>
            <BondDisc
              label={dataName('bond', id)}
              count={view?.count ?? 0}
              next={
                view?.thresholds?.find(
                  (threshold) => threshold > (view?.count ?? 0),
                ) ??
                top ??
                0
              }
              state={state}
            />
          </Button>
        );
      })}
    </Cluster>
  );
}

/** One combat-stat cell (master dstat). */
function StatCell({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string | number;
}) {
  return (
    <div className={cx(styles.dstat)}>
      <span className={cx(styles.dstatK)}>{label}</span>
      <b className={cx(styles.dstatV)}>
        <Num>{value}</Num>
      </b>
    </div>
  );
}

/** Attack-range mini-map from combat-def / live range cells (master rgrid). */
function RangeGrid({
  cells,
}: {
  readonly cells: readonly (readonly [number, number])[];
}) {
  const t = useText();
  if (!cells.length) {
    return null;
  }
  const xs = cells.map((c) => c[0]);
  const ys = cells.map((c) => c[1]);
  const minX = Math.min(0, ...xs);
  const maxX = Math.max(0, ...xs);
  const minY = Math.min(0, ...ys);
  const maxY = Math.max(0, ...ys);
  const set = new Set(cells.map(([x, y]) => `${x},${y}`));
  const cols = maxX - minX + 1;
  const rows = maxY - minY + 1;
  if (cols * rows > 120) {
    return <Muted>{t('core:detail.rangeField')}</Muted>;
  }
  return (
    <div
      className={cx(styles.rgrid)}
      style={{ '--cols': cols } as CSSProperties}
      role="img"
      aria-label={t('core:detail.range')}
    >
      {Array.from({ length: rows }, (_, row) => {
        const y = maxY - row;
        return Array.from({ length: cols }, (_, col) => {
          const x = minX + col;
          const origin = x === 0 && y === 0;
          const on = set.has(`${x},${y}`);
          return (
            <span
              key={`${x},${y}`}
              className={cx(styles.rgridCell)}
              data-on={on || undefined}
              data-origin={origin || undefined}
            />
          );
        });
      })}
    </div>
  );
}

/** Live / prep / catalog stats + range (master detailPanel live branch). */
function CombatStats({
  defId,
  kind,
  pieceUid,
}: {
  readonly defId: string;
  readonly kind: 'chess' | 'enemy';
  readonly pieceUid?: number;
}) {
  const t = useText();
  const defs = useStore(combatDefsStore, (state) => state.defs);
  const prepStats = useStore(unitStatsStore, (state) => state.byUid);
  const prepRound = useStore(unitStatsStore, (state) => state.round);
  const round = useMatch((state) => state.public?.round ?? null);
  const phase = useMatch((state) => state.public?.phase ?? null);
  const intents = useIntent();
  const playback = usePlaybackRuntime();
  const streamUnits = useStream((state) => state.snapshot?.units ?? null);
  const streamUnit =
    pieceUid !== undefined && streamUnits
      ? streamUnits.find((each) => each.id === battleOpId(pieceUid))
      : undefined;
  const [, setTick] = useState(0);
  const combat =
    phase === PHASE.COMBAT ||
    phase === PHASE.UNITE ||
    phase === PHASE.FINAL_ASSAULT ||
    phase === PHASE.HIDDEN_CORE;
  const prep = phase === PHASE.PREP;

  // re-read local sim a few times a second while the card is open in battle
  useEffect(() => {
    if (!combat || pieceUid === undefined) {
      return;
    }
    const timer = setInterval(() => setTick((n) => n + 1), 250);
    return () => clearInterval(timer);
  }, [combat, pieceUid]);

  // ask the server for start-of-battle stats when a board piece is selected in prep
  useEffect(() => {
    if (!prep || pieceUid === undefined || kind !== 'chess') {
      return;
    }
    void intents.dispatch({
      type: 'g.unitStats',
      fields: {
        seq: ((round ?? 0) * 1000 + (Date.now() & 0x3ff)) & 0x7fffffff,
      },
    });
  }, [prep, pieceUid, kind, intents, round]);

  const def = kind === 'chess' ? defs.chess[defId] : defs.enemies[defId];
  let live: LiveStatsView | null = null;

  if (combat && pieceUid !== undefined && kind === 'chess') {
    const battle = playback?.local()?.battle;
    const unit = battle
      ?.snapshot()
      .units.find((each) => each.id === battleOpId(pieceUid));
    if (unit) {
      live = liveStatsFromUnit(unit, def ?? null, kind);
    }
  }
  // authoritative stream: overlay hp/maxHp when local sim is absent
  if (
    !live &&
    combat &&
    pieceUid !== undefined &&
    kind === 'chess' &&
    streamUnit
  ) {
    const base = liveStatsFromCatalog(def ?? null, kind);
    if (base) {
      live = {
        ...base,
        src: 'battle',
        hp: streamUnit.hp,
        maxHp: streamUnit.maxHp || base.maxHp,
      };
    }
  }
  if (!live && prep && pieceUid !== undefined && kind === 'chess') {
    const entry = prepRound === round ? prepStats.get(pieceUid) : undefined;
    live = liveStatsFromPrep(entry, def ?? null, kind);
  }
  if (!live) {
    live = liveStatsFromCatalog(def ?? null, kind);
  }
  if (!live) {
    return null;
  }

  const tag =
    live.src === 'battle'
      ? t('core:detail.statsLive')
      : live.src === 'prep'
        ? t('core:detail.statsPrep')
        : t('core:detail.stats');

  return (
    <Stack gap={2}>
      <Cluster gap={2} justify="between">
        <span className={cx(styles.microLabel)}>{tag}</span>
        {live.src === 'battle' ? (
          <span className={cx(styles.statsTag)} data-battle="">
            {t('core:detail.statsLive')}
          </span>
        ) : null}
      </Cluster>
      {live.src === 'battle' || live.hp < live.maxHp ? (
        <div
          className={cx(styles.dhp)}
          data-enemy={kind === 'enemy' || undefined}
        >
          <meter
            className={cx(styles.dhpMeter)}
            min={0}
            max={live.maxHp}
            value={live.hp}
            aria-label={t('core:detail.stat.hp')}
          />
          <i
            aria-hidden="true"
            style={{
              width: `${Math.max(0, Math.min(1, live.hp / Math.max(1, live.maxHp))) * 100}%`,
            }}
          />
          <span>
            <Num>{live.hp}</Num>/<Num>{live.maxHp}</Num>
          </span>
        </div>
      ) : null}

      <div className={cx(styles.dstats)}>
        <StatCell label={t('core:detail.stat.hp')} value={live.maxHp} />
        <StatCell label={t('core:detail.stat.atk')} value={live.atk} />
        <StatCell label={t('core:detail.stat.def')} value={live.def} />
        <StatCell label={t('core:detail.stat.res')} value={live.res} />
        {live.interval !== null ? (
          <StatCell
            label={t('core:detail.stat.interval')}
            value={live.interval}
          />
        ) : null}
        <StatCell label={t('core:detail.stat.block')} value={live.blockCnt} />
      </div>
      {live.range?.length ? <RangeGrid cells={live.range} /> : null}
    </Stack>
  );
}

/** Operator 特质 / garrison lines (master GarrisonBlock). */
function GarrisonBlock({
  garrisonIds,
}: {
  readonly garrisonIds: readonly string[];
}) {
  const t = useText();
  if (!garrisonIds.length) {
    return null;
  }
  return (
    <Stack gap={2} label={t('core:detail.garrison')}>
      {garrisonIds.map((id) => {
        const descKey = `data:garrison.${id}.desc`;
        const typeKey = `data:garrison.${id}.eventType`;
        if (!has(descKey)) {
          return null;
        }
        return (
          <Stack key={id} gap={1}>
            {has(typeKey) ? (
              <span className={cx(styles.microLabel)}>{lookup(typeKey)}</span>
            ) : null}
            <RichText source={lookup(descKey)} />
          </Stack>
        );
      })}
    </Stack>
  );
}

/** Skill / trait / module lines for a chess piece. */
function ChessLore({
  chessId,
  skillIndex,
  moduleId,
}: {
  readonly chessId: string;
  readonly skillIndex: number | null;
  readonly moduleId: string | null;
}) {
  const t = useText();
  const traitKey = `data:chess.${chessId}.trait`;
  const skillNameKey =
    skillIndex !== null ? `data:chess.${chessId}.skill.${skillIndex}.name` : '';
  const skillDescKey =
    skillIndex !== null ? `data:chess.${chessId}.skill.${skillIndex}.desc` : '';
  const moduleKey = moduleId ? `data:module.${moduleId}.desc` : '';
  return (
    <>
      {has(traitKey) ? (
        <Stack gap={1} label={t('core:detail.trait')}>
          <RichText source={lookup(traitKey)} />
        </Stack>
      ) : null}
      {skillIndex !== null && (has(skillNameKey) || has(skillDescKey)) ? (
        <Stack gap={1} label={t('core:detail.skill')}>
          {has(skillNameKey) ? (
            <span className={cx(styles.microLabel)}>
              {lookup(skillNameKey)}
            </span>
          ) : null}
          {has(skillDescKey) ? (
            <RichText source={lookup(skillDescKey)} />
          ) : null}
        </Stack>
      ) : null}
      {moduleId && has(moduleKey) ? (
        <Stack gap={1} label={t('core:detail.module')}>
          <RichText source={lookup(moduleKey)} />
        </Stack>
      ) : null}
    </>
  );
}

function ChessBody({
  pieceId,
  pieceUid,
  golden,
  tier,
  profession,
  bondIds,
  garrisonIds,
  items,
  skillIndex,
  moduleId,
}: {
  readonly pieceId: string;
  readonly pieceUid: number;
  readonly golden?: boolean;
  readonly tier?: number;
  readonly profession?: string | null;
  readonly bondIds: readonly string[];
  readonly garrisonIds: readonly string[];
  readonly items: readonly { readonly uid: number; readonly id: string }[];
  readonly skillIndex: number | null;
  readonly moduleId: string | null;
}) {
  const t = useText();
  const name = cardName({ kind: 'chess', id: pieceId });
  return (
    <>
      <Head
        title={name}
        art={
          <PieceThumb
            kind="chess"
            id={pieceId}
            elite={golden === true}
            {...(tier === undefined ? {} : { tier })}
            size="md"
          />
        }
        chips={
          <>
            {tier === undefined ? null : <TierChip tier={tier} />}
            {golden ? <Badge tone="gold">{t('core:unit.golden')}</Badge> : null}
            {profession ? <Badge>{profession}</Badge> : null}
          </>
        }
      />
      <CombatStats defId={pieceId} kind="chess" pieceUid={pieceUid} />
      <GarrisonBlock garrisonIds={garrisonIds} />
      <ChessLore
        chessId={pieceId}
        skillIndex={skillIndex}
        moduleId={moduleId}
      />
      <BondChips bondIds={bondIds} />
      {items.length ? (
        <Cluster gap={1} label={t('core:detail.items')}>
          {items.map((item) => (
            <Chip key={item.uid}>{dataName('item', item.id)}</Chip>
          ))}
        </Cluster>
      ) : null}
    </>
  );
}

function ItemBody({
  pieceId,
  tier,
}: {
  readonly pieceId: string;
  readonly tier?: number;
}) {
  const t = useText();
  const name = cardName({ kind: 'item', id: pieceId });
  const descKey = `data:item.${pieceId}.desc`;
  return (
    <>
      <Head
        title={name}
        art={
          <PieceThumb
            kind="item"
            id={pieceId}
            {...(tier === undefined ? {} : { tier })}
            size="md"
          />
        }
        chips={tier === undefined ? null : <TierChip tier={tier} />}
      />
      {has(descKey) ? <RichText source={lookup(descKey)} /> : null}
      {!has(descKey) ? <Muted>{t('core:detail.item')}</Muted> : null}
    </>
  );
}

function EnemyBody({
  enemyId,
  count,
}: {
  readonly enemyId: string;
  readonly count?: number;
}) {
  const t = useText();
  const catalog = useMatchCatalog();
  const enemy = catalog.enemies[enemyId];
  const name = dataName('enemy', enemyId);
  return (
    <>
      <Head
        title={name}
        art={<EnemyThumb enemyId={enemyId} name={name} size="md" />}
        chips={
          <>
            {enemy?.rank === 'ELITE' || enemy?.rank === 'elite' ? (
              <Badge tone="gold">{t('core:match.enemy.elite')}</Badge>
            ) : null}
            {enemy?.rank === 'BOSS' || enemy?.rank === 'boss' ? (
              <Badge tone="danger">{t('core:match.enemy.boss')}</Badge>
            ) : null}
            {enemy?.fly ? (
              <Badge tone="info">{t('core:match.enemy.fly')}</Badge>
            ) : null}
            {count !== undefined ? (
              <Badge>
                ×<Num>{count}</Num>
              </Badge>
            ) : null}
          </>
        }
      />
      <CombatStats defId={enemyId} kind="enemy" />
      <Muted>{t('core:detail.enemyNote')}</Muted>
    </>
  );
}

/**
 * Detail card as master's: the picked piece (operator trait / skill / bonds / gear, or item desc), or an enemy from
 * the intel drawer.
 */
export function Detail() {
  const view = useMatch((state) => state.private);
  const uid = useStore(selectionStore, (state) => state.uid);
  const enemy = useStore(selectionStore, (state) => state.enemyDetail);
  const catalog = useMatchCatalog();

  let body: ReactNode = null;
  if (enemy) {
    body = (
      <EnemyBody
        enemyId={enemy.id}
        {...(enemy.count === undefined ? {} : { count: enemy.count })}
      />
    );
  } else {
    const located = findPiece(view, uid);
    if (located) {
      const { piece } = located;
      if (piece.kind === 'item') {
        const tier = piece.tier ?? catalog.items[piece.id]?.tier;
        body = (
          <ItemBody
            pieceId={piece.id}
            {...(tier === undefined ? {} : { tier })}
          />
        );
      } else if (piece.kind === 'chess' || piece.kind === 'token') {
        const chess = catalog.chess[piece.id];
        const baseId = chess?.baseId ?? piece.id;
        const choice = view?.loadout[baseId];
        const diy = piece.diy;
        const skillIndex =
          diy?.skillIndex ?? choice?.skill ?? chess?.skills?.[0]?.index ?? null;
        const moduleId = diy?.uniEquipId ?? choice?.module ?? null;
        const tier = piece.tier ?? chess?.tier ?? undefined;
        body = (
          <ChessBody
            pieceId={piece.id}
            pieceUid={piece.uid}
            {...(piece.golden === undefined ? {} : { golden: piece.golden })}
            {...(tier === undefined ? {} : { tier })}
            profession={chess?.profession ?? null}
            bondIds={chess?.bondIds ?? NONE}
            garrisonIds={chess?.garrisonIds ?? NONE}
            items={piece.items ?? NONE}
            skillIndex={skillIndex}
            moduleId={moduleId}
          />
        );
      }
    }
  }

  if (!body) {
    return null;
  }

  return (
    <section
      className={cx(styles.float, styles.detail)}
      aria-label={enemy ? dataName('enemy', enemy.id) : undefined}
    >
      {body}
    </section>
  );
}
