import type { Catalog } from '@alliance/contract/catalog.js';
import type {
  PrivateView,
  PublicView,
} from '@alliance/contract/server-message.js';
import type { AssetKey, AssetResolver } from 'arknights-assets-catalog';

/** Preload groups by the screens that need them. */
export const PRELOAD_GROUPS = ['room', 'match', 'results'] as const;

export type PreloadGroup = (typeof PRELOAD_GROUPS)[number];

/** What decides the keys of a group. */
export interface PreloadInput {
  readonly resolver: AssetResolver;
  readonly catalog: Catalog;
  readonly public: PublicView | null;
  readonly private: PrivateView | null;
}

/** Entries the manifest puts in the group: the fixed art of its screens. */
function manifestKeys(
  resolver: AssetResolver,
  group: PreloadGroup,
): AssetKey[] {
  return resolver
    .keys()
    .filter((key) => resolver.entry(key)?.asset.preloadGroup === group);
}

function charKeys(
  resolver: AssetResolver,
  charIds: Iterable<string>,
  fields: readonly string[],
): AssetKey[] {
  const keys: AssetKey[] = [];
  for (const charId of charIds) {
    for (const field of fields) {
      const key = resolver.ref(['chars', charId, field]);
      if (key) {
        keys.push(key);
      }
    }
  }
  return keys;
}

function enemyKeys(
  resolver: AssetResolver,
  enemyIds: Iterable<string>,
): AssetKey[] {
  const keys: AssetKey[] = [];
  for (const enemyId of enemyIds) {
    const key = resolver.ref(['enemies', enemyId, 'icon']);
    if (key) {
      keys.push(key);
    }
  }
  return keys;
}

/** Operators the shop of this match offers: the visible base chess the match did not ban. */
function matchCharIds(input: PreloadInput): Set<string> {
  const banned = new Set(input.public?.bannedChess ?? []);
  const charIds = new Set<string>();
  for (const chess of Object.values(input.catalog.chess)) {
    if (
      chess.visible &&
      !chess.golden &&
      chess.charId &&
      !banned.has(chess.id)
    ) {
      charIds.add(chess.charId);
    }
  }
  return charIds;
}

/** Enemies the season's waves send, with the bosses of this match. */
function matchEnemyIds(input: PreloadInput): Set<string> {
  const enemyIds = new Set<string>();
  for (const wave of Object.values(input.catalog.waves)) {
    for (const enemyId of wave.enemyIds) {
      enemyIds.add(enemyId);
    }
  }
  for (const bossId of [input.public?.bossId, input.public?.hiddenBossId]) {
    if (bossId) {
      enemyIds.add(bossId);
    }
  }
  return enemyIds;
}

/** Operators on the receiver's board, hand and bench. */
function ownCharIds(input: PreloadInput): Set<string> {
  const charIds = new Set<string>();
  const view = input.private;
  if (!view) {
    return charIds;
  }
  for (const piece of [...view.board, ...view.hand, ...view.temp]) {
    const chess = piece ? input.catalog.chess[piece.id] : undefined;
    if (chess?.charId) {
      charIds.add(chess.charId);
    }
  }
  return charIds;
}

/**
 * Keys of a preload group. `room`: the room art and the operator avatars. `match`: the map, the operators and the
 * enemies of this match. `results`: the result art and the receiver's operators.
 */
export function preloadKeys(
  group: PreloadGroup,
  input: PreloadInput,
): readonly AssetKey[] {
  const { resolver } = input;
  const keys = manifestKeys(resolver, group);
  switch (group) {
    case 'room': {
      const charIds = new Set<string>();
      for (const chess of Object.values(input.catalog.chess)) {
        if (chess.visible && !chess.golden && chess.charId) {
          charIds.add(chess.charId);
        }
      }
      keys.push(...charKeys(resolver, charIds, ['avatar']));
      break;
    }
    case 'match': {
      const board = resolver.ref(['board', 'theme']);
      if (board) {
        keys.push(board);
      }
      keys.push(
        ...charKeys(resolver, matchCharIds(input), [
          'avatar',
          'avatarElite',
          'portrait',
        ]),
        ...enemyKeys(resolver, matchEnemyIds(input)),
      );
      break;
    }
    case 'results':
      keys.push(...charKeys(resolver, ownCharIds(input), ['portrait']));
      break;
  }
  return [...new Set(keys)];
}
