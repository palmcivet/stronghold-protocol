import type { CORE } from './catalog/core.js';

export type CoreKey = keyof typeof CORE;
/** Every key the host knows. `data:` and `server:` keys come from data and are not typed one by one. */
export type TextKey = CoreKey | `data:${string}` | `server:${string}`;

type Placeholders<S extends string> =
  S extends `${string}{${infer Body}}${infer Rest}`
    ?
        | (Body extends `${infer Name},${string}` ? Name : Body)
        | Placeholders<Rest>
    : never;

/** Parameters a key takes, read from its Chinese source. */
export type TextParams<K extends TextKey> = K extends CoreKey
  ? [Placeholders<(typeof CORE)[K]['source']>] extends [never]
    ? Readonly<Record<string, never>>
    : Readonly<
        Record<Placeholders<(typeof CORE)[K]['source']>, string | number>
      >
  : Readonly<Record<string, string | number>>;
