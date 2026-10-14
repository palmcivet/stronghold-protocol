import { DIRS } from '@alliance/contract/match.js';
import { useStore } from 'zustand';
import { useIntent } from '#infra/intent/context.js';
import { useMatch } from '#infra/store/hook.js';
import { lookup, useText } from '#infra/text/index.js';
import { cx } from '#infra/theme/class-name.js';
import { pieceLabel } from '#match/piece-label.js';
import { findPiece, freeHandSlot, selectionStore } from '#match/selection.js';
import { Button, ChoiceGroup, Panel } from '#ui/index.js';
import styles from './preparation.module.css';

/** Actions on the selected piece. */
export function UnitActions({ canAct }: { readonly canAct: boolean }) {
  const t = useText();
  const intents = useIntent();
  const view = useMatch((state) => state.private);
  const uid = useStore(selectionStore, (state) => state.uid);
  const located = findPiece(view, uid);
  if (!view || !located) {
    return null;
  }
  const { piece, area } = located;
  const handSlot = freeHandSlot(view);
  const clear = (): void => selectionStore.setState({ uid: null });
  return (
    <Panel title={pieceLabel(piece)} level={3}>
      <div className={cx(styles.actions)}>
        {piece.kind !== 'item' ? (
          <Button
            isDisabled={!canAct}
            onPress={async () => {
              await intents.dispatch({
                type: 'g.sell',
                fields: { uid: piece.uid },
              });
              clear();
            }}
          >
            {t('core:unit.sell')}
          </Button>
        ) : area !== 'board' ? (
          <Button
            isDisabled={!canAct}
            onPress={async () => {
              await intents.dispatch({
                type: 'g.destroy',
                fields: { uid: piece.uid },
              });
              clear();
            }}
          >
            {t('core:unit.destroy')}
          </Button>
        ) : null}
        {area !== 'hand' && handSlot !== null && piece.kind !== 'item' ? (
          <Button
            isDisabled={!canAct}
            onPress={async () => {
              await intents.dispatch({
                type: 'g.move',
                fields: { uid: piece.uid, to: { area: 'hand', idx: handSlot } },
              });
              clear();
            }}
          >
            {t('core:unit.toBench')}
          </Button>
        ) : null}
      </div>
      {area === 'board' &&
      piece.kind !== 'item' &&
      piece.row !== undefined &&
      piece.col !== undefined ? (
        <ChoiceGroup
          label={t('core:unit.facing')}
          value={piece.dir ?? 'RIGHT'}
          isDisabled={!canAct}
          onChange={(dir) =>
            void intents.dispatch({
              type: 'g.move',
              fields: {
                uid: piece.uid,
                to: { area: 'board', row: piece.row, col: piece.col },
                dir,
              },
            })
          }
          options={DIRS.map((dir) => ({
            value: dir,
            label: lookup(`core:dir.${dir}`),
          }))}
        />
      ) : null}
      <p className="wsde-visually-hidden">{t('core:unit.deploy')}</p>
    </Panel>
  );
}
