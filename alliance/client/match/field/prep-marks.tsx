/**
 * Loose / equipped item marks on the prep 3D stage. MissionAppearance is spine-only, so items without a skeleton are
 * drawn as HTML thumbs projected onto the board (master prepfield icons).
 */
import { GEO } from '@alliance/contract/match.js';
import type {
  PieceView,
  PrivateView,
} from '@alliance/contract/server-message.js';
import {
  calculateBoardTransform,
  frameProjection,
  type MissionCamera,
  type MissionMap,
  projectPoint,
} from 'arknights-mission-renderer';
import { useMemo } from 'react';

/** Stage tile size in canvas px (mission-renderer ground). */
const TILE_SIZE = 64;

import { cx } from '#infra/theme/class-name.js';
import { PieceThumb } from '#part/art.js';
import styles from './preparation.module.css';

interface Mark {
  readonly key: string;
  readonly kind: 'item';
  readonly id: string;
  readonly left: number;
  readonly top: number;
  readonly equipped?: boolean;
}

function marksOf(
  view: PrivateView,
  map: MissionMap,
  camera: MissionCamera,
  width: number,
  height: number,
): readonly Mark[] {
  const transform = calculateBoardTransform(
    map.cols,
    map.rows,
    camera,
    TILE_SIZE,
    width,
    height,
  );
  const projection = frameProjection(map.cols, map.rows, camera, TILE_SIZE);
  if (!transform || !projection) {
    return [];
  }
  const place = (
    x: number,
    y: number,
  ): { left: number; top: number } | null => {
    const point = projectPoint(projection, x, y, 0);
    if (!point) {
      return null;
    }
    return {
      left: transform.x + point.x * transform.scale,
      top: transform.y + point.y * transform.scale,
    };
  };
  const marks: Mark[] = [];
  const pushItem = (
    piece: PieceView,
    x: number,
    y: number,
    equipped = false,
  ): void => {
    if (piece.kind !== 'item' && !equipped) {
      return;
    }
    const screen = place(x, y);
    if (!screen) {
      return;
    }
    marks.push({
      key: equipped ? `eq:${piece.uid}:${x},${y}` : `item:${piece.uid}`,
      kind: 'item',
      id: piece.id,
      left: screen.left,
      top: screen.top,
      ...(equipped ? { equipped: true } : {}),
    });
  };
  for (const piece of view.board) {
    if (piece.row === undefined || piece.col === undefined) {
      continue;
    }
    if (piece.kind === 'item') {
      pushItem(piece, piece.col, piece.row);
    }
    if (
      piece.kind === 'chess' &&
      piece.items?.length &&
      piece.col !== undefined &&
      piece.row !== undefined
    ) {
      const col = piece.col;
      const row = piece.row;
      piece.items.forEach((item, index) => {
        const screen = place(col + 0.28 * index, row - 0.35);
        if (!screen) {
          return;
        }
        marks.push({
          key: `eq:${piece.uid}:${item.uid}`,
          kind: 'item',
          id: item.id,
          left: screen.left,
          top: screen.top,
          equipped: true,
        });
      });
    }
  }
  view.hand.forEach((piece, slot) => {
    if (piece?.kind === 'item') {
      pushItem(piece, slot, GEO.HAND_ROW);
    }
  });
  view.temp.forEach((piece, slot) => {
    if (piece?.kind === 'item') {
      pushItem(piece, GEO.TEMP_C0 + slot, GEO.TEMP_ROW);
    }
  });
  return marks;
}

/** HTML item icons over the prep stage, projected from board tiles. */
export function PrepItemMarks({
  view,
  map,
  camera,
  width,
  height,
}: {
  readonly view: PrivateView | null;
  readonly map: MissionMap | null;
  readonly camera: MissionCamera;
  readonly width: number;
  readonly height: number;
}) {
  const marks = useMemo(() => {
    if (!view || !map || width <= 0 || height <= 0) {
      return [];
    }
    return marksOf(view, map, camera, width, height);
  }, [view, map, camera, width, height]);
  if (marks.length === 0) {
    return null;
  }
  return (
    <ul className={cx(styles.itemMarks)} aria-hidden="true">
      {marks.map((mark) => (
        <li
          key={mark.key}
          className={cx(styles.itemMark)}
          data-equipped={mark.equipped || undefined}
          style={{ left: mark.left, top: mark.top }}
        >
          <PieceThumb kind="item" id={mark.id} size="sm" />
        </li>
      ))}
    </ul>
  );
}
