import type { BondView } from '@alliance/contract/server-message.js';
import {
  Button,
  Cluster,
  cx,
  Dialog,
  Icon,
  RichText,
  Stack,
  Text,
  Tooltip,
} from '@alliance/ui';
import { useStore } from 'zustand';
import { useMatch, useMatchCatalog, useSession } from '#infra/store/hook.js';
import { dataName, has, lookup, useText } from '#infra/text/index.js';
import { usePlayback } from '#match/playback-state.js';
import { ChessThumb } from '#part/art.js';
import { BondBadge } from '#part/badge.js';
import styles from './hud.module.css';
import { hudStore } from './state.js';

/** Shared by every render without the lists, so the selection stays equal. */
const NONE: readonly never[] = [];

/** The broadcast line: the latest lines of the ticker. */
export function Ticker() {
  const t = useText();
  const lines = useMatch((state) => state.ticker);
  return (
    <ol
      role="log"
      aria-live="polite"
      aria-label={t('core:ticker.heading')}
      className={cx(styles.ticker)}
    >
      {lines.slice(-3).map((line) => (
        <li key={line.id}>{line.text}</li>
      ))}
    </ol>
  );
}

/** Bonds on screen and, when watching a teammate, that player's name. */
function useShownBonds(): {
  readonly bonds: readonly BondView[];
  readonly owner: string | null;
} {
  const playerId = useSession((state) => state.playerId);
  const watching = usePlayback((state) => state.battle?.fieldId ?? null);
  return useMatch((state) => {
    const watched = watching
      ? state.public?.players.find(
          (player) =>
            player.fieldId === watching && player.playerId !== playerId,
        )
      : undefined;
    return {
      bonds: watched?.bonds ?? state.private?.bonds ?? NONE,
      owner: watched?.name ?? null,
    };
  });
}

function nextThreshold(bond: BondView): number {
  return (
    bond.thresholds?.find((threshold) => threshold > bond.count) ??
    bond.thresholds?.at(-1) ??
    bond.count
  );
}

/** The bond strip; a bond opens its detail. Collapses like master's bonds-toggle. */
export function Bonds() {
  const t = useText();
  const { bonds, owner } = useShownBonds();
  const collapsed = useStore(hudStore, (state) => state.bondsCollapsed);
  const toggle = (): void => {
    hudStore.setState((state) => ({
      bondsCollapsed: !state.bondsCollapsed,
      bond: state.bondsCollapsed ? state.bond : null,
    }));
  };
  return (
    <div className={cx(styles.bonds)} data-other={owner ? '' : undefined}>
      <Button
        aria-expanded={!collapsed}
        aria-controls="match-bond-strip"
        aria-label={
          collapsed ? t('core:bonds.expand') : t('core:bonds.collapse')
        }
        onPress={toggle}
      >
        <Icon name={collapsed ? 'chevron-right' : 'chevron-left'} />
      </Button>
      <div
        id="match-bond-strip"
        className={cx(styles.bondList)}
        hidden={collapsed}
      >
        {owner ? (
          <span className={cx(styles.bondsOwner)} title={owner}>
            <Icon name="eye" />
            <span>{owner}</span>
          </span>
        ) : null}
        {!bonds.length ? (
          <span className={cx(styles.bondsEmpty)}>
            <span className={cx(styles.microLabel)}>BONDS</span>
            {t('core:bonds.empty')}
          </span>
        ) : (
          <Cluster gap={1} label={t('core:bonds.heading')}>
            {bonds.map((bond) => {
              const top = bond.thresholds?.at(-1);
              const state = bond.off
                ? 'off'
                : !bond.active
                  ? 'off'
                  : top !== undefined && bond.count >= top
                    ? 'max'
                    : 'on';
              return (
                <Button
                  key={bond.bondId}
                  onPress={() => hudStore.setState({ bond: bond.bondId })}
                >
                  <BondBadge
                    label={dataName('bond', bond.bondId)}
                    count={bond.count}
                    next={nextThreshold(bond)}
                    state={state}
                  />
                </Button>
              );
            })}
          </Cluster>
        )}
      </div>
    </div>
  );
}

/** A bond's detail: count, layers, levels and the members on the field. */
export function BondDetail() {
  const t = useText();
  const bondId = useStore(hudStore, (state) => state.bond);
  const { bonds } = useShownBonds();
  const board = useMatch((state) => state.private?.board ?? NONE);
  const catalog = useMatchCatalog();
  const bond = bonds.find((entry) => entry.bondId === bondId) ?? null;
  const close = (): void => hudStore.setState({ bond: null });
  if (!bond) {
    return null;
  }
  const members = board.filter(
    (piece) =>
      piece.kind === 'chess' &&
      catalog.chess[piece.id]?.bondIds.includes(bond.bondId),
  );
  const descKey = `data:bond.${bond.bondId}.desc`;
  return (
    <Dialog
      isOpen
      onOpenChange={(open) => !open && close()}
      title={dataName('bond', bond.bondId)}
      closeLabel={t('core:common.close')}
    >
      <Cluster gap={3}>
        <span>
          {t('core:bonds.count')} <Text variant="number">{bond.count}</Text>
        </span>
        <span>
          {t('core:bonds.layers')} <Text variant="number">{bond.layers}</Text>
        </span>
        {bond.off ? <Text kind="muted">{t('core:bonds.off')}</Text> : null}
      </Cluster>
      <Cluster gap={1} label={t('core:bonds.levels')}>
        {(bond.thresholds ?? []).map((threshold) => (
          <BondBadge
            key={threshold}
            label={String(threshold)}
            count={threshold}
            state={bond.count >= threshold ? 'on' : 'off'}
          />
        ))}
      </Cluster>
      {has(descKey) ? <RichText source={lookup(descKey)} /> : null}
      <Stack gap={2}>
        <strong>{t('core:bonds.members')}</strong>
        <Cluster gap={1}>
          {members.length ? (
            members.map((piece) => {
              const tier = catalog.chess[piece.id]?.tier;
              return (
                <ChessThumb
                  key={piece.uid}
                  chessId={piece.id}
                  size="sm"
                  elite={piece.golden === true}
                  {...(tier === undefined ? {} : { tier })}
                />
              );
            })
          ) : (
            <Text kind="muted">{t('core:info.none')}</Text>
          )}
        </Cluster>
      </Stack>
    </Dialog>
  );
}

/** The effects in force, with their description on hover. */
export function Effects() {
  const t = useText();
  const effects = useMatch((state) => state.private?.effects ?? NONE);
  if (!effects.length) {
    return null;
  }
  return (
    <Stack as="ul" gap={1} label={t('core:match.effects')}>
      {effects.map((effect) => (
        <li key={effect.id}>
          <Tooltip
            tip={
              effect.desc ? (
                <RichText source={effect.desc} />
              ) : (
                (effect.name ?? effect.id)
              )
            }
          >
            <Button>{effect.name ?? effect.id}</Button>
          </Tooltip>
        </li>
      ))}
    </Stack>
  );
}
