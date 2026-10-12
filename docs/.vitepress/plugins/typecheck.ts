// Type-checks the TypeScript code blocks of the docs pages, so examples
// cannot rot into dead code. `vitepress build` fails on errors; `vitepress
// dev` only warns. Each docs module is checked in its own tsc program.
//
// Markers: `<!-- check:skip -->` on the line before a fence skips the block;
// `// ---cut---` hides the lines above it and `// ---cut-after---` hides the
// lines below it from the rendered page, while they are still checked.
//
// Conventions and usage for maintainers: docs/README.md.

import { execFile } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MarkdownRenderer, SiteConfig } from 'vitepress';

/** Fence languages that hold checked code; both mean TypeScript. */
const FENCE_LANGS = new Set(['ts', 'typescript']);
const SKIP = /<!--\s*check:skip\s*-->\s*$/;
const IMPORT = /^\s*import\s/m;
const CUT_BEFORE = /^\s*\/\/\s*---cut---\s*$/;
const CUT_AFTER = /^\s*\/\/\s*---cut-after---\s*$/;

const docsRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const repoRoot = resolve(docsRoot, '..');

interface Block {
  /** Page path relative to the repo root. */
  page: string;
  /** Program the block belongs to: the docs module name. */
  group: string;
  /** 1-based page line of the first code line. */
  start: number;
  body: string;
}

/** Blocks of each rendered page, replaced whenever the page renders again. */
const blocksByPage = new Map<string, Block[]>();

// MARK: collection

function isChecked(file: string, modules: readonly string[]): boolean {
  const path = relative(docsRoot, file);
  return modules.some((module) => path.startsWith(`${module}${sep}`));
}

/** Lines VitePress strips as frontmatter before markdown-it sees the page. */
function frontmatterLines(source: string): number {
  const lines = source.split('\n');
  if (lines[0]?.trim() !== '---') {
    return 0;
  }
  const end = lines.findIndex(
    (line, index) => index > 0 && /^---\s*$/.test(line),
  );
  return end < 0 ? 0 : end + 1;
}

/**
 * Visible part of a fence: drops the lines up to `// ---cut---` and from
 * `// ---cut-after---` on. The checked body keeps every line.
 */
function visible(content: string): string {
  const lines = content.replace(/\n$/, '').split('\n');
  const before = lines.findIndex((line) => CUT_BEFORE.test(line));
  const after = lines.findIndex((line) => CUT_AFTER.test(line));
  const end = after < 0 ? lines.length : after;
  const shown = lines.slice(before < 0 ? 0 : before + 1, end);
  while (shown.length > 0 && shown[shown.length - 1]?.trim() === '') {
    shown.pop();
  }
  return `${shown.join('\n')}\n`;
}

function collect(
  md: MarkdownRenderer,
  modules: readonly string[],
  onCollect: () => void,
): void {
  md.core.ruler.push('typecheck', (state) => {
    const file: unknown = state.env?.path;
    if (typeof file !== 'string' || !isChecked(file, modules)) {
      return;
    }
    const offset = frontmatterLines(readFileSync(file, 'utf8'));
    const page = relative(repoRoot, file);
    const module = relative(docsRoot, file).split(sep)[0] ?? '';
    const group = module;
    const blocks: Block[] = [];
    state.tokens.forEach((token, index) => {
      if (token.type !== 'fence' || !token.map) {
        return;
      }
      if (!FENCE_LANGS.has(token.info.trim().split(/\s+/)[0] ?? '')) {
        return;
      }
      const previous = state.tokens[index - 1];
      if (
        previous?.type === 'html_block' &&
        previous.map?.[1] === token.map[0] &&
        SKIP.test(previous.content.trimEnd())
      ) {
        return;
      }
      blocks.push({
        page,
        group,
        start: offset + token.map[0] + 2,
        body: token.content,
      });
      token.content = visible(token.content);
    });
    blocksByPage.set(page, blocks);
    onCollect();
  });
}

// MARK: programs

interface Line {
  code: string;
  at: string | null;
}

/**
 * Groups each page's blocks into programs: a block with an import starts
 * one, the others continue it.
 */
