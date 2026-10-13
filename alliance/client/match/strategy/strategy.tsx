import { bandsForMode } from '@alliance/contract/catalog.js';
import { useIntent } from '../../infra/intent/context.js';
import {
  useMatch,
  useMatchCatalog,
  useSession,
} from '../../infra/store/hook.js';
import { dataName, has, lookup, useText } from '../../infra/text/index.js';
import { cx } from '../../infra/theme/class-name.js';
import { Button } from '../../ui/index.js';
import { Countdown } from '../countdown.js';
import styles from './screen.module.css';

export function StrategyScreen() {
  const t = useText();
  const intents = useIntent();
  const view = useMatch((state) => state.public);
  const playerId = useSession((state) => state.playerId);
  const catalog = useMatchCatalog();
  if (!view) {
    return null;
  }
  const draft = view.draft;
  const picks = draft?.picks ?? {};
  const taken = new Map(
    Object.entries(picks).map(([player, band]) => [band, player]),
  );
  const myPick = playerId ? (picks[playerId] ?? null) : null;
  const myTurn = !draft || draft.turn === playerId;
  const modeType = catalog.modes[view.modeId]?.type ?? null;
  const bands = bandsForMode(catalog, modeType);
  // master refuses a skip in a solo draft, and once the player's skips are used up
  const canSkip =
    modeType !== 'SINGLE' &&
    (playerId === null || (draft?.skipsLeft?.[playerId] ?? 1) > 0);
  const nameOf = (id: string): string =>
    view.players.find((player) => player.playerId === id)?.name ?? id;

  return (
    <div className={cx(styles.screen)}>
      <h1 className={cx(styles.heading)}>{t('core:strategy.heading')}</h1>
      <div className={cx(styles.row)}>
        <Countdown />
        {!myTurn || myPick ? (
          <span role="status" className={cx(styles.muted)}>
            {t('core:strategy.waiting')}
          </span>
        ) : null}
        {canSkip ? (
          <Button
            isDisabled={!myTurn || myPick !== null}
            onPress={() => void intents.dispatch({ type: 'g.bandSkip' })}
          >
            {t('core:strategy.skip')}
          </Button>
        ) : null}
      </div>
      <ul className={cx(styles.cards)}>
        {bands.map((band) => {
          const holder = taken.get(band.id);
          const descKey = `data:band.${band.id}.desc` as const;
          return (
            <li
              key={band.id}
              className={
                holder ? cx(styles.card, styles.cardTaken) : styles.card
              }
            >
              <strong>{dataName('band', band.id)}</strong>
              {has(descKey) ? (
                <p className={cx(styles.muted)}>{lookup(descKey)}</p>
              ) : null}
              <span className={cx(styles.number)}>
                {t('core:strategy.lp', { lp: band.totalHp })}
              </span>
              {holder ? (
                <span>
                  {t('core:strategy.taken')} · {nameOf(holder)}
                </span>
              ) : (
                <Button
                  variant="primary"
                  isDisabled={!myTurn || myPick !== null}
                  onPress={() =>
                    void intents.dispatch({
                      type: 'g.band',
                      fields: { bandId: band.id },
                    })
                  }
                >
                  {t('core:strategy.pick')}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
