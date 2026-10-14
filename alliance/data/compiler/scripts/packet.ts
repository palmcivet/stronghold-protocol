#!/usr/bin/env node
import { join, resolve } from 'node:path';
import { parseArgs as parseArgv } from 'node:util';
import { BuildReadError, nodeBuildFiles } from 'arknights-assets-extractor';
import {
  type CompileOptions,
  compileSeason,
} from '#compiler/packet/compile/season.js';
import { seasonPacketDirectory } from '#schema/packet-file.js';
import { dataWorkspace } from '#workspace.js';

const USAGE: string =
  'usage: --season <id> [--out <dir>] [--cache <dir>] [--report <file>] [--quiet] [--no-research] [--force]';

interface ParsedArgs {
  readonly quiet: boolean;
  readonly noResearch: boolean;
  readonly force: boolean;
  readonly seasonId: string;
  readonly outDir: string;
  readonly extractCacheDir: string;
  readonly reportPath: string;
  readonly researchDir: string;
  readonly tuningPath: string;
}

function fail(message: string): never {
  console.error(`packet: ${message}`);
  process.exit(2);
}

function parseArgs(
  argv: readonly string[],
  workspace: ReturnType<typeof dataWorkspace>,
): ParsedArgs {
  const { values } = (() => {
    try {
      return parseArgv({
        args: [...argv],
        strict: true,
        options: {
          help: { type: 'boolean' as const, short: 'h' as const },
          quiet: { type: 'boolean' as const },
          'no-research': { type: 'boolean' as const },
          force: { type: 'boolean' as const },
          season: { type: 'string' as const },
          out: { type: 'string' as const },
          cache: { type: 'string' as const },
          report: { type: 'string' as const },
        },
      });
    } catch (cause) {
      fail(cause instanceof Error ? cause.message : String(cause));
    }
  })();
  if (values.help === true) {
    console.log(USAGE);
    process.exit(0);
  }
  const seasonId = values.season ?? null;
  if (!seasonId) {
    fail(`--season is required\n${USAGE}`);
  }
  try {
    seasonPacketDirectory(seasonId);
  } catch (cause) {
    fail(cause instanceof Error ? cause.message : String(cause));
  }
  return {
    quiet: values.quiet === true,
    noResearch: values['no-research'] === true,
    force: values.force === true,
    seasonId,
    outDir:
      values.out === undefined
        ? workspace.seasonDir(seasonId)
        : resolve(values.out),
    extractCacheDir:
      values.cache === undefined
        ? workspace.extractCacheDir
        : resolve(values.cache),
    reportPath:
      values.report === undefined
        ? workspace.reportPath
        : resolve(values.report),
    researchDir: workspace.researchDir,
    tuningPath: join(workspace.seasonInputDir(seasonId), 'tuning.json'),
  };
}

const parsed = parseArgs(process.argv.slice(2), dataWorkspace());
const options: CompileOptions = parsed;

compileSeason(nodeBuildFiles, options).then(
  (result) => {
    process.exitCode = result.exitCode;
  },
  (cause: unknown) => {
    if (cause instanceof BuildReadError) {
      console.error(`packet failed: ${cause.path}: ${cause.message}`);
    } else if (cause instanceof Error) {
      console.error('packet failed:', cause.stack ?? cause.message);
    } else {
      console.error('packet failed:', cause);
    }
    process.exitCode = 1;
  },
);
