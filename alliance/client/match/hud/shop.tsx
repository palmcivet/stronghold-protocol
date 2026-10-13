import type { ShopSlot } from '@alliance/contract/server-message.js';
import { useStore } from 'zustand';
import { useIntent } from '../../infra/intent/context.js';
import { useMatch, useMatchCatalog } from '../../infra/store/hook.js';
import { settingsStore } from '../../infra/store/settings.js';
import { dataName, useText } from '../../infra/text/index.js';
import { cx } from '../../infra/theme/class-name.js';
import { PieceThumb } from '../../part/art.js';
import { Part } from '../../part/registry.js';
import {
  Badge,
  Button,
  Cluster,
  Hotkey,
  Icon,
  Num,
  PriceHex,
  Stack,
  TierChip,
  ToggleButton,
  Tooltip,
} from '../../ui/index.js';
import { cardName } from '../piece-label.js';
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
    <li className={cx(styles.shopCard)} data-frozen={frozen || undefined}>
      <Tooltip tip={tip}>
        <Button
          isDisabled={!canAct || !affordable}
          aria-label={t('core:shop.buy', { name, price: slot.price })}
          onPress={() =>
            void intents.dispatch({ type: 'g.buy', fields: { slot: position } })
          }
        >
          <span className={cx(styles.shopFace)}>
            <span className={cx(styles.shopHead)}>
              {tier === undefined ? <span /> : <TierChip tier={tier} />}
              <PriceHex price={slot.price} affordable={affordable} />
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

/** Places left, freeze, refresh and level up, with their keys. */
export function ShopTools() {
  const t = useText();
  const intents = useIntent();
  const canAct = useCanAct();
  const keys = useStore(settingsStore, (state) => state.keys);
  const view = useMatch((state) => state.private);
  if (!view) {
    return null;
  }
  const { shop, funds } = view;
  const refreshPrice = shop.freeRefreshes > 0 ? 0 : shop.refreshPrice;
  return (
    <Stack gap={2}>
      <Cluster gap={2}>
        <Badge>
          {t('core:match.deploy', {
            count: view.deployCount,
            cap: view.deployCap,
          })}
        </Badge>
        <span>
          {t('core:match.funds')} <Num>{funds}</Num>
        </span>
      </Cluster>
      <Cluster gap={2}>
        <Button
          isDisabled={
            !canAct || shop.level >= shop.maxLevel || funds < shop.upgradePrice
          }
          onPress={() => void intents.dispatch({ type: 'g.levelUp' })}
        >
          {t('core:shop.levelUp', { price: shop.upgradePrice })}{' '}
          <Hotkey code={keys.levelUp} />
        </Button>
        <Button
          isDisabled={!canAct || funds < refreshPrice}
          onPress={() => void intents.dispatch({ type: 'g.refresh' })}
        >
          {t('core:shop.refresh', { price: refreshPrice })}{' '}
          <Hotkey code={keys.refresh} />
        </Button>
        <ToggleButton
          isDisabled={!canAct}
          isSelected={shop.frozen}
          onChange={() => void intents.dispatch({ type: 'g.freeze' })}
        >
          {shop.frozen ? t('core:shop.unfreeze') : t('core:shop.freeze')}{' '}
          <Hotkey code={keys.freeze} />
        </ToggleButton>
      </Cluster>
    </Stack>
  );
}

/** The shop bar: its level, the cards and the tools. */
export function Shop() {
  const t = useText();
  const shop = useMatch((state) => state.private?.shop ?? null);
  if (!shop) {
    return null;
  }
  return (
    <section className={cx(styles.shop)} aria-label={t('core:shop.heading')}>
      <Stack gap={1}>
        <strong>{t('core:shop.heading')}</strong>
        <Badge tone="accent">
          {t('core:match.shopLevel', { level: shop.level })}
        </Badge>
      </Stack>
      <ul className={cx(styles.shopCards)}>
        {shop.slots.map((slot, position) => (
          <Part
            // biome-ignore lint/suspicious/noArrayIndexKey: a shop slot is its position
            key={position}
            id="core:match.shop-card"
            slot={slot}
            position={position}
          />
        ))}
      </ul>
      <Part id="core:match.shop-tools" />
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
