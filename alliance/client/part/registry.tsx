import {
  type ComponentType,
  type ReactNode,
  useSyncExternalStore,
} from 'react';
import { PageBoundary, PartSlot } from './boundary.js';

/** Props every part receives on top of its own. */
// biome-ignore lint/suspicious/noExplicitAny: a part's own props are its contract with the container
export type PartComponent = ComponentType<any>;

/** A wrapper receives the part it wraps as `Inner`, plus the part's props. */
export type PartWrapper = ComponentType<{
  readonly Inner: PartComponent;
  readonly [prop: string]: unknown;
}>;

export interface PartOptions {
  /** Opens `replace` and `wrap` on the id (ARCH.md `defineExtensible`). */
  readonly extensible?: boolean;
  /** Text key of the part's title, read by containers that label their children, such as tabs. */
  readonly title?: string;
}

interface Definition {
  readonly component: PartComponent;
  readonly options: PartOptions;
  replacement: PartComponent | null;
  readonly wrappers: PartWrapper[];
}

const definitions = new Map<string, Definition>();
const listeners = new Set<() => void>();
let version = 0;

function notify(): void {
  version += 1;
  for (const listener of listeners) {
    listener();
  }
}

/** Registers a part under its id. A second definition of the same id is refused. */
export function definePart(
  id: string,
  component: PartComponent,
  options: PartOptions = {},
): () => void {
  if (definitions.has(id)) {
    throw new Error(`part ${id} is already defined`);
  }
  const definition: Definition = {
    component,
    options,
    replacement: null,
    wrappers: [],
  };
  definitions.set(id, definition);
  notify();
  return () => {
    if (definitions.get(id) === definition) {
      definitions.delete(id);
      notify();
    }
  };
}

function extensible(id: string): Definition {
  const definition = definitions.get(id);
  if (!definition) {
    throw new Error(`part ${id} is not defined`);
  }
  if (!definition.options.extensible) {
    throw new Error(`part ${id} is not extensible`);
  }
  return definition;
}

/** Replaces an extensible part. A second replacement of the same id is a conflict. */
export function replacePart(id: string, component: PartComponent): () => void {
  const definition = extensible(id);
  if (definition.replacement) {
    throw new Error(`part ${id} is already replaced`);
  }
  definition.replacement = component;
  notify();
  return () => {
    if (definition.replacement === component) {
      definition.replacement = null;
      notify();
    }
  };
}

/** Wraps an extensible part; wrappers chain in registration order, the first outermost. */
export function wrapPart(id: string, wrapper: PartWrapper): () => void {
  const definition = extensible(id);
  definition.wrappers.push(wrapper);
  notify();
  return () => {
    const index = definition.wrappers.indexOf(wrapper);
    if (index >= 0) {
      definition.wrappers.splice(index, 1);
      notify();
    }
  };
}

export function hasPart(id: string): boolean {
  return definitions.has(id);
}

/** Ids of the defined parts, sorted. */
export function listParts(): readonly string[] {
  return [...definitions.keys()].sort();
}

/** The title text key a part was defined with. */
export function partTitle(id: string): string | undefined {
  return definitions.get(id)?.options.title;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getVersion = (): number => version;

/** The component a part id renders: the replacement or the definition, inside its wrappers. */
function resolve(definition: Definition): PartComponent {
  const base = definition.replacement ?? definition.component;
  return definition.wrappers.reduceRight<PartComponent>(
    (Inner, Wrapper) =>
      function Wrapped(props: Record<string, unknown>) {
        return <Wrapper {...props} Inner={Inner} />;
      },
    base,
  );
}

export interface PartProps {
  readonly id: string;
  /** `page` holds a failure with the page error, `none` leaves it to the caller; default `part`. */
  readonly boundary?: 'part' | 'page' | 'none';
  readonly [prop: string]: unknown;
}

/** Renders a part by id inside its boundary. An undefined id renders nothing. */
export function Part({ id, boundary = 'part', ...props }: PartProps) {
  useSyncExternalStore(subscribe, getVersion, getVersion);
  const definition = definitions.get(id);
  if (!definition) {
    return null;
  }
  const Component = resolve(definition);
  const body: ReactNode = <Component {...props} />;
  if (boundary === 'none') {
    return body;
  }
  if (boundary === 'page') {
    return <PageBoundary part={id}>{body}</PageBoundary>;
  }
  return <PartSlot part={id}>{body}</PartSlot>;
}
