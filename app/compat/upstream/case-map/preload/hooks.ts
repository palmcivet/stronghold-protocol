const STAND_IN = new URL("./node-test.js", import.meta.url).href

interface ResolveResult {
  readonly url: string
  readonly shortCircuit?: boolean
}

/** 模块解析钩子：把 `node:test` 换成只记名字的替身。 */
export async function resolve(
  specifier: string,
  context: unknown,
  next: (specifier: string, context: unknown) => Promise<ResolveResult>,
): Promise<ResolveResult> {
  if (specifier === "node:test") return { url: STAND_IN, shortCircuit: true }
  return next(specifier, context)
}
