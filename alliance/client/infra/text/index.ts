import { createStore, useStore } from 'zustand';
import {
  type CatalogEntry,
  CORE,
  PHASES,
  SERVER,
} from '#infra/text/catalog/core.js';
import { EN } from '#infra/text/catalog/en.js';
import { formatMessage, type MessageParams } from './format.js';
import type { TextKey, TextParams } from './key.js';

export type { TextKey, TextParams } from './key.js';

export const LANGUAGES = ['zh-Hans', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];
export const BASE_LANGUAGE: Language = 'zh-Hans';

const SOURCES: Readonly<Record<string, CatalogEntry>> = {
  ...CORE,
  ...PHASES,
  ...SERVER,
};

const PACKS: Readonly<Record<Language, Readonly<Record<string, string>>>> = {
  'zh-Hans': {},
  en: EN,
};

interface TextState {
  readonly language: Language;
  /** `data:` text of the season on screen. */
  readonly data: Readonly<Record<string, string>>;
}

export const textStore = createStore<TextState>(() => ({
  language: BASE_LANGUAGE,
  data: {},
}));

export function setLanguage(language: Language): void {
  textStore.setState({ language });
  if (typeof document !== 'undefined') {
    document.documentElement.lang = language;
  }
}

export function setDataText(data: Readonly<Record<string, string>>): void {
  textStore.setState({ data });
}

const warned = new Set<string>();

/** In development, names once each interface key the player's language lacks; the base language is shown instead. */
function warnMissing(language: Language, key: string): void {
  if (!import.meta.env.DEV || warned.has(`${language}:${key}`)) {
    return;
  }
  warned.add(`${language}:${key}`);
  console.warn(`[text] ${language} lacks ${key}; showing ${BASE_LANGUAGE}`);
}

/** Pattern of a key: the player's language, then the base language, then the source. */
function patternOf(state: TextState, key: string): string | null {
  const translated = PACKS[state.language][key];
  if (translated !== undefined) {
    return translated;
  }
  const entry = SOURCES[key];
  if (entry !== undefined && state.language !== BASE_LANGUAGE) {
    warnMissing(state.language, key);
  }
  const source = entry?.source ?? state.data[key];
  return source ?? null;
}

export function has(key: string): boolean {
  return patternOf(textStore.getState(), key) !== null;
}

/** Text of a key. An unknown key is shown as written. */
export function t<K extends TextKey>(
  key: K,
  ...params: TextParams<K> extends Readonly<Record<string, never>>
    ? []
    : [TextParams<K>]
): string {
  const state = textStore.getState();
  const pattern = patternOf(state, key);
  return pattern === null
    ? key
    : formatMessage(pattern, params[0] as MessageParams, state.language);
}

/** Text of a key built at run time, such as a phase or a difficulty. An unknown key is shown as written. */
export function lookup(key: string, params: MessageParams = {}): string {
  const state = textStore.getState();
  const pattern = patternOf(state, key);
  return pattern === null
    ? key
    : formatMessage(pattern, params, state.language);
}

/** Re-renders the caller when the language or the data text changes. */
export function useText(): typeof t {
  useStore(textStore);
  return t;
}

/** Name of a data record, or its id when the data has no name for it. */
export function dataName(table: string, id: string): string {
  const key = `data:${table}.${id}.name` as const;
  return has(key) ? lookup(key) : id;
}

/** Name of a data record, or a placeholder when the data has none: for screens that must never show an id. */
export function shownName(table: string, id: string): string {
  const key = `data:${table}.${id}.name` as const;
  return has(key) ? lookup(key) : t('core:data.unnamed');
}

// MARK: master messages

const BY_SOURCE: ReadonlyMap<string, string> = new Map(
  Object.entries(SOURCES).map(([key, entry]) => [entry.source, key]),
);

/** A server message from a master backend: its Chinese rendering, and its msgid when it has one. */
export interface WireText {
  readonly text?: unknown;
  readonly msgid?: unknown;
  readonly params?: unknown;
}

/** Translates a master message by its msgid. Without a key for it, its `text` is shown. */
export function translateWire(message: WireText): string {
  const text = typeof message.text === 'string' ? message.text : '';
  const msgid = typeof message.msgid === 'string' ? message.msgid : text;
  const key = BY_SOURCE.get(msgid);
  if (key === undefined) {
    return text;
  }
  const state = textStore.getState();
  const pattern = patternOf(state, key) ?? text;
  const params =
    message.params && typeof message.params === 'object'
      ? (message.params as MessageParams)
      : {};
  return formatMessage(pattern, params, state.language);
}

/** Text of a master error code, or the server's own text. */
export function errorText(code: string, text?: string): string {
  const key = `server:error.${code}` as const;
  return has(key) ? lookup(key) : (text ?? code);
}
