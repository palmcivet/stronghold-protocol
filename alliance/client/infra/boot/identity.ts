import * as v from 'valibot';
import {
  CORE_OWNER,
  defineItem,
  type StorageBackend,
} from '#infra/storage/index.js';

/**
 * Which reconnect token a tab uses, as master's `createIdentity` (public/js/net.js): decided once per page load by
 * `init()`:
 *   1. this tab's own token (the tab secret slot: survives reloads of this tab, never copied into a new one),
 *   2. else, with a channel, the most recent token of the device (the device secret slot, at most four) so closing
 *      the tab and reopening within the server's reconnect window resumes the seat,
 * skipping every token another live tab holds. Tabs ask each other over a BroadcastChannel and only ever send token
 * hashes ("who holds these?" → "mine"). An earlier welcome outranks a later claimant, then a live holder its
 * duplicate, then the tab id. A shared candidate goes with `noReplace`, so it never takes a connected session; an
 * own token goes with `claimAt`, its first welcome. Without a channel a tab only uses its own token.
 */

const TOKEN_MAX = 64;
export const RECENT_MAX = 4;
/** How long `init()` waits for other tabs to claim a candidate (ms), as master's. */
export const CLAIM_QUERY_MS = 150;
export const IDENTITY_CHANNEL = 'wsde:identity';

const Token = v.pipe(v.string(), v.minLength(1), v.maxLength(TOKEN_MAX));
const isToken = (value: unknown): value is string => v.is(Token, value);

/** The identity's items; a test passes adapters of its own to play several tabs. */
export function identityItems(
  slots: {
    readonly tab?: () => StorageBackend;
    readonly device?: () => StorageBackend;
  } = {},
) {
  /** This tab's token. */
  const tokenItem = defineItem<string | null>({
    scope: 'server',
    owner: CORE_OWNER,
    key: 'token',
    schema: v.nullable(Token),
    version: 1,
    fallback: () => null,
    tier: 'secureTab',
    ...(slots.tab ? { backend: slots.tab } : {}),
  });

  /** The first welcome of this tab's token: `{ hash, at }` (master's `sp.tokenWelcome`). */
  const welcomeItem = defineItem<{ hash: string; at: number } | null>({
    scope: 'server',
    owner: CORE_OWNER,
    key: 'tokenWelcome',
    schema: v.nullable(
      v.object({ hash: v.string(), at: v.pipe(v.number(), v.minValue(0)) }),
    ),
    version: 1,
    fallback: () => null,
    tier: 'secureTab',
    ...(slots.tab ? { backend: slots.tab } : {}),
  });

  /** The device's recent tokens, the latest first (master's `sp.tokens`). */
  const recentTokensItem = defineItem<readonly string[]>({
    scope: 'server',
    owner: CORE_OWNER,
    key: 'tokens',
    schema: v.pipe(
      v.array(v.string()),
      v.transform((list) => list.filter(isToken).slice(0, RECENT_MAX)),
    ),
    version: 1,
    fallback: () => [],
    tier: 'secureDevice',
    ...(slots.device ? { backend: slots.device } : {}),
  });

  /** The match each recent token was seated in, by token hash, for an explicit recovery (master's `sp.matches`). */
  const matchesItem = defineItem<
    Readonly<Record<string, { name: string; code: string }>>
  >({
    scope: 'server',
    owner: CORE_OWNER,
    key: 'matches',
    schema: v.record(
      v.string(),
      v.object({
        name: v.pipe(v.string(), v.maxLength(64)),
        code: v.pipe(v.string(), v.maxLength(32)),
      }),
    ),
    version: 1,
    fallback: () => ({}),
    ...(slots.device ? { backend: slots.device } : {}),
  });
  return { tokenItem, welcomeItem, recentTokensItem, matchesItem };
}
export type IdentityItems = ReturnType<typeof identityItems>;

const defaults = identityItems();
/** This tab's token (tab secret slot), and the first welcome of it. */
export const { tokenItem, welcomeItem } = defaults;
/** The device's recent tokens, the latest first (master's `sp.tokens`, device secret slot), and the match each one was seated in, by token hash (master's `sp.matches`). */
export const { recentTokensItem, matchesItem } = defaults;

