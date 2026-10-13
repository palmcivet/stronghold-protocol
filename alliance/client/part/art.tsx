import type { CatalogChess } from '@alliance/contract/catalog.js';
import type { ComponentProps } from 'react';
import { type ArtSource, useArt } from '../infra/resource/art.js';
import { useCatalog } from '../infra/store/hook.js';
import { dataName } from '../infra/text/index.js';
import { Avatar, UnitThumb } from '../ui/index.js';

type ThumbProps = Omit<ComponentProps<typeof UnitThumb>, 'name' | 'src'>;

/** The avatar ref of a chess: its operator's, the elite one for an elite chess. */
export function chessArt(chess: CatalogChess | undefined): ArtSource | null {
  if (!chess?.charId) {
    return null;
  }
  return ['chars', chess.charId, chess.golden ? 'avatarElite' : 'avatar'];
}

/** A chess thumbnail with its operator's avatar, and its name as the label. */
export function ChessThumb({
  chessId,
  ...props
}: ThumbProps & { readonly chessId: string }) {
  const chess = useCatalog((state) => state.catalog.chess[chessId]);
  const src = useArt(chessArt(chess));
  return (
    <UnitThumb
      name={dataName('chess', chessId)}
      src={src}
      {...(chess && props.tier === undefined ? { tier: chess.tier } : {})}
      {...props}
    />
  );
}

/** The thumbnail of a shop card or a piece: a chess with its avatar, an item with its icon. */
export function PieceThumb({
  kind,
  id,
  ...props
}: ThumbProps & { readonly kind: 'chess' | 'item'; readonly id: string }) {
  const src = useArt(kind === 'item' ? ['items', id] : null);
  if (kind === 'chess') {
    return <ChessThumb chessId={id} {...props} />;
  }
  return <UnitThumb name={dataName('item', id)} src={src} {...props} />;
}

/** An enemy thumbnail with its icon. */
export function EnemyThumb({
  enemyId,
  name,
  ...props
}: ThumbProps & { readonly enemyId: string | null; readonly name: string }) {
  const src = useArt(enemyId ? ['enemies', enemyId, 'icon'] : null);
  return <UnitThumb name={name} src={src} {...props} />;
}

/** A player's avatar: the chosen operator art (`charId:refField`, see the profile), else the name's first letter. */
export function PlayerAvatar({
  avatar,
  ...props
}: ComponentProps<typeof Avatar> & { readonly avatar?: string | null }) {
  const [charId, field] = (avatar ?? '').split(':');
  const src = useArt(charId && field ? ['chars', charId, field] : null);
  return <Avatar {...props} src={src ?? props.src ?? null} />;
}
