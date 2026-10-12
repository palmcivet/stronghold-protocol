import type {
  MissionCueBinding,
  MissionCueKey,
  MissionEventBindings,
  MissionExtensionEventType,
} from '#contract/cue.js';
import type { MissionEffectTable } from '#effect/table.js';
import { isNamespacedId } from '#runtime/registry/index.js';

/** The engine's binding of every core battle event. */
export const MISSION_EVENT_BINDINGS: MissionEventBindings = Object.freeze({
  attack: { effect: null, sound: 'attack' },
  'attack-hit': { effect: null, sound: 'hit' },
  hit: { effect: null, sound: 'hit' },
  'element-hit': { effect: null, sound: 'element' },
  fatal: { effect: null, sound: 'downed' },
  'palsy-interrupt': { effect: null, sound: null },
  damaged: { effect: 'mission:hit-flash', sound: 'damage' },
  loss: { effect: null, sound: null },
  heal: { effect: 'mission:heal-flash', sound: 'heal' },
  downed: { effect: null, sound: 'downed' },
  removed: { effect: null, sound: null },
  deploy: { effect: 'mission:deploy-ring', sound: 'deploy' },
  retreat: { effect: null, sound: null },
  input: { effect: null, sound: null },
  'input-refused': { effect: null, sound: null },
  spawn: { effect: null, sound: null },
  displace: { effect: null, sound: null },
  blocked: { effect: null, sound: null },
  unblocked: { effect: null, sound: null },
  cost: { effect: null, sound: null },
  leak: { effect: null, sound: 'leak' },
  projectile: { effect: null, sound: 'projectile' },
  'skill-start': { effect: null, sound: 'skill' },
  'skill-end': { effect: null, sound: null },
  'ammo-used': { effect: null, sound: null },
  status: { effect: null, sound: 'status' },
  'element-burst': { effect: null, sound: 'element' },
  'terrain-enter': { effect: null, sound: null },
  'terrain-leave': { effect: null, sound: null },
});

/** The binding of a core battle event, or undefined for any other key. */
export function eventBindingOf(key: string): MissionCueBinding | undefined {
  return Object.hasOwn(MISSION_EVENT_BINDINGS, key)
    ? MISSION_EVENT_BINDINGS[key as keyof MissionEventBindings]
    : undefined;
}

/** What each cue key draws and plays, starting from the core bindings. Fixed once sealed. */
export interface MissionCueBindings {
  /** Binds or rebinds a key: a core event, `cue:<kind>`, or `<namespace>:<event>` of an extension event. */
  bind(
    key: MissionCueKey | MissionExtensionEventType,
    binding: MissionCueBinding,
  ): void;
  /** Declares cue kinds content emits; each must have a `cue:<kind>` binding, possibly all null, when sealed. */
  declare(...kinds: readonly string[]): void;
  /** Declared cue kinds, in declaration order. */
  declared(): readonly string[];
  /** The binding of a key; undefined when the key is unbound. */
  get(key: string): MissionCueBinding | undefined;
  keys(): readonly MissionCueKey[];
  seal(): void;
  readonly sealed: boolean;
}

function checkKey(key: string): void {
  if (key === 'cue') {
    throw new RangeError(`Bind a cue event as "cue:<kind>", not "cue"`);
  }
  if (key.includes(':')) {
    if (!isNamespacedId(key)) {
      throw new RangeError(
        `Cue key "${key}" is not "<namespace>:<name>" in kebab-case`,
      );
    }
    return;
  }
  if (!eventBindingOf(key)) {
    throw new RangeError(
      `Cue key "${key}" is not a core battle event; mod events need a "<namespace>:" prefix`,
    );
  }
}

export function createMissionCueBindings(): MissionCueBindings {
  const bindings = new Map<MissionCueKey, MissionCueBinding>(
    Object.entries(MISSION_EVENT_BINDINGS) as [
      MissionCueKey,
      MissionCueBinding,
    ][],
  );
  const declared = new Set<string>();
  let sealed = false;
  const open = (): void => {
    if (sealed) {
      throw new Error(
        'The cue bindings are sealed; bind and declare before creating the stage',
      );
    }
  };
  return {
    bind(key, binding) {
      open();
      checkKey(key);
      bindings.set(
        key,
        Object.freeze({ effect: binding.effect, sound: binding.sound }),
      );
    },
    declare(...kinds) {
      open();
      for (const kind of kinds) {
        if (!isNamespacedId(`cue:${kind}`)) {
          throw new RangeError(`Cue kind "${kind}" is not kebab-case`);
        }
        declared.add(kind);
      }
    },
    declared: () => [...declared],
    get: (key) => bindings.get(key as MissionCueKey),
    keys: () => [...bindings.keys()],
    seal() {
      sealed = true;
    },
    get sealed() {
      return sealed;
    },
  };
}

/**
 * Seals the effect table and the bindings, then checks that every declared cue kind is bound and every bound effect is
 * registered and accepts its key. Throws with every problem found.
 */
export function sealMissionCues(
  table: MissionEffectTable,
  bindings: MissionCueBindings,
): void {
  table.seal();
  bindings.seal();
  const problems: string[] = [];
  for (const kind of bindings.declared()) {
    if (!bindings.get(`cue:${kind}`)) {
      problems.push(
        `cue kind "${kind}" is declared but "cue:${kind}" is not bound`,
      );
    }
  }
  for (const key of bindings.keys()) {
    const id = bindings.get(key)?.effect;
    if (!id) {
      continue;
    }
    const kind = table.get(id);
    if (!kind) {
      problems.push(`"${key}" draws "${id}", which is not registered`);
    } else if (!(kind.accepts as readonly string[]).includes(key)) {
      problems.push(`"${key}" draws "${id}", which does not accept it`);
    }
  }
  if (problems.length > 0) {
    throw new RangeError(
      `Cue bindings do not match the effect table: ${problems.join('; ')}`,
    );
  }
}
