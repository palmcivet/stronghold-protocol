import { realpathSync, statSync } from 'node:fs';
import { createRequire, findPackageJSON } from 'node:module';
import { dirname, join } from 'node:path';

interface TraceLocation {
  readonly file: string;
  readonly symbol?: string;
}

interface TraceRule {
  readonly id: string;
  readonly package: string;
  readonly rule: string;
  readonly location: readonly TraceLocation[];
  readonly source: string;
  readonly basis: string;
  readonly verified: string;
  readonly next: readonly string[];
  readonly upstreamCases?: readonly string[];
  readonly gap?: string;
}

interface TraceModule {
  readonly TRACE_RULES: readonly TraceRule[];
  formatTraceLocation(location: readonly TraceLocation[]): string;
}

interface Esbuild {
  build(options: {
    readonly entryPoints: readonly string[];
    readonly absWorkingDir: string;
    readonly bundle: true;
    readonly write: false;
    readonly format: 'esm';
    readonly platform: 'node';
    readonly target: string;
    readonly tsconfigRaw: {
      readonly compilerOptions: { readonly target: string };
    };
  }): Promise<{ readonly outputFiles: readonly { readonly text: string }[] }>;
}

function packageJson(name: string): string {
  const found = findPackageJSON(name, import.meta.url);
  if (found === undefined) {
    throw new Error(`${name} is not installed`);
  }
  return found;
}

/** esbuild ships with Vite, which VitePress depends on. */
function esbuild(): Esbuild {
  const fromVitepress = createRequire(realpathSync(packageJson('vitepress')));
  return createRequire(fromVitepress.resolve('vite/package.json'))(
    'esbuild',
  ) as Esbuild;
}

function traceRoot(): string {
  return join(
    realpathSync(dirname(packageJson('@alliance/compat-upstream'))),
    'trace',
  );
}

export function traceSourceFiles(): readonly string[] {
  const root = traceRoot();
  return ['index.ts', 'rules.ts', 'schema.ts'].map((file) => join(root, file));
}

let cache: { readonly mtimeMs: number; readonly mod: TraceModule } | undefined;

async function loadTraceModule(): Promise<TraceModule> {
  const mtimeMs = Math.max(
    ...traceSourceFiles().map((file) => statSync(file).mtimeMs),
  );
  if (cache?.mtimeMs === mtimeMs) {
    return cache.mod;
  }
  const root = traceRoot();
  const result = await esbuild().build({
    entryPoints: [join(root, 'index.ts')],
    absWorkingDir: dirname(root),
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'es2022',
    tsconfigRaw: { compilerOptions: { target: 'ES2022' } },
  });
  const text = result.outputFiles[0]?.text;
  if (text === undefined) {
    throw new Error('failed to bundle @alliance/compat-upstream/trace');
  }
  const mod = (await import(
    `data:text/javascript,${encodeURIComponent(text)}`
  )) as TraceModule;
  cache = { mtimeMs, mod };
  return mod;
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** 把行内代码 `x` 渲染成 <code>，其余转义。 */
function inline(text: string): string {
  return escapeHtml(text).replace(/`([^`]+)`/g, '<code>$1</code>');
}

function renderEntry(
  entry: TraceRule,
  formatTraceLocation: TraceModule['formatTraceLocation'],
): string {
  const cases =
    entry.next.length > 0
      ? `<ul>${entry.next.map((id) => `<li><code>${escapeHtml(id)}</code></li>`).join('')}</ul>`
      : `<p>未锁定：${inline(entry.gap ?? '')}</p>`;
  const upstream =
    entry.upstreamCases !== undefined && entry.upstreamCases.length > 0
      ? `<details><summary>上游用例</summary><ul>${entry.upstreamCases
          .map((id) => `<li><code>${escapeHtml(id)}</code></li>`)
          .join('')}</ul></details>`
      : '';
  return [
    `### ${entry.id}`,
    '',
    `<p>${inline(entry.rule)}</p>`,
    '<dl>',
    '<dt>位置</dt>',
    `<dd>${inline(formatTraceLocation(entry.location))}</dd>`,
    '<dt>来源</dt>',
    `<dd>${inline(entry.source)}</dd>`,
    '<dt>依据</dt>',
    `<dd>${inline(entry.basis)}</dd>`,
    '<dt>核对</dt>',
    `<dd>${inline(entry.verified)}</dd>`,
    '<dt>锁定用例</dt>',
    `<dd>${cases}${upstream}</dd>`,
    '</dl>',
  ].join('\n');
}

const EMPTY: Record<string, string> = {
  'mission-renderer':
    '<p><code>mission-renderer</code> 目前没有记录；需要时在 <code>rules.ts</code> 里补一条 <code>package: &#39;mission-renderer&#39;</code> 的记录。</p>',
};

/** Markdown for one package: a heading per rule, so the page outline lists them. */
export async function renderTraceSection(pkg: string): Promise<string> {
  const { TRACE_RULES, formatTraceLocation } = await loadTraceModule();
  const rows = TRACE_RULES.filter((entry) => entry.package === pkg);
  if (rows.length === 0) {
    return EMPTY[pkg] ?? '';
  }
  return rows
    .map((entry) => renderEntry(entry, formatTraceLocation))
    .join('\n\n');
}
