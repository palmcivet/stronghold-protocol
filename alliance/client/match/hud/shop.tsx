import type { ShopSlot } from '@alliance/contract/server-message.js';
import {
  Badge,
  Button,
  Cluster,
  cx,
  HexBadge,
  Icon,
  Stack,
  Text,
  ToggleButton,
  Tooltip,
} from '@alliance/ui';
import { useMemo, useRef } from 'react';
import { useStore } from 'zustand';
import { useIntent } from '#infra/intent/context.js';
import { useMatch, useMatchCatalog } from '#infra/store/hook.js';
import { dataName, has, lookup, useText } from '#infra/text/index.js';
import { createShopCardDrag } from '#match/hud/shop-drag.js';
import { cardName } from '#match/piece-label.js';
import { PieceThumb } from '#part/art.js';
import { TierBadge } from '#part/badge.js';
import { BoundHotkey } from '#part/hotkey.js';
import { Part } from '#part/registry.js';
import styles from './hud.module.css';
import { hudStore } from './state.js';

/** Whether the player can act on the shop now: alive and in a preparation phase. */
export function useCanAct(): boolean {
  return useMatch((state) => {
    const phase = state.public?.phase;
    return (
      state.private?.alive === true &&
      (phase === 'PREP' || phase === 'SP_DRAFT')
    );
  });
}

/** One shop card: tier, price, portrait, bonds, frozen, merge progress. A press buys it. */
export function ShopCard({
  slot,
  position,
}: {
  readonly slot: ShopSlot | null;
  readonly position: number;
}) {
  const t = useText();
  const intents = useIntent();
  const canAct = useCanAct();
  const funds = useMatch((state) => state.private?.funds ?? 0);
  const owned = useMatch((state) => {
    if (!slot || !state.private) {
      return 0;
    }
    const pieces = [
      ...state.private.board,
      ...state.private.hand,
      ...state.private.temp,
    ];
    return pieces.filter((piece) => piece?.id === slot.id && !piece.golden)
      .length;
  });
  const frozen = useMatch((state) => state.private?.shop.frozen ?? false);
  const catalog = useMatchCatalog();
  const live = useRef({ canAct, funds, intents, position, slot });
  live.current = { canAct, funds, intents, position, slot };
  const drag = useMemo(() => {
    if (!slot || slot.sold) {
      return null;
    }
    return createShopCardDrag({
      intents,
      canAct: () => live.current.canAct,
      affordable: () =>
        (live.current.slot?.price ?? Infinity) <= live.current.funds,
      slot: position,
      card: slot,
    });
  }, [intents, position, slot]);
  if (!slot || slot.sold) {
    return (
      <li
        className={cx(styles.shopCard)}
        data-empty
        aria-label={t('core:shop.empty')}
      />
    );
  }
  const chess = slot.kind === 'chess' ? catalog.chess[slot.id] : undefined;
  const tier = chess?.tier ?? catalog.items[slot.id]?.tier;
  const name = cardName(slot);
  const affordable = funds >= slot.price;
  const tip = (
    <Stack gap={1}>
      <strong>{name}</strong>
      {chess?.bondIds.length ? (
        <span>
          {chess.bondIds.map((id) => dataName('bond', id)).join(' · ')}
        </span>
      ) : null}
    </Stack>
  );
  return (
    <li
      className={cx(styles.shopCard)}
      data-frozen={frozen || undefined}
      onPointerDownCapture={drag?.onPointerDown}
      onPointerMoveCapture={drag?.onPointerMove}
      onPointerUpCapture={drag?.onPointerUp}
      onPointerCancelCapture={drag?.onPointerCancel}
    >
      <Tooltip tip={tip}>
        <Button
          isDisabled={!canAct || !affordable}
          aria-label={t('core:shop.buy', { name, price: slot.price })}
          excludeFromTabOrder={false}
          onPress={() =>
            void intents.dispatch({ type: 'g.buy', fields: { slot: position } })
          }
          // Pointer buy/drag is owned by the <li>; keep onPress for keyboard.
          style={{ pointerEvents: 'none' }}
        >
          <span className={cx(styles.shopFace)}>
            <span className={cx(styles.shopHead)}>
              {tier === undefined ? <span /> : <TierBadge tier={tier} />}
              <HexBadge tone={affordable ? 'gold' : 'neutral'}>
                {slot.price}
              </HexBadge>
            </span>
            <PieceThumb
              kind={slot.kind}
              id={slot.id}
              {...(tier === undefined ? {} : { tier })}
            />
            <strong className={cx(styles.shopName)}>{name}</strong>
            {chess?.bondIds.length ? (
              <span className={cx(styles.shopBonds)}>
                {chess.bondIds.map((id) => dataName('bond', id)).join(' · ')}
              </span>
            ) : null}
            {has(`data:chess.${slot.id}.subProfession`) ? (
              <span className={cx(styles.shopSub)}>
                {lookup(`data:chess.${slot.id}.subProfession`)}
              </span>
            ) : null}
            {slot.kind === 'item' && has(`data:item.${slot.id}.desc`) ? (
              <span className={cx(styles.shopSub)}>
                {lookup(`data:item.${slot.id}.desc`)}
              </span>
            ) : null}
            {slot.kind === 'chess' && owned > 0 ? (
              <Badge tone="accent">
                {t('core:shop.merge', { count: owned, need: 3 })}
              </Badge>
            ) : null}
            {frozen ? (
              <Icon name="freeze" label={t('core:shop.freeze')} />
            ) : null}
          </span>
        </Button>
      </Tooltip>
    </li>
  );
}

