/** What the client may offer on a backend. Entries a backend lacks are hidden. */
export interface Capabilities {
  /** `g.watch` names a field, not a player. */
  readonly watchByField: boolean;
  /** `g.watch.playerId`. */
  readonly watchByPlayer: boolean;
  readonly spectatorSeats: boolean;
  readonly loadout: boolean;
  /** Extension channel `x`. */
  readonly extensions: boolean;
  /** The client runs the battles and reports them with `b.progress` and `b.result`. */
  readonly clientCombat: boolean;
}

export type Backend =
  | { readonly mode: 'compat'; readonly capabilities: Capabilities }
  | {
      readonly mode: 'native';
      readonly capabilities: Capabilities;
      readonly ext: Readonly<Record<string, unknown>>;
    };

/**
 * Capabilities of a master 0.2.4 backend. Both sides send `PROTOCOL_VERSION` 1, so the version tells nothing; the set
 * is fixed by the master release the compat mode targets.
 */
export const MASTER_CAPABILITIES: Capabilities = Object.freeze({
  watchByField: true,
  watchByPlayer: false,
  spectatorSeats: true,
  loadout: true,
  extensions: false,
  clientCombat: true,
});

/** A `welcome` without `ext` comes from a master backend. */
export function backendOf(welcome: {
  readonly t: string;
  readonly ext?: unknown;
}): Backend {
  const ext = welcome.ext;
  if (ext && typeof ext === 'object' && !Array.isArray(ext)) {
    return {
      mode: 'native',
      capabilities: { ...MASTER_CAPABILITIES, extensions: true },
      ext: ext as Readonly<Record<string, unknown>>,
    };
  }
  return { mode: 'compat', capabilities: MASTER_CAPABILITIES };
}