/** Master's `tokenHash`: FNV-1a in hex, so tabs never broadcast a token. */
export function tokenHash(token: string): string {
  let hash = 2166136261;
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export interface Claim {
  readonly owned: boolean;
  readonly at: number | null;
  readonly live: boolean;
}

type Message =
  | {
      readonly type: 'who';
      readonly from: string;
      readonly hashes: readonly string[];
      readonly claims?: Readonly<Record<string, Claim | null>>;
    }
  | {
      readonly type: 'mine';
      readonly from: string;
      readonly to: string;
      readonly hash: string;
      readonly claim: Claim | null;
    };

type Unsent = Message extends infer M
  ? M extends Message
    ? Omit<M, 'from'>
    : never
  : never;

/** The part of a BroadcastChannel the identity uses. */
export interface IdentityChannel {
  postMessage(message: unknown): void;
  addEventListener(
    type: 'message',
    listener: (event: { readonly data: unknown }) => void,
  ): void;
}

export interface Recoverable {
  readonly id: string;
  readonly name: string;
  readonly code: string;
}

export interface Identity {
  readonly tabId: string;
  init(): Promise<string | null>;
  getToken(): string | null;
  /** The `hello` fields of the claim: `noReplace` for a shared candidate, `claimAt` for the own token. */
  getTokenClaim(): { noReplace: boolean; claimAt?: number };
  /** After SESSION_IN_USE: this page gives up the claim. */
  rejectToken(): void;
  saveToken(token: string): void;
  clearToken(): void;
  rememberMatch(info: { name: string; code: string } | null): void;
  /** Seats of closed tabs this device may take back. */
  recoverable(): readonly Recoverable[];
  /** Takes a closed tab's seat after asking the live tabs once more; false when one holds it. */
  resume(id: string): Promise<boolean>;
}

function defaultChannel(): IdentityChannel | null {
  try {
    return typeof BroadcastChannel === 'function'
      ? new BroadcastChannel(IDENTITY_CHANNEL)
      : null;
  } catch {
    return null;
  }
}

export function createIdentity(
  deps: {
    readonly channel?: IdentityChannel | null;
    readonly tabId?: string;
    readonly queryMs?: number;
    readonly now?: () => number;
    readonly wait?: (ms: number) => Promise<void>;
    /** Called when this tab gave its token to another after `init()`: reconnect with the new choice. */
    readonly onYield?: () => void;
    readonly items?: IdentityItems;
  } = {},
): Identity {
  const { tokenItem, welcomeItem, recentTokensItem, matchesItem } =
    deps.items ?? defaults;
  const tabId =
    deps.tabId ?? Math.random().toString(36).slice(2) + Date.now().toString(36);
  const now = deps.now ?? (() => Date.now());
  const queryMs = deps.queryMs ?? CLAIM_QUERY_MS;
  const wait =
    deps.wait ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  let channel: IdentityChannel | null = null;
  let initPromise: Promise<string | null> | null = null;
  let initialized = false;
  let resumeBusy = false;
  let current: string | null = null;
  let resolving: { hashes: Set<string>; taken: Set<string> } | null = null;
  let owned = isToken(tokenItem.get()) ? tokenItem.get() : null;
  const saved = welcomeItem.get();
  let welcomeAt =
    owned && saved?.hash === tokenHash(owned)
      ? saved.at
      : (null as number | null);
  let welcomed = false;

  const readRecent = (): readonly string[] => recentTokensItem.get();
  const writeRecent = (list: readonly string[]): void => {
    void recentTokensItem.set([...new Set(list)].slice(0, RECENT_MAX));
  };
  const rememberMatch = (info: { name: string; code: string } | null): void => {
    if (!current) {
      return;
    }
    const old = matchesItem.get();
    const next: Record<string, { name: string; code: string }> = {};
    for (const token of readRecent()) {
      const hash = tokenHash(token);
      const entry = token === current ? info : old[hash];
      if (entry) {
        next[hash] = {
          name: entry.name.slice(0, 64),
          code: entry.code.slice(0, 32),
        };
      }
    }
    void matchesItem.set(next);
  };
  const post = (message: Unsent): void => {
    try {
      channel?.postMessage({ ...message, from: tabId });
    } catch {
      // the channel is closed
    }
  };
  const setOwned = (token: string | null): void => {
    void tokenItem.set(token);
  };
  const claimFor = (hash: string): Claim | null => {
    if (owned && tokenHash(owned) === hash) {
      return { owned: true, at: welcomeAt, live: welcomed };
    }
    if (
      (current && tokenHash(current) === hash) ||
      resolving?.hashes.has(hash)
    ) {
      return { owned: false, at: null, live: false };
    }
    return null;
  };
  const peerWins = (
    peer: Claim | null,
    from: string,
    ours: Claim | null,
  ): boolean => {
    // an older client answering "mine" is treated as live
    if (!peer || !ours) {
      return true;
    }
    const a =
      peer.at !== null && peer.at >= 0 ? peer.at : Number.POSITIVE_INFINITY;
    const b =
      ours.at !== null && ours.at >= 0 ? ours.at : Number.POSITIVE_INFINITY;
    if (a !== b) {
      return a < b;
    }
    if (peer.owned !== ours.owned) {
      return peer.owned;
    }
    if (peer.live !== ours.live) {
      return peer.live;
    }
    return from < tabId;
  };
  const yieldCandidate = (hash: string): void => {
    resolving?.taken.add(hash);
    if (current && tokenHash(current) === hash) {
      if (current === owned) {
        owned = null;
        welcomeAt = null;
        welcomed = false;
        void welcomeItem.set(null);
      }
      current = owned;
      setOwned(owned);
      if (initialized) {
        deps.onYield?.();
      }
    }
  };
  const onMessage = (event: { readonly data: unknown }): void => {
    const message = event.data as Message | null;
    if (
      !message ||
      typeof message !== 'object' ||
      typeof message.from !== 'string' ||
      message.from === tabId
    ) {
      return;
    }
    if (message.type === 'who' && Array.isArray(message.hashes)) {
      for (const hash of message.hashes) {
        if (typeof hash !== 'string') {
          continue;
        }
        const ours = claimFor(hash);
        if (!ours) {
          continue;
        }
        const peer = message.claims?.[hash] ?? {
          owned: false,
          at: null,
          live: false,
        };
        if (peerWins(peer, message.from, ours)) {
          yieldCandidate(hash);
        } else {
          post({ type: 'mine', hash, claim: ours, to: message.from });
        }
      }
    } else if (
      message.type === 'mine' &&
      message.to === tabId &&
      typeof message.hash === 'string'
    ) {
      if (peerWins(message.claim, message.from, claimFor(message.hash))) {
        yieldCandidate(message.hash);
      }
    }
  };
  const query = async (
    candidates: readonly string[],
  ): Promise<string | null> => {
    resolving = {
      hashes: new Set(candidates.map(tokenHash)),
      taken: new Set(),
    };
    const hashes = [...resolving.hashes];
    post({
      type: 'who',
      hashes,
      claims: Object.fromEntries(hashes.map((hash) => [hash, claimFor(hash)])),
    });
    await wait(queryMs);
    const { taken } = resolving;
    resolving = null;
    return candidates.find((token) => !taken.has(tokenHash(token))) ?? null;
  };
  const resolveToken = async (): Promise<string | null> => {
    channel = deps.channel !== undefined ? deps.channel : defaultChannel();
    channel?.addEventListener('message', onMessage);
    // the list may have changed in another tab since the preload
    await recentTokensItem.load();
    await matchesItem.load();
    const candidates = owned
      ? [owned]
      : channel
        ? [...new Set(readRecent())]
        : [];
    if (!channel || candidates.length === 0) {
      return owned;
    }
    return query(candidates);
  };

  return {
    tabId,
    init() {
      initPromise ??= resolveToken()
        .catch(() => null)
        .then((pick) => {
          // a welcome that came while waiting wins
          if (!welcomed) {
            current = pick;
            if (pick) {
              setOwned(pick);
            } else {
              owned = null;
              welcomeAt = null;
              setOwned(null);
              void welcomeItem.set(null);
            }
          }
          initialized = true;
          return current;
        });
      return initPromise;
    },
    getToken() {
      if (current) {
        return current;
      }
      if (initialized) {
        return null;
      }
      return owned;
    },
    getTokenClaim() {
      return current !== null && current === owned
        ? {
            noReplace: false,
            ...(welcomeAt !== null ? { claimAt: welcomeAt } : {}),
          }
        : { noReplace: true };
    },
    rejectToken() {
      if (current) {
        yieldCandidate(tokenHash(current));
      }
    },
    saveToken(token) {
      if (!isToken(token)) {
        return;
      }
      if (current !== token) {
        rememberMatch(null);
      }
      if (owned !== token || welcomeAt === null) {
        welcomeAt = now();
      }
      owned = token;
      welcomed = true;
      current = token;
      setOwned(token);
      void welcomeItem.set({ hash: tokenHash(token), at: welcomeAt });
      writeRecent([token, ...readRecent().filter((item) => item !== token)]);
    },
    clearToken() {
      rememberMatch(null);
      const token = current ?? owned;
      current = null;
      owned = null;
      welcomeAt = null;
      welcomed = false;
      setOwned(null);
      void welcomeItem.set(null);
      if (token) {
        writeRecent(readRecent().filter((item) => item !== token));
      }
    },
    rememberMatch,
    recoverable() {
      const matches = matchesItem.get();
      return readRecent()
        .filter((token) => token !== current)
        .flatMap((token) => {
          const hash = tokenHash(token);
          const entry = matches[hash];
          return entry
            ? [{ id: hash, name: entry.name, code: entry.code }]
            : [];
        });
    },
    async resume(id) {
      await this.init();
      if (!channel || resumeBusy) {
        return false;
      }
      await recentTokensItem.load();
      await matchesItem.load();
      const token = readRecent().find(
        (item) => item !== current && tokenHash(item) === id,
      );
      if (!token || !this.recoverable().some((item) => item.id === id)) {
        return false;
      }
      resumeBusy = true;
      try {
        const pick = await query([token]);
        if (!pick) {
          return false;
        }
        current = pick;
        return true;
      } finally {
        resumeBusy = false;
      }
    },
  };
}