/** The level card: LEVEL, the level, the upgrade price; a press levels the shop up. */
function LevelCard() {
  const t = useText();
  const intents = useIntent();
  const canAct = useCanAct();
  const view = useMatch((state) => state.private);
  if (!view) {
    return null;
  }
  const { shop, funds } = view;
  const max = shop.level >= shop.maxLevel;
  return (
    <li className={cx(styles.shopCard, styles.levelCard)}>
      <Button
        isDisabled={!canAct || max || funds < shop.upgradePrice}
        aria-label={
          max
            ? t('core:shop.maxLevel')
            : t('core:shop.levelUp', { price: shop.upgradePrice })
        }
        onPress={() => void intents.dispatch({ type: 'g.levelUp' })}
      >
        <span className={cx(styles.shopFace)}>
          <span className={cx(styles.shopHead)}>
            <span />
            {max ? null : (
              <HexBadge tone={funds >= shop.upgradePrice ? 'gold' : 'neutral'}>
                {shop.upgradePrice}
              </HexBadge>
            )}
          </span>
          <span className={cx(styles.levelMicro)}>LEVEL</span>
          <Text variant="number">{shop.level}</Text>
          <strong>
            {max ? t('core:shop.maxLevel') : t('core:shop.upgrade')}
          </strong>
          <BoundHotkey id="core:levelUp" />
        </span>
      </Button>
    </li>
  );
}

/** The funds card at the end of the row, with the collapse. */
function FundsCard() {
  const t = useText();
  const funds = useMatch((state) => state.private?.funds ?? 0);
  return (
    <li className={cx(styles.shopCard, styles.fundsCard)}>
      <span className={cx(styles.fundsValue)}>
        <Text variant="number">{funds}</Text>
      </span>
      <span>{t('core:shop.funds')}</span>
      <Button onPress={() => hudStore.setState({ shopCollapsed: true })}>
        <Icon name="close" />
        {t('core:shop.collapse')}
      </Button>
    </li>
  );
}