function programs(pages: readonly string[]): Line[][] {
  const result: { imports: Line[]; body: Line[] }[] = [];
  for (const page of [...pages].sort()) {
    let current: { imports: Line[]; body: Line[] } | null = null;
    for (const block of blocksByPage.get(page) ?? []) {
      if (current === null || IMPORT.test(block.body)) {
        current = { imports: [], body: [] };
        result.push(current);
      }
      const program = current;
      // An import may span several lines; it ends at its module specifier.
      let inImport = false;
      block.body
        .replace(/\n$/, '')
        .split('\n')
        .forEach((code, index) => {
          const line = { code, at: `${block.page}:${block.start + index}` };
          if (inImport || /^import\s/.test(code)) {
            inImport = !/["']\s*;?\s*$/.test(code);
            program.imports.push(line);
          } else {
            program.body.push(line);
          }
        });
    }
  }
  return result.map(({ imports, body }) => [
    ...imports,
    ...body,
    { code: 'export {}', at: null },
  ]);
}

// MARK: check

function workspacePackages(): Map<string, string> {
  const manifest = readFileSync(join(repoRoot, 'pnpm-workspace.yaml'), 'utf8');
  const patterns = [...manifest.matchAll(/^\s*-\s*"?([^"\n]+?)"?\s*$/gm)].map(
    (match) => match[1] as string,
  );
  const dirs = patterns.flatMap((pattern) => {
    if (!pattern.endsWith('/*')) {
      return [join(repoRoot, pattern)];
    }
    const parent = join(repoRoot, pattern.slice(0, -2));
    return readdirSync(parent, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(parent, entry.name));
  });
  const packages = new Map<string, string>();
  for (const dir of dirs) {
    const file = join(dir, 'package.json');
    if (!existsSync(file)) {
      continue;
    }
    const name: unknown = JSON.parse(readFileSync(file, 'utf8')).name;
    if (typeof name === 'string') {
      packages.set(name, dir);
    }
  }
  return packages;
}

/**
 * Links the peer dependencies of the workspace packages (and their `@types`),
 * taken from the package that declares them: the host installs peers, so
 * examples may import them, e.g. `three` next to the renderer.
 */
function linkPeers(modules: string): void {
  for (const dir of workspacePackages().values()) {
    const manifest = JSON.parse(
      readFileSync(join(dir, 'package.json'), 'utf8'),
    );
    const peers = Object.keys(manifest.peerDependencies ?? {});
    for (const name of peers.flatMap((peer) => [peer, typesOf(peer)])) {
      const source = join(dir, 'node_modules', name);
      const target = join(modules, name);
      if (existsSync(source) && !existsSync(target)) {
        mkdirSync(dirname(target), { recursive: true });
        symlinkSync(source, target, 'dir');
      }
    }
  }
}

/** `@types` package name of a package: `@types/three`, `@types/scope__name`. */
function typesOf(name: string): string {
  return `@types/${name.replace(/^@/, '').replace('/', '__')}`;
}

function prepare(workDir: string): void {
  const modules = join(workDir, 'node_modules');
  for (const [name, dir] of workspacePackages()) {
    const target = join(modules, name);
    mkdirSync(dirname(target), { recursive: true });
    symlinkSync(dir, target, 'dir');
  }
  mkdirSync(join(modules, '@types'), { recursive: true });
  symlinkSync(
    join(docsRoot, 'node_modules', '@types', 'node'),
    join(modules, '@types', 'node'),
    'dir',
  );
  linkPeers(modules);
  const tsconfig = {
    extends: join(repoRoot, 'tsconfig.base.json'),
    compilerOptions: {
      composite: false,
      declaration: false,
      declarationMap: false,
      sourceMap: false,
      incremental: false,
      noEmit: true,
      lib: ['es2024', 'dom', 'dom.iterable'],
      types: ['node'],
      customConditions: ['source'],
    },
    include: ['src/**/*.ts'],
  };
  writeFileSync(
    join(workDir, 'tsconfig.json'),
    JSON.stringify(tsconfig, null, 2),
  );
  writeFileSync(
    join(workDir, 'package.json'),
    '{"type":"module","private":true}',
  );
  mkdirSync(join(workDir, 'src'));
}

