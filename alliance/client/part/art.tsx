import type { CatalogChess } from '@alliance/contract/catalog.js';
import {
  AvatarFrame,
  type AvatarFrameProps,
  Thumb,
  type ThumbProps as UiThumbProps,
} from '@alliance/ui';
import { type ArtSource, useArt } from '#infra/resource/art.js';
import { useCatalog } from '#infra/store/hook.js';
import { dataName } from '#infra/text/index.js';
import { tierColor } from '#part/badge.js';

/** What a unit, item or icon thumbnail takes: the tier colors the frame, an elite one has a halo. */
type ThumbProps = Omit<UiThumbProps, 'name' | 'src' | 'color' | 'glow'> & {
  readonly tier?: number;
  readonly elite?: boolean;
};

/** A thumbnail in the frame of its tier. */
function Tile({
  tier,
  elite = false,
  ...props
}: ThumbProps & Pick<UiThumbProps, 'name' | 'src'>) {
  return (
    <Thumb
      {...props}
      {...(tier === undefined ? {} : { color: tierColor(tier) })}
      glow={elite}
    />
  );
}

/** Hues of the four seats, in degrees. */
const SEAT_HUES = [162, 196, 38, 280] as const;

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
    <Tile
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
  return <Tile name={dataName('item', id)} src={src} {...props} />;
}

/** An enemy thumbnail with its icon. */
export function EnemyThumb({
  enemyId,
  name,
  ...props
}: ThumbProps & { readonly enemyId: string | null; readonly name: string }) {
  const src = useArt(enemyId ? ['enemies', enemyId, 'icon'] : null);
  return <Tile name={name} src={src} {...props} />;
}

/** A player's avatar: the chosen operator art (`charId:refField`, see the profile), else the name's first letter; marks for the host, yourself and a computer teammate. */
export function PlayerAvatar({
  avatar,
  seat = 0,
  host = false,
  self = false,
  bot = false,
  offline = false,
  ...props
}: Omit<
  AvatarFrameProps,
  'hue' | 'icon' | 'startMark' | 'endMark' | 'tag' | 'dimmed'
> & {
  readonly avatar?: string | null;
  /** Seat number from 0; tints the plate behind a missing picture. */
  readonly seat?: number;
  /** The room's creator: a crown. */
  readonly host?: boolean;
  /** The viewer's own: marked and framed in the accent tone. */
  readonly self?: boolean;
  /** A computer teammate: a robot and an `AI` tag. */
  readonly bot?: boolean;
  /** Gone from the room: grey. */
  readonly offline?: boolean;
}) {
  const src = useArt(avatar || null);
  return (
    <AvatarFrame
      {...props}
      src={src ?? props.src ?? null}
      hue={SEAT_HUES[((Math.trunc(seat) % 4) + 4) % 4] ?? SEAT_HUES[0]}
      active={props.active === true || self}
      dimmed={offline}
      {...(host ? { startMark: { icon: 'crown', tone: 'gold' } as const } : {})}
      {...(self ? { endMark: { icon: 'user', tone: 'accent' } as const } : {})}
      {...(bot ? { icon: 'bot' as const, tag: 'AI' } : {})}
    />
  );
}

/** A strategy's icon, its name as the label. */
export function BandIcon({
  bandId,
  ...props
}: ThumbProps & { readonly bandId: string }) {
  const src = useArt(['bands', bandId]);
  return <Tile name={dataName('band', bandId)} src={src} {...props} />;
}

/** A bond's icon, its name as the label. */
export function BondIcon({
  bondId,
  ...props
}: ThumbProps & { readonly bondId: string }) {
  const src = useArt(['bonds', bondId]);
  return <Tile name={dataName('bond', bondId)} src={src} {...props} />;
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
  return <Tile name={dataName('faction', factionId)} src={src} {...props} />;
}