/** Above the cards: places left, freeze and refresh, with their keys. */
export function ShopTools() {
  const t = useText();
  const intents = useIntent();
  const canAct = useCanAct();
  const view = useMatch((state) => state.private);
  if (!view) {
    return null;
  }
  const { shop, funds } = view;
  const refreshPrice = shop.freeRefreshes > 0 ? 0 : shop.refreshPrice;
  const remaining = Math.max(0, view.deployCap - view.deployCount);
  return (
    <div className={cx(styles.shopTools)}>
      <span
        className={cx(styles.remain)}
        data-none={remaining === 0 || undefined}
      >
        {t('core:shop.remaining')}
        <Text variant="number">{remaining}</Text>
      </span>
      <ToggleButton
        isDisabled={!canAct}
        isSelected={shop.frozen}
        onChange={() => void intents.dispatch({ type: 'g.freeze' })}
      >
        <Icon name="freeze" />
        {shop.frozen ? t('core:shop.unfreeze') : t('core:shop.freeze')}{' '}
        <BoundHotkey id="core:freeze" />
      </ToggleButton>
      <Button
        isDisabled={!canAct || funds < refreshPrice}
        onPress={() => void intents.dispatch({ type: 'g.refresh' })}
      >
        <Icon name="refresh" />
        {t('core:shop.refresh', { price: refreshPrice })}{' '}
        <BoundHotkey id="core:refresh" />
      </Button>
    </div>
  );
}

/** The shop bar, as master's: the tools above; the level card, the cards and the funds card. Collapsible. */
export function Shop() {
  const t = useText();
  const shop = useMatch((state) => state.private?.shop ?? null);
  const funds = useMatch((state) => state.private?.funds ?? 0);
  const collapsed = useStore(hudStore, (state) => state.shopCollapsed);
  if (!shop) {
    return null;
  }
  if (collapsed) {
    return (
      <div className={cx(styles.shopTab)}>
        <span className={cx(styles.shopTabFunds)}>
          <Text variant="number">{funds}</Text>
          <span>{t('core:shop.funds')}</span>
        </span>
        <Button onPress={() => hudStore.setState({ shopCollapsed: false })}>
          <Icon name="chevron-left" />
          {t('core:shop.expand')}
        </Button>
      </div>
    );
  }
  // master's row: level, chess offers, item offers (dashed), funds
  const chess = shop.slots
    .map((slot, position) => ({ slot, position }))
    .filter(({ slot }) => slot?.kind !== 'item');
  const items = shop.slots
    .map((slot, position) => ({ slot, position }))
    .filter(({ slot }) => slot !== null && slot.kind === 'item');
  return (
    <section className={cx(styles.shop)} aria-label={t('core:shop.heading')}>
      <Part id="core:match.shop-tools" />
      <div className={cx(styles.shopRow)}>
        <ul className={cx(styles.shopCards)}>
          <LevelCard />
          {chess.map(({ slot, position }) => (
            <Part
              key={position}
              id="core:match.shop-card"
              slot={slot}
              position={position}
            />
          ))}
        </ul>
        {items.length ? (
          <ul className={cx(styles.shopItems)}>
            {items.map(({ slot, position }) => (
              <Part
                key={position}
                id="core:match.shop-card"
                slot={slot}
                position={position}
              />
            ))}
          </ul>
        ) : null}
        <ul className={cx(styles.shopCards, styles.shopFunds)}>
          <FundsCard />
        </ul>
      </div>
    </section>
  );
}

/** A pending reward: pick one now, or later from this prompt. */
export function Reward() {
  const t = useText();
  const intents = useIntent();
  const canAct = useCanAct();
  const offer = useMatch((state) => state.private?.shop.rewardOffer ?? null);
  const later = useStore(hudStore, (state) => state.rewardLater);
  if (!offer) {
    return null;
  }
  if (later) {
    return (
      <Button
        variant="primary"
        onPress={() => hudStore.setState({ rewardLater: false })}
      >
        {t('core:shop.rewardRecall', { count: (offer.queued ?? 0) + 1 })}
      </Button>
    );
  }
  return (
    <section className={cx(styles.float)} aria-label={t('core:shop.reward')}>
      <strong>{offer.label ?? t('core:shop.reward')}</strong>
      <Cluster gap={2}>
        {offer.slots.map((slot, index) => (
          <Button
            // biome-ignore lint/suspicious/noArrayIndexKey: an offer slot is its index
            key={index}
            isDisabled={!canAct || slot.sold === true}
            onPress={() =>
              void intents.dispatch({
                type: 'g.reward',
                fields: { idx: index },
              })
            }
          >
            {cardName(slot)}
          </Button>
        ))}
      </Cluster>
      <Button onPress={() => hudStore.setState({ rewardLater: true })}>
        {t('core:shop.rewardLater')}
      </Button>
    </section>
  );
}
