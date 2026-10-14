import { bandsForMode } from '@alliance/contract/catalog.js';
import { useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { useIntent } from '#infra/intent/context.js';
import { onMatchReset } from '#infra/store/frame.js';
import { useMatch, useMatchCatalog, useSession } from '#infra/store/hook.js';
import { dataName, has, lookup, useText } from '#infra/text/index.js';
import { cx } from '#infra/theme/class-name.js';
import { usePhaseSeconds } from '#match/countdown.js';
import styles from '#match/match.module.css';
import {
  autoPickBand,
  bandOffBonds,
  DEFAULT_TIMEOUT_BAND,
  draftSelection,
  teammateBands,
} from '#match/strategy/draft.js';
import { BandIcon } from '#part/art.js';
import { definePart, Part } from '#part/registry.js';
import {
  Avatar,
  Badge,
  Button,
  Cluster,
  Dialog,
  GridList,
  Icon,
  Modal,
  Muted,
  Num,
  Panel,
  RichText,
  Stack,
} from '#ui/index.js';

export const STRATEGY = {
  layout: 'core:strategy.layout',
  order: 'core:strategy.order',
  grid: 'core:strategy.grid',
  detail: 'core:strategy.detail',
} as const;

/** The strategy the player is looking at. Local to the draft. */
const focusStore = createStore<{ readonly bandId: string | null }>(() => ({
  bandId: null,
}));
onMatchReset(() => focusStore.setState({ bandId: null }));

/** Draft facts every strategy part reads. */
function useDraft() {
  const view = useMatch((state) => state.public);
  const playerId = useSession((state) => state.playerId);
  const catalog = useMatchCatalog();
  const focus = useStore(focusStore, (state) => state.bandId);
  const draft = view?.draft;
  const picks = draft?.picks ?? {};
  const myPick = playerId ? (picks[playerId] ?? null) : null;
  const mode = view ? catalog.modes[view.modeId] : undefined;
  const solo = (mode?.type ?? 'SINGLE') === 'SINGLE';
  const myTurn = !draft || solo || draft.turn === playerId;
  const skipsLeft = playerId ? (draft?.skipsLeft?.[playerId] ?? 1) : 0;
  // master refuses a skip in a solo draft, once the skips are used, and as the last one to pick
  const canSkip =
    !solo &&
    myTurn &&
    myPick === null &&
    skipsLeft > 0 &&
    (draft?.order ?? []).filter((id) => !(id in picks)).length > 1;
  const bands = bandsForMode(catalog, mode?.type ?? null);
  const taken = solo
    ? new Map<string, readonly string[]>()
    : teammateBands(picks, playerId);
  const defaultId = catalog.timeoutBandId ?? DEFAULT_TIMEOUT_BAND;
  const selected = draftSelection(focus, {
    bands,
    taken,
    myPick,
    myTurn,
    defaultId,
  });
  const off = new Set(mode?.inactiveBonds ?? []);
  const timed = !solo && !!draft && !draft.untimed;
  return {
    view,
    playerId,
    catalog,
    draft,
    picks,
    myPick,
    myTurn,
    solo,
    skipsLeft,
    canSkip,
    bands,
    taken,
    defaultId,
    selected,
    off,
    timed,
  };
}

/** The status under the order, in the detail, and in the info dialog: my pick, the taken one, or whose turn it is. */
function useTurnLine(): string | null {
  const t = useText();
  const { view, draft, myPick, myTurn, solo } = useDraft();
  if (!view) {
    return null;
  }
  if (myPick) {
    const name = dataName('band', myPick);
    return !solo &&
      draft &&
      Object.keys(draft.picks).length < draft.order.length
      ? t('core:strategy.pickedWaiting', { name })
      : t('core:strategy.picked', { name });
  }
  if (myTurn) {
    return t('core:strategy.myTurn');
  }
  const turnName = view.players.find(
    (player) => player.playerId === draft?.turn,
  )?.name;
  return turnName
    ? t('core:strategy.turnOf', { name: turnName })
    : t('core:strategy.waitTurn');
}

/** The tip under the co-op order: the one skip, the turn clock and what a timeout takes. */
function DraftTip() {
  const t = useText();
  const { draft, myPick, timed, bands, taken, defaultId, selected } =
    useDraft();
  if (!draft) {
    return null;
  }
  if (!timed) {
    return <Muted>{t('core:strategy.tipUntimed')}</Muted>;
  }
  const clock = draft.turnSeconds
    ? t('core:strategy.clock', { seconds: Math.round(draft.turnSeconds) })
    : t('core:strategy.clockAny');
  const auto = autoPickBand(selected, { bands, taken, myPick, defaultId });
  if (!auto) {
    return <Muted>{t('core:strategy.tipTimed', { clock })}</Muted>;
  }
  const name = dataName('band', auto);
  return (
    <Muted>
      {auto === selected
        ? t('core:strategy.tipAuto', { clock, name })
        : t('core:strategy.tipAutoDefault', { clock, name })}
    </Muted>
  );
}

/** The match info again, read-only, over the draft; a turn change closes it. */
function InfoDialog() {
  const t = useText();
  const { draft, myPick } = useDraft();
  const line = useTurnLine();
  const [open, setOpen] = useState(false);
  const turnKey = `${draft?.turn ?? ''}|${myPick ?? ''}`;
  const last = useRef(turnKey);
  useEffect(() => {
    if (last.current !== turnKey) {
      last.current = turnKey;
      setOpen(false);
    }
  }, [turnKey]);
  return (
    <>
      <Button onPress={() => setOpen(true)}>
        <Icon name="search" />
        {t('core:strategy.info')}
      </Button>
      <Modal isOpen={open} onOpenChange={setOpen}>
        <Dialog
          title={t('core:briefing.heading')}
          closeLabel={t('core:common.close')}
          onClose={() => setOpen(false)}
          actions={line ? <span role="status">{line}</span> : null}
        >
          <Part id="core:match.info" factions={false} />
        </Dialog>
      </Modal>
    </>
  );
}

/** The order of the pick and where each player stands; solo, only the player. */
function Order() {
  const t = useText();
  const { view, playerId, draft, picks, solo } = useDraft();
  const seconds = usePhaseSeconds(
    draft && !draft.untimed ? draft.turnDeadline : 0,
  );
  if (!view) {
    return null;
  }
  const order = solo
    ? [playerId ?? '']
    : (draft?.order ?? view.players.map((player) => player.playerId));
  return (
    <Panel title={solo ? t('core:strategy.solo') : t('core:strategy.order')}>
      <Stack as="ol" gap={2}>
        {order.map((id, index) => {
          const player = view.players.find((entry) => entry.playerId === id);
          const pick = picks[id] ?? null;
          const current = !pick && (solo || draft?.turn === id);
          return (
            <li
              key={id}
              className={cx(styles.orderRow)}
              data-current={current || undefined}
              data-done={pick ? true : undefined}
              data-me={id === playerId || undefined}
            >
              {solo ? null : <Num>{index + 1}</Num>}
              <Avatar name={player?.name ?? id} size="sm" framed={current} />
              <Stack gap={1}>
                <Cluster gap={1}>
                  <strong>{player?.name || t('core:room.doctor')}</strong>
                  {player?.isBot ? <Badge>{t('core:room.bot')}</Badge> : null}
                </Cluster>
                {pick ? (
                  <Badge tone="accent">{dataName('band', pick)}</Badge>
                ) : current ? (
                  <Badge tone="warn">
                    {t('core:strategy.choosing')}
                    {seconds !== null && !solo
                      ? ` ${t('core:strategy.seconds', { seconds })}`
                      : ''}
                  </Badge>
                ) : (
                  <Muted>{t('core:strategy.pending')}</Muted>
                )}
              </Stack>
              {pick ? <BandIcon bandId={pick} size="sm" /> : null}
            </li>
          );
        })}
      </Stack>
      <InfoDialog />
      {solo ? null : <DraftTip />}
    </Panel>
  );
}

/** The strategies on offer: icon, name, LP, off this match, who picked it. */
function StrategyGrid() {
  const t = useText();
  const intents = useIntent();
  const {
    view,
    picks,
    myPick,
    bands,
    taken,
    selected,
    off,
    timed,
    draft,
    playerId,
  } = useDraft();
  const reported = useRef<string | null>(null);
  // the highlighted strategy is what a turn that runs out takes: report each change before my pick
  useEffect(() => {
    if (!timed || myPick || !selected || reported.current === selected) {
      return;
    }
    if (!playerId || !draft?.order.includes(playerId)) {
      return;
    }
    reported.current = selected;
    void intents.dispatch({
      type: 'g.bandFocus',
      fields: { bandId: selected },
    });
  }, [timed, myPick, selected, playerId, draft, intents]);
  if (!view) {
    return null;
  }
  const nameOf = (id: string): string =>
    view.players.find((player) => player.playerId === id)?.name ?? id;
  const pickers = new Map<string, string[]>();
  for (const [player, band] of Object.entries(picks)) {
    pickers.set(band, [...(pickers.get(band) ?? []), player]);
  }
  return (
    <Panel title={t('core:strategy.heading')}>
      <GridList
        label={t('core:strategy.heading')}
        selected={selected}
        onSelect={(bandId) => focusStore.setState({ bandId })}
        items={bands.map((band) => {
          const isTaken = taken.has(band.id);
          const offBonds = bandOffBonds(band, off);
          return {
            id: band.id,
            label: dataName('band', band.id),
            content: (
              <div
                className={cx(styles.bandCard)}
                data-taken={isTaken || undefined}
              >
                <BandIcon bandId={band.id} size="md" />
                <strong>{dataName('band', band.id)}</strong>
                <Num>{t('core:strategy.lp', { lp: band.totalHp })}</Num>
                {offBonds.length ? (
                  <Badge tone="danger">{t('core:strategy.off')}</Badge>
                ) : null}
                {(pickers.get(band.id) ?? []).length ? (
                  <Cluster gap={1}>
                    {(pickers.get(band.id) ?? []).slice(0, 4).map((id) => (
                      <Avatar key={id} name={nameOf(id)} size="sm" />
                    ))}
                  </Cluster>
                ) : null}
                {isTaken ? (
                  <Badge tone="gold">{t('core:strategy.taken')}</Badge>
                ) : null}
              </div>
            ),
          };
        })}
      />
    </Panel>
  );
}

/** The highlighted strategy, the status, the skip and the confirm. */
function Detail() {
  const t = useText();
  const intents = useIntent();
  const {
    view,
    catalog,
    myPick,
    myTurn,
    solo,
    canSkip,
    skipsLeft,
    taken,
    selected,
    off,
  } = useDraft();
  const line = useTurnLine();
  if (!view) {
    return null;
  }
  const band = selected ? catalog.bands[selected] : undefined;
  const isTaken = band ? taken.has(band.id) : false;
  const offNames = band
    ? bandOffBonds(band, off).map((id) => dataName('bond', id))
    : [];
  const descKey = band ? `data:band.${band.id}.desc` : '';
  const effectKey = band ? `data:band.${band.id}.effect` : '';
  return (
    <Panel title={t('core:strategy.detail')}>
      {band ? (
        <Stack gap={2}>
          <BandIcon bandId={band.id} size="lg" />
          <Cluster gap={2}>
            <Muted>{t('core:strategy.hp')}</Muted>
            <Num>{band.totalHp}</Num>
          </Cluster>
          <strong>{dataName('band', band.id)}</strong>
          {offNames.length ? (
            <p role="note">
              <Icon name="info" />{' '}
              {t('core:strategy.offNote', {
                names: offNames
                  .map((name) => t('core:strategy.offName', { name }))
                  .join(''),
              })}
            </p>
          ) : null}
          <Muted>{t('core:strategy.effect')}</Muted>
          {has(effectKey) ? <strong>{lookup(effectKey)}</strong> : null}
          {has(descKey) ? <RichText source={lookup(descKey)} /> : null}
        </Stack>
      ) : (
        <Muted>{t('core:strategy.pickHint')}</Muted>
      )}
      <span role="status">
        <Muted>
          {!myPick && isTaken
            ? t('core:strategy.takenHint')
            : solo && !myPick
              ? null
              : line}
        </Muted>
      </span>
      <Cluster justify="end">
        {solo ? null : (
          <Button
            isDisabled={!canSkip}
            onPress={() => void intents.dispatch({ type: 'g.bandSkip' })}
          >
            {skipsLeft > 0
              ? t('core:strategy.skip')
              : t('core:strategy.skipUsed')}
          </Button>
        )}
        <Button
          variant="primary"
          isDisabled={!band || isTaken || !myTurn || myPick !== null}
          onPress={() =>
            band &&
            void intents.dispatch({
              type: 'g.band',
              fields: { bandId: band.id },
            })
          }
        >
          <Icon name="check" />
          {isTaken ? t('core:strategy.taken') : t('core:strategy.pick')}
        </Button>
      </Cluster>
    </Panel>
  );
}

/** The strategy draft: step head and three columns (order, grid, detail). */
function StrategyLayout() {
  const loaded = useMatch((state) => state.public !== null);
  if (!loaded) {
    return null;
  }
  return (
    <div className={cx(styles.step)} data-layout="strategy">
      <Part id="core:match.stephead" />
      <div className={cx(styles.draftColumns)}>
        <Part id={STRATEGY.order} />
        <Part id={STRATEGY.grid} />
        <Part id={STRATEGY.detail} />
      </div>
    </div>
  );
}

export function registerStrategyParts(): readonly (() => void)[] {
  return [
    definePart(STRATEGY.layout, StrategyLayout, { extensible: true }),
    definePart(STRATEGY.order, Order, { extensible: true }),
    definePart(STRATEGY.grid, StrategyGrid, { extensible: true }),
    definePart(STRATEGY.detail, Detail, { extensible: true }),
  ];
}
