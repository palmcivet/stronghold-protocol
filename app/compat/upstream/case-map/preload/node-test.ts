// Stand-in for `node:test` while enumerating: `describe` and `suite` run their bodies to find nested cases,
// `test` and `it` record the full name and never run, hooks do nothing.

type Body = (...args: unknown[]) => unknown

interface Recording {
  readonly names: string[]
  readonly suites: string[]
  readonly pending: Promise<unknown>[]
}

const RECORDING = Symbol.for("arknights-compat-upstream.case-map")

function recording(): Recording {
  const scope = globalThis as { [RECORDING]?: Recording }
  scope[RECORDING] ??= { names: [], suites: [], pending: [] }
  return scope[RECORDING]
}

/** `[name][, options][, fn]` → 名字与回调。没有名字时用回调的函数名。 */
function readArguments(args: readonly unknown[]): { name: string; body: Body | null } {
  const body = (args.find((arg) => typeof arg === "function") as Body | undefined) ?? null
  const first = args[0]
  const name = typeof first === "string" ? first : body?.name !== undefined && body.name !== "" ? body.name : "<anonymous>"
  return { name, body }
}

function fullName(name: string): string {
  return [...recording().suites, name].join(" > ")
}

function recordCase(...args: unknown[]): Promise<void> {
  recording().names.push(fullName(readArguments(args).name))
  return Promise.resolve()
}

function runSuite(...args: unknown[]): Promise<void> {
  const { name, body } = readArguments(args)
  const state = recording()
  state.suites.push(name)
  try {
    const result = body?.({ name, fullName: fullName(name), signal: new AbortController().signal, filePath: undefined })
    if (result instanceof Promise) state.pending.push(result)
  } finally {
    state.suites.pop()
  }
  return Promise.resolve()
}

function hook(): void {}

function withModifiers<T extends (...args: unknown[]) => Promise<void>>(run: T): T & { skip: T; only: T; todo: T } {
  return Object.assign(run, { skip: run, only: run, todo: run })
}

export const test = withModifiers(recordCase)
export const it = test
export const describe = withModifiers(runSuite)
export const suite = describe
export const before = hook
export const after = hook
export const beforeEach = hook
export const afterEach = hook
export default test

/** 等异步的 describe 结束后，按出现顺序返回记下的用例全名。 */
export async function recordedNames(): Promise<readonly string[]> {
  const state = recording()
  await Promise.all(state.pending)
  return [...state.names]
}
