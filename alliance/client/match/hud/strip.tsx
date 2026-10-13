import type { BondView } from '@alliance/contract/server-message.js';
import { useStore } from 'zustand';
import {
  useMatch,
  useMatchCatalog,
  useSession,
} from '../../infra/store/hook.js';
import { dataName, has, lookup, useText } from '../../infra/text/index.js';
import { cx } from '../../infra/theme/class-name.js';
import { ChessThumb } from '../../part/art.js';
import {
  BondDisc,
  Button,
  Cluster,
  Dialog,
  Modal,
  Muted,
  Num,
  RichText,
  Stack,
  Tooltip,
} from '../../ui/index.js';
import { usePlayback } from '../playback-state.js';
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

/** The bonds of the player on screen: the own ones, or the watched player's. */
function useShownBonds(): readonly BondView[] {
  const playerId = useSession((state) => state.playerId);
  const watching = usePlayback((state) => state.battle?.fieldId ?? null);
  return useMatch((state) => {
    const watched = watching
      ? state.public?.players.find(
          (player) =>
            player.fieldId === watching && player.playerId !== playerId,
        )
      : undefined;
    return watched?.bonds ?? state.private?.bonds ?? NONE;
  });
}

function nextThreshold(bond: BondView): number {
  return (
    bond.thresholds?.find((threshold) => threshold > bond.count) ??
    bond.thresholds?.at(-1) ??
    bond.count
  );
}

/** The bond strip; a bond opens its detail. */
export function Bonds() {
  const t = useText();
  const bonds = useShownBonds();
  if (!bonds.length) {
    return null;
  }
  return (
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
            <BondDisc
              label={dataName('bond', bond.bondId)}
              count={bond.count}
              next={nextThreshold(bond)}
              state={state}
            />
          </Button>
        );
      })}
    </Cluster>
  );
}

/** A bond's detail: count, layers, levels and the members on the field. */
export function BondDetail() {
  const t = useText();
  const bondId = useStore(hudStore, (state) => state.bond);
  const bonds = useShownBonds();
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
    <Modal isOpen onOpenChange={(open) => !open && close()}>
      <Dialog
        title={dataName('bond', bond.bondId)}
        closeLabel={t('core:common.close')}
        onClose={close}
      >
        <Cluster gap={3}>
          <span>
            {t('core:bonds.count')} <Num>{bond.count}</Num>
          </span>
          <span>
            {t('core:bonds.layers')} <Num>{bond.layers}</Num>
          </span>
          {bond.off ? <Muted>{t('core:bonds.off')}</Muted> : null}
        </Cluster>
        <Cluster gap={1} label={t('core:bonds.levels')}>
          {(bond.thresholds ?? []).map((threshold) => (
            <BondDisc
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
              <Muted>{t('core:info.none')}</Muted>
            )}
          </Cluster>
        </Stack>
      </Dialog>
    </Modal>
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