function runTsc(workDir: string): Promise<string> {
  const tsc = join(docsRoot, 'node_modules', '.bin', 'tsc');
  return new Promise((done) => {
    execFile(
      tsc,
      ['--noEmit', '--pretty', 'false', '-p', 'tsconfig.json'],
      { cwd: workDir, maxBuffer: 64 * 1024 * 1024 },
      (error, stdout, stderr) => {
        done(error ? `${stdout}${stderr}`.trim() || String(error) : '');
      },
    );
  });
}

/** Pages of each docs module group, in group order. */
function groups(): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const [page, blocks] of blocksByPage) {
    const group = blocks[0]?.group;
    if (group === undefined) {
      continue;
    }
    result.set(group, [...(result.get(group) ?? []), page]);
  }
  return new Map([...result].sort(([a], [b]) => a.localeCompare(b)));
}

interface GroupResult {
  group: string;
  count: number;
  problems: string[];
}

/** Type-checks one group in its own directory and tsc run. */
async function checkGroup(
  group: string,
  pages: readonly string[],
): Promise<GroupResult> {
  const list = programs(pages);
  if (list.length === 0) {
    return { group, count: 0, problems: [] };
  }
  const workDir = mkdtempSync(join(tmpdir(), 'docs-typecheck-'));
  try {
    prepare(workDir);
    const maps = new Map<string, (string | null)[]>();
    list.forEach((lines, index) => {
      const name = `example-${index}`;
      writeFileSync(
        join(workDir, 'src', `${name}.ts`),
        `${lines.map((line) => line.code).join('\n')}\n`,
      );
      maps.set(
        name,
        lines.map((line) => line.at),
      );
    });
    const output = await runTsc(workDir);
    if (!output) {
      return { group, count: list.length, problems: [] };
    }
    const problems = output
      .replace(
        /^src\/(example-\d+)\.ts\((\d+),(\d+)\)/gm,
        (whole, name: string, line: string, column: string) => {
          const at = maps.get(name)?.[Number(line) - 1];
          return at ? `${at}:${column}` : whole;
        },
      )
      .split('\n')
      .filter((line) => line.trim() !== '');
    return { group, count: list.length, problems };
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

/** Type-checks the collected blocks, one parallel tsc run per group. */
export async function checkExamples(): Promise<{
  problems: string[];
  count: number;
  groups: GroupResult[];
}> {
  const results = await Promise.all(
    [...groups()].map(([group, pages]) => checkGroup(group, pages)),
  );
  return {
    problems: results.flatMap((result) => result.problems),
    count: results.reduce((sum, result) => sum + result.count, 0),
    groups: results,
  };
}

function report(problems: string[]): string {
  const lines = problems.join('\n  ');
  return `docs examples: ${problems.length} type error line(s)\n  ${lines}`;
}

// MARK: wiring

/**
 * Hooks for the VitePress config: `markdown.config` collects blocks and
 * `buildEnd` fails the build on errors. Under `vitepress dev` (no buildEnd)
 * a debounced check after each render only warns.
 */
export interface TypecheckOptions {
  /** Documentation modules whose TypeScript fences should be checked. */
  modules: readonly string[];
}

export function typecheck(options: TypecheckOptions): {
  markdown: (md: MarkdownRenderer) => void;
  buildEnd: (config: SiteConfig) => Promise<void>;
} {
  const dev = process.argv.includes('dev');
  let timer: ReturnType<typeof setTimeout> | undefined;
  const scheduleWarning = () => {
    if (!dev) {
      return;
    }
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const { problems } = await checkExamples();
      if (problems.length > 0) {
        console.warn(report(problems));
      }
    }, 1000);
  };
  return {
    markdown: (md) => collect(md, options.modules, scheduleWarning),
    buildEnd: async () => {
      const { problems, count, groups } = await checkExamples();
      if (problems.length > 0) {
        throw new Error(report(problems));
      }
      const detail = groups
        .map((result) => `${result.group} ${result.count}`)
        .join(', ');
      console.log(`docs examples: ${count} program(s) type-check (${detail})`);
    },
  };
}
