import { useIntent } from '#infra/intent/context.js';
import { useMatch, useSession } from '#infra/store/hook.js';
import { useText } from '#infra/text/index.js';
import { cx } from '#infra/theme/class-name.js';
import { cardName } from '#match/piece-label.js';
import { Button, Panel } from '#ui/index.js';
import styles from './preparation.module.css';

/** A personal pick-one offer, and the shared pick of the SP draft. */
export function Choices({ canAct }: { readonly canAct: boolean }) {
  const t = useText();
  const intents = useIntent();
  const playerId = useSession((state) => state.playerId);
  const { personal, sp } = useMatch((state) => ({
    personal: state.private?.personalChoice ?? null,
    sp: state.public?.sp ?? null,
  }));
  if (personal) {
    return (
      <Panel title={t('core:choice.heading')}>
        <ul className={cx(styles.slots)}>
          {personal.cards.map((card, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: a choice is its index
            <li key={index}>
              <Button
                isDisabled={!canAct}
                onPress={() =>
                  void intents.dispatch({
                    type: 'g.choice',
                    fields: { idx: index, choiceId: personal.id },
                  })
                }
              >
                {cardName(card)}
              </Button>
            </li>
          ))}
        </ul>
      </Panel>
    );
  }
  if (sp) {
    const myTurn = sp.turn === null || sp.turn === playerId;
    const picked = playerId !== null && sp.picks[playerId] !== undefined;
    return (
      <Panel title={sp.name ?? t('core:choice.heading')}>
        {sp.desc ? <p>{sp.desc}</p> : null}
        <ul className={cx(styles.slots)}>
          {sp.cards.map((card, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: a card is its index
            <li key={index}>
              <Button
                isDisabled={
                  !canAct || !myTurn || picked || card.soldOut === true
                }
                onPress={() =>
                  void intents.dispatch({
                    type: 'g.choice',
                    fields: { idx: index },
                  })
                }
              >
                {cardName(card)}
              </Button>
            </li>
          ))}
        </ul>
      </Panel>
    );
  }
  return null;
}
