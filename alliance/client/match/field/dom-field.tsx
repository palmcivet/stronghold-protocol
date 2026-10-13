import { GEO } from '@alliance/contract/match.js';
import { type KeyboardEvent, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { useIntent } from '../../infra/intent/context.js';
import { useMatch } from '../../infra/store/hook.js';
import { useText } from '../../infra/text/index.js';
import { cx } from '../../infra/theme/class-name.js';
import { equipItem } from '../equip.js';
import { pieceLabel } from '../piece-label.js';
import { findPiece, pieceAt, selectionStore } from '../selection.js';
import styles from './field.module.css';

const { r0, r1, c0, c1 } = GEO.FIELD;
/** Rows from the top of the screen: the highest row first. */
const ROWS = Array.from({ length: r1 - r0 + 1 }, (_, index) => r1 - index);
const COLS = Array.from({ length: c1 - c0 + 1 }, (_, index) => c0 + index);

/**
 * The deployable board as a grid the keyboard and screen readers can use. Arrow keys move the focus; Enter or Space
 * picks the piece on a tile, or puts the picked piece there.
 */
export function DomField({ canAct }: { readonly canAct: boolean }) {
  const t = useText();
  const intents = useIntent();
  const view = useMatch((state) => state.private);
  const selected = useStore(selectionStore, (state) => state.uid);
  const [focus, setFocus] = useState<readonly [number, number]>([
    ROWS[0] ?? r1,
    c0,
  ]);
  const grid = useRef<HTMLTableElement>(null);

  const activate = async (row: number, col: number): Promise<void> => {
    if (!canAct) {
      return;
    }
    const occupant = pieceAt(view, row, col);
    const holding = findPiece(view, selected);
    if (!holding) {
      selectionStore.setState({ uid: occupant?.uid ?? null });
      return;
    }
    if (occupant?.uid === holding.piece.uid) {
      selectionStore.setState({ uid: null });
      return;
    }
    if (holding.piece.kind === 'item' && occupant && occupant.kind !== 'item') {
      await equipItem(intents, holding.piece.uid, occupant);
    } else {
      await intents.dispatch({
        type: 'g.move',
        fields: { uid: holding.piece.uid, to: { area: 'board', row, col } },
      });
    }
    selectionStore.setState({ uid: null });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const [row, col] = focus;
    const moves: Readonly<Record<string, readonly [number, number]>> = {
      ArrowUp: [Math.min(r1, row + 1), col],
      ArrowDown: [Math.max(r0, row - 1), col],
      ArrowLeft: [row, Math.max(c0, col - 1)],
      ArrowRight: [row, Math.min(c1, col + 1)],
    };
    const next = moves[event.key];
    if (!next) {
      return;
    }
    event.preventDefault();
    setFocus(next);
    grid.current
      ?.querySelector<HTMLElement>(`[data-tile="${next[0]}:${next[1]}"]`)
      ?.focus();
  };

  return (
    <table
      ref={grid}
      aria-label={t('core:field.label')}
      className={cx(styles.grid)}
      style={{ gridTemplateColumns: `repeat(${COLS.length}, 1fr)` }}
      onKeyDown={onKeyDown}
    >
      <tbody className={cx(styles.row)}>
        {ROWS.map((row) => (
          <tr key={row} className={cx(styles.row)}>
            {COLS.map((col) => {
              const piece = pieceAt(view, row, col);
              const focused = focus[0] === row && focus[1] === col;
              const label = piece ? pieceLabel(piece) : t('core:field.empty');
              return (
                <td key={col} className={cx(styles.row)}>
                  <button
                    type="button"
                    data-tile={`${row}:${col}`}
                    tabIndex={focused ? 0 : -1}
                    aria-pressed={piece !== null && piece.uid === selected}
                    aria-label={`${t('core:field.tile', { row: r1 - row + 1, col: col - c0 + 1 })} ${label}`}
                    className={
                      piece ? cx(styles.tile, styles.occupied) : styles.tile
                    }
                    onFocus={() => setFocus([row, col])}
                    onClick={() => void activate(row, col)}
                  >
                    {piece ? label : ''}
                  </button>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
