import type { CatalogChess } from '@alliance/contract/catalog.js';
import type { ComponentProps } from 'react';
import { type ArtSource, useArt } from '#infra/resource/art.js';
import { useCatalog } from '#infra/store/hook.js';
import { dataName } from '#infra/text/index.js';
import { Avatar, UnitThumb } from '#ui/index.js';

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
  charId,
  label,
  ...props
}: ThumbProps & {
  readonly chessId: string;
  /** Draws and names this operator instead (a custom-squad slot). */
  readonly charId?: string;
  /** Replaces the name as the label. */
  readonly label?: string;
}) {
  const chess = useCatalog((state) => state.catalog.chess[chessId]);
  const src = useArt(
    charId
      ? ['chars', charId, chess?.golden ? 'avatarElite' : 'avatar']
      : chessArt(chess),
  );
  return (
    <UnitThumb
      name={
        label ??
        (charId ? dataName('operator', charId) : dataName('chess', chessId))
      }
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
  const src = useArt(avatar || null);
  return <Avatar {...props} src={src ?? props.src ?? null} />;
}

/** A strategy's icon, its name as the label. */
export function BandIcon({
  bandId,
  ...props
}: ThumbProps & { readonly bandId: string }) {
  const src = useArt(['bands', bandId]);
  return <UnitThumb name={dataName('band', bandId)} src={src} {...props} />;
}

/** A bond's icon, its name as the label. */
export function BondIcon({
  bondId,
  ...props
}: ThumbProps & { readonly bondId: string }) {
  const src = useArt(['bonds', bondId]);
  return <UnitThumb name={dataName('bond', bondId)} src={src} {...props} />;
}

/** A special-enemy type's badge. */
export function FactionIcon({
  factionId,
  ...props
}: ThumbProps & { readonly factionId: string }) {
  const icon = useCatalog(
    (state) => state.catalog.factions?.[factionId]?.icon ?? null,
  );
  const src = useArt(icon);
  return (
    <UnitThumb name={dataName('faction', factionId)} src={src} {...props} />
  );
}
