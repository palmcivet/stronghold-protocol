import * as v from 'valibot';

/** Authors only the mods the app ships may use (its examples included); a third-party mod is refused them. */
export const RESERVED_AUTHORS: readonly string[] = [
  'core',
  'wsde',
  'official',
  'examples',
];

const SEGMENT = /^[a-z0-9-]{2,32}$/;
// kebab-case: no leading, trailing or doubled hyphen
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const Segment = v.pipe(v.string(), v.regex(SEGMENT), v.regex(KEBAB));

const wellFormed = (value: string): boolean => {
  const parts = value.split('/');
  return parts.length === 2 && parts.every((part) => v.is(Segment, part));
};
const FORMAT =
  'a mod id is <author>/<mod>, lowercase kebab-case, 2 to 32 characters each';

/** The id of a mod the app ships: the format only, a reserved author allowed. */
export const BundledModIdSchema = v.pipe(
  v.string(),
  v.check(wellFormed, FORMAT),
  v.brand('ModId'),
);

/** A mod id, `<author>/<mod>` such as `example/chat`; authors declare their own, the hash pin keeps versions honest. */
export const ModIdSchema = v.pipe(
  v.string(),
  v.check(wellFormed, FORMAT),
  v.check(
    (value) => !RESERVED_AUTHORS.includes(value.split('/')[0] ?? ''),
    'the author of a mod id is reserved',
  ),
  v.brand('ModId'),
);
export type ModId = v.InferOutput<typeof ModIdSchema>;

export const isModId = (value: unknown): value is ModId =>
  v.is(ModIdSchema, value);

/** Parses a mod id, or throws with the reason; a bundled mod may use a reserved author. */
export function parseModId(
  value: unknown,
  { bundled = false }: { readonly bundled?: boolean } = {},
): ModId {
  return v.parse(bundled ? BundledModIdSchema : ModIdSchema, value);
}

/** The app's own owner; its keys stay `core:*`. */
export const CORE_OWNER = 'core';

/** A storage owner is the core or a valid mod id. */
export function checkOwner(owner: string): string {
  if (owner !== CORE_OWNER && !v.is(BundledModIdSchema, owner)) {
    throw new Error(`"${owner}" is not a storage owner: use core or a mod id`);
  }
  return owner;
}

/** Mods loaded in this page, by id: the one that loads later with the same id is rejected. */
export function createModIds() {
  const loaded = new Map<string, string>();
  return {
    /** Claims an id for a mod (its hash pin, or any label); throws on a bad or taken id. */
    claim(
      id: unknown,
      pin: string,
      options: { readonly bundled?: boolean } = {},
    ): ModId {
      const modId = parseModId(id, options);
      const holder = loaded.get(modId);
      if (holder !== undefined) {
        throw new Error(
          `mod ${modId} is already loaded (${holder}); the later one (${pin}) is rejected`,
        );
      }
      loaded.set(modId, pin);
      return modId;
    },
    release(id: string): void {
      loaded.delete(id);
    },
    has: (id: string): boolean => loaded.has(id),
  };
}
