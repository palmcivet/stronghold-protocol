#!/usr/bin/env node
// pnpm extract --needs <file>... --cache <dir>：读需求清单，经来源表提取资源，写出缓存文件、原始目录、账本与报告。
// 退出码：0 成功；1 有必需键缺失；2 参数或环境错误。

import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { DEFAULT_CACHE_DIR } from '#catalog/cache-layout.js';
import { extractAssets } from '#catalog/extract.js';
import { readNeeds } from '#catalog/needs.js';
import {
  assertGitVersion,
  GitRepoCache,
  type RepoCache,
} from '#download/repo-cache.js';
import { BuildReadError } from '#port/build-error.js';
import type { BuildFiles } from '#port/build-files.js';
import type { GitProcess } from '#port/git-process.js';
import { nodeBuildFiles } from '#port/node-files.js';
import { nodeGitProcess } from '#port/node-git.js';
import type { AssetSource } from '#source/asset-source.js';
import { createSources } from '#source/table.js';
import { extractorWorkspace } from '#workspace.js';

export const EXTRACT_HELP = `Usage: pnpm extract --needs <file>... [options]
  --needs <file>...   one or more needs lists (schemaVersion 1)
  --cache <dir>       cache directory (default ${DEFAULT_CACHE_DIR})
  --offline           no network: use existing clones and checked out files only
  --force             copy and convert again even when the ledger says nothing changed
  --refresh-index     update every used clone to the latest commit of its branch
  --proxy <url>       proxy for git (HTTPS_PROXY, HTTP_PROXY, ALL_PROXY)
  --timeout <ms>      limit for one git process (default 600000)
  --help              this text`;

export interface ExtractFlags {
  readonly needs: readonly string[];
  readonly cacheDir: string;
  readonly offline: boolean;
  readonly force: boolean;
  readonly refreshIndex: boolean;
  readonly proxy: string | null;
  readonly timeoutMs: number;
  readonly help: boolean;
}

export class UsageError extends Error {
  constructor(message: string) {
    super(`${message}\n${EXTRACT_HELP}`);
    this.name = 'UsageError';
  }
}

function repeatNeeds(argv: readonly string[]): string[] {
  const out: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? '';
    if (arg !== '--needs') {
      out.push(arg);
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      out.push(arg);
      continue;
    }
    out.push('--needs', value);
    index += 1;
    while (
      index + 1 < argv.length &&
      !(argv[index + 1] ?? '').startsWith('--')
    ) {
      index += 1;
      out.push('--needs', argv[index] ?? '');
    }
  }
  return out;
}

function usageFromParse(cause: unknown): UsageError {
  const message = cause instanceof Error ? cause.message : String(cause);
  const option = /--[\w-]+/.exec(message)?.[0];
  if (option === '--needs') {
    return new UsageError('--needs needs at least one file');
  }
  if (option === '--cache' || option === '--proxy' || option === '--timeout') {
    return new UsageError(`${option} needs a value`);
  }
  if (/unknown option/i.test(message)) {
    return new UsageError(`unknown option ${option ?? message}`);
  }
  return new UsageError(message);
}

export function parseExtractArgs(argv: readonly string[]): ExtractFlags {
  const { values } = (() => {
    try {
      return parseArgs({
        args: repeatNeeds(argv),
        strict: true,
        options: {
          help: { type: 'boolean' as const, short: 'h' as const },
          offline: { type: 'boolean' as const },
          force: { type: 'boolean' as const },
          'refresh-index': { type: 'boolean' as const },
          needs: { type: 'string' as const, multiple: true as const },
          cache: { type: 'string' as const },
          proxy: { type: 'string' as const },
          timeout: { type: 'string' as const },
        },
      });
    } catch (cause) {
      throw usageFromParse(cause);
    }
  })();
  const help = values.help === true;
  const needs = values.needs ?? [];
  if (!help && needs.length === 0) {
    throw new UsageError('--needs is required');
  }
  if (values.offline === true && values['refresh-index'] === true) {
    throw new UsageError('--offline and --refresh-index cannot be combined');
  }
  let timeoutMs = 600_000;
  if (values.timeout !== undefined) {
    const parsed = Number(values.timeout);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new UsageError(
        '--timeout needs a positive integer of milliseconds',
      );
    }
    timeoutMs = parsed;
  }
  return {
    needs,
    cacheDir: values.cache ?? DEFAULT_CACHE_DIR,
    offline: values.offline === true,
    force: values.force === true,
    refreshIndex: values['refresh-index'] === true,
    proxy: values.proxy ?? null,
    timeoutMs,
    help,
  };
}

export interface ExtractCommandDeps {
  readonly files?: BuildFiles;
  readonly git?: GitProcess;
  /** Replaces the git-backed clone cache. */
  readonly repos?: RepoCache;
  readonly sources?: readonly AssetSource[];
  readonly log?: (message: string) => void;
  readonly error?: (message: string) => void;
}

/** Runs the command and returns its exit code. */
export async function extractCommand(
  argv: readonly string[],
  deps: ExtractCommandDeps = {},
): Promise<number> {
  const log = deps.log ?? console.log;
  const error = deps.error ?? console.error;
  let flags: ExtractFlags;
  try {
    flags = parseExtractArgs(argv);
  } catch (cause) {
    error(cause instanceof Error ? cause.message : String(cause));
    return 2;
  }
  if (flags.help) {
    log(EXTRACT_HELP);
    return 0;
  }
  const files = deps.files ?? nodeBuildFiles;
  const git = deps.git ?? nodeGitProcess;
  try {
    const layout = extractorWorkspace(flags.cacheDir).cache;
    const needs = await readNeeds(
      files,
      flags.needs.map((path) => resolve(path)),
    );
    let repos = deps.repos;
    if (!repos) {
      log(`[extract] git ${await assertGitVersion(git)}`);
      repos = new GitRepoCache({
        reposDir: layout.repos,
        git,
        files,
        offline: flags.offline,
        refresh: flags.refreshIndex,
        proxy: flags.proxy,
        timeoutMs: flags.timeoutMs,
        log,
      });
    }
    const result = await extractAssets({
      needs,
      layout,
      files,
      repos,
      sources: deps.sources ?? (await createSources(files)),
      offline: flags.offline,
      force: flags.force,
      refreshIndex: flags.refreshIndex,
      log,
    });
    for (const need of result.catalog.missing) {
      const line = `[extract] missing ${need.required ? 'required' : 'optional'} ${need.key}: ${need.tried.map((attempt) => `${attempt.source}: ${attempt.reason}`).join('; ')}`;
      if (need.required) {
        error(line);
      } else {
        log(line);
      }
    }
    log(`[extract] catalog ${layout.catalog}`);
    return result.missingRequired.length > 0 ? 1 : 0;
  } catch (cause) {
    if (cause instanceof BuildReadError) {
      error(`extract: ${cause.path}: ${cause.message}`);
    } else {
      error(
        `extract: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    }
    return 2;
  }
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  extractCommand(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
