import { bandsForMode } from '@alliance/contract/catalog.js';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { useIntent } from '../../infra/intent/context.js';
import { onMatchReset } from '../../infra/store/frame.js';
import {
  useMatch,
  useMatchCatalog,
  useSession,
} from '../../infra/store/hook.js';
import { dataName, has, lookup, useText } from '../../infra/text/index.js';
import { cx } from '../../infra/theme/class-name.js';
import { definePart, Part } from '../../part/registry.js';
import {
  Avatar,
  Badge,
  Button,
  Cluster,
  GridList,
  Muted,
  Num,
  Panel,
  RichText,
  Stack,
} from '../../ui/index.js';
import { Countdown } from '../countdown.js';
import styles from '../match.module.css';

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
  const draft = view?.draft;
  const picks = draft?.picks ?? {};
  const myPick = playerId ? (picks[playerId] ?? null) : null;
  const myTurn = !draft || draft.turn === playerId;
  const modeType = view ? (catalog.modes[view.modeId]?.type ?? null) : null;
  // master refuses a skip in a solo draft, and once the player's skips are used up
  const canSkip =
    modeType !== 'SINGLE' &&
    (playerId === null || (draft?.skipsLeft?.[playerId] ?? 1) > 0);
  return {
    view,
    playerId,
    catalog,
    draft,
    picks,
    myPick,
    myTurn,
    modeType,
    canSkip,
  };
}

/** The order of the pick and where each player stands. */
function Order() {
  const t = useText();
  const { view, draft, picks } = useDraft();
  if (!view) {
    return null;
  }
  const order = draft?.order ?? view.players.map((player) => player.playerId);
  return (
    <Panel title={t('core:strategy.order')}>
      <Stack as="ol" gap={2}>
        {order.map((id, index) => {
          const player = view.players.find((entry) => entry.playerId === id);
          const pick = picks[id];
          return (
            <li key={id}>
              <Cluster gap={2}>
                <Num>{index + 1}</Num>
                <Avatar
                  name={player?.name ?? id}
                  size="sm"
                  framed={draft?.turn === id}
                />
                <span>{player?.name ?? id}</span>
                {pick ? (
                  <Badge tone="accent">{dataName('band', pick)}</Badge>
                ) : draft?.turn === id ? (
                  <Badge tone="warn">{t('core:strategy.choosing')}</Badge>
                ) : (
                  <Muted>{t('core:strategy.pending')}</Muted>
                )}
              </Cluster>
            </li>
          );
        })}
      </Stack>
      {draft && !draft.untimed ? (
        <Countdown deadline={draft.turnDeadline} />
      ) : null}
    </Panel>
  );
}

/** The strategies on offer; a teammate's pick is marked. */
function StrategyGrid() {
  const t = useText();
  const intents = useIntent();
  const { view, catalog, picks, modeType } = useDraft();
  const focus = useStore(focusStore, (state) => state.bandId);
  if (!view) {
    return null;
  }
  const taken = new Map(
    Object.entries(picks).map(([player, band]) => [band, player]),
  );
  const nameOf = (id: string): string =>
    view.players.find((player) => player.playerId === id)?.name ?? id;
  const bands = bandsForMode(catalog, modeType);
  return (
    <Panel title={t('core:strategy.heading')}>
      <GridList
        label={t('core:strategy.heading')}
        selected={focus}
        onSelect={(bandId) => {
          focusStore.setState({ bandId });
          void intents.dispatch({ type: 'g.bandFocus', fields: { bandId } });
        }}
        items={bands.map((band) => {
          const holder = taken.get(band.id);
          return {
            id: band.id,
            label: dataName('band', band.id),
            content: (
              <Stack gap={1}>
                <strong>{dataName('band', band.id)}</strong>
                <Num>{t('core:strategy.lp', { lp: band.totalHp })}</Num>
                {holder ? (
                  <Badge tone="gold">
                    {t('core:strategy.taken')} · {nameOf(holder)}
                  </Badge>
                ) : null}
              </Stack>
            ),
          };
        })}
      />
    </Panel>
  );
}

/** The focused strategy, the skip, and the confirm. */
function Detail() {
  const t = useText();
  const intents = useIntent();
  const { view, catalog, picks, myPick, myTurn, canSkip } = useDraft();
  const focus = useStore(focusStore, (state) => state.bandId);
  if (!view) {
    return null;
  }
  const band = focus ? catalog.bands[focus] : undefined;
  const taken = focus ? Object.values(picks).includes(focus) : false;
  const descKey = focus ? `data:band.${focus}.desc` : '';
  const effectKey = focus ? `data:band.${focus}.effect` : '';
  return (
    <Panel title={t('core:strategy.detail')}>
      {band ? (
        <Stack gap={2}>
          <strong>{dataName('band', band.id)}</strong>
          {has(effectKey) ? (
            <Badge tone="accent">{lookup(effectKey)}</Badge>
          ) : null}
          {has(descKey) ? <RichText source={lookup(descKey)} /> : null}
          <Num>{t('core:strategy.lp', { lp: band.totalHp })}</Num>
        </Stack>
      ) : (
        <Muted>{t('core:strategy.pickHint')}</Muted>
      )}
      {!myTurn || myPick ? (
        <span role="status">
          <Muted>{t('core:strategy.waiting')}</Muted>
        </span>
      ) : null}
      <Cluster justify="end">
        {canSkip ? (
          <Button
            isDisabled={!myTurn || myPick !== null}
            onPress={() => void intents.dispatch({ type: 'g.bandSkip' })}
          >
            {t('core:strategy.skip')}
          </Button>
        ) : null}
        <Button
          variant="primary"
          isDisabled={!band || taken || !myTurn || myPick !== null}
          onPress={() =>
            band &&
            void intents.dispatch({
              type: 'g.band',
              fields: { bandId: band.id },
            })
          }
        >
          {t('core:strategy.pick')}
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
      <div className={cx(styles.stepColumns)}>
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
