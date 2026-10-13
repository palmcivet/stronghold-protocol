import type { PieceView } from '@alliance/contract/server-message.js';
import { useStore } from 'zustand';
import { useMatch } from '../../infra/store/hook.js';
import { useText } from '../../infra/text/index.js';
import { cx } from '../../infra/theme/class-name.js';
import { Panel, ToggleButton } from '../../ui/index.js';
import { pieceLabel } from '../piece-label.js';
import { selectionStore } from '../selection.js';
import styles from './preparation.module.css';

function Slots({
  pieces,
  canAct,
}: {
  readonly pieces: readonly (PieceView | null)[];
  readonly canAct: boolean;
}) {
  const t = useText();
  const selected = useStore(selectionStore, (state) => state.uid);
  return (
    <ul className={cx(styles.slots)}>
      {pieces
        .map((piece, slot) => ({ piece, slot }))
        .map(({ piece, slot }) =>
          piece ? (
            <li key={piece.uid}>
              <ToggleButton
                isDisabled={!canAct}
                isSelected={selected === piece.uid}
                onChange={(on) =>
                  selectionStore.setState({ uid: on ? piece.uid : null })
                }
              >
                {pieceLabel(piece)}
              </ToggleButton>
            </li>
          ) : (
            <li
              key={`empty-${slot}`}
              className={cx(styles.slot)}
              aria-label={t('core:field.empty')}
            />
          ),
        )}
    </ul>
  );
}

/** The bench and the temporary bench. Picking a piece selects it for the field and the unit actions. */
export function Bench({ canAct }: { readonly canAct: boolean }) {
  const t = useText();
  const view = useMatch((state) => state.private);
  if (!view) {
    return null;
  }
  return (
    <Panel title={t('core:bench.heading')}>
      <Slots pieces={view.hand} canAct={canAct} />
      {view.temp.some(Boolean) ? (
        <>
          <h3>{t('core:bench.temp')}</h3>
          <Slots pieces={view.temp} canAct={canAct} />
        </>
      ) : null}
    </Panel>
  );
}
