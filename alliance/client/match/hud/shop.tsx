import { useIntent } from '../../infra/intent/context.js';
import { useMatch, useMatchCatalog } from '../../infra/store/hook.js';
import { useText } from '../../infra/text/index.js';
import { cx } from '../../infra/theme/class-name.js';
import { Button, Panel, ToggleButton } from '../../ui/index.js';
import { cardName, tierClass } from '../piece-label.js';
import styles from './preparation.module.css';

export function Shop({ canAct }: { readonly canAct: boolean }) {
  const t = useText();
  const intents = useIntent();
  const view = useMatch((state) => state.private);
  const catalog = useMatchCatalog();
  if (!view) {
    return null;
  }
  const { shop, funds } = view;
  const levelPrice = shop.upgradePrice;
  const refreshPrice = shop.freeRefreshes > 0 ? 0 : shop.refreshPrice;
  return (
    <Panel
      title={`${t('core:shop.heading')} · ${t('core:match.shopLevel', { level: shop.level })}`}
    >
      <ul className={cx(styles.slots)}>
        {shop.slots
          .map((slot, position) => ({ slot, position }))
          .map(({ slot, position }) => {
            if (!slot || slot.sold) {
              return (
                <li
                  key={position}
                  className={cx(styles.slot)}
                  aria-label={t('core:shop.empty')}
                />
              );
            }
            const name = cardName(slot);
            const chess =
              slot.kind === 'chess' ? catalog.chess[slot.id] : undefined;
            const tier = chess?.tier ?? catalog.items[slot.id]?.tier;
            return (
              <li key={position}>
                <Button
                  isDisabled={!canAct || funds < slot.price}
                  aria-label={t('core:shop.buy', { name, price: slot.price })}
                  onPress={() =>
                    void intents.dispatch({
                      type: 'g.buy',
                      fields: { slot: position },
                    })
                  }
                >
                  <span className={cx(styles.slot, tierClass(styles, tier))}>
                    <strong>{name}</strong>
                    <span>{slot.price}</span>
                  </span>
                </Button>
              </li>
            );
          })}
      </ul>
      <div className={cx(styles.actions)}>
        <Button
          isDisabled={!canAct || funds < refreshPrice}
          onPress={() => void intents.dispatch({ type: 'g.refresh' })}
        >
          {t('core:shop.refresh', { price: refreshPrice })}
        </Button>
        <ToggleButton
          isDisabled={!canAct}
          isSelected={shop.frozen}
          onChange={() => void intents.dispatch({ type: 'g.freeze' })}
        >
          {shop.frozen ? t('core:shop.unfreeze') : t('core:shop.freeze')}
        </ToggleButton>
        <Button
          isDisabled={
            !canAct || shop.level >= shop.maxLevel || funds < levelPrice
          }
          onPress={() => void intents.dispatch({ type: 'g.levelUp' })}
        >
          {t('core:shop.levelUp', { price: levelPrice })}
        </Button>
      </div>
      {shop.rewardOffer ? (
        <section aria-label={t('core:shop.reward')}>
          <h3>{t('core:shop.reward')}</h3>
          <ul className={cx(styles.slots)}>
            {shop.rewardOffer.slots.map((slot, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: an offer slot is its index
              <li key={index}>
                <Button
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
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </Panel>
  );
}
