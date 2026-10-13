import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findWorkspaceRoot } from '@wsde/shared/workspace';

/** 从 start 向上找第一个含 marker 的目录。 */
export function findUp(start: string, marker: string): string {
  let directory = start;
  for (;;) {
    if (existsSync(join(directory, marker))) {
      return directory;
    }
    const parent = dirname(directory);
    if (parent === directory) {
      throw new Error(`no ${marker} above ${start}`);
    }
    directory = parent;
  }
}

const HERE = dirname(fileURLToPath(import.meta.url));

/** @alliance/compat-upstream 包的根目录，源码与 dist 下运行结果相同。 */
export const PACKAGE_ROOT: string = findUp(HERE, 'package.json');

/** pnpm 工作区的根目录。 */
export const WORKSPACE_ROOT: string = findWorkspaceRoot(PACKAGE_ROOT);

/** master 检出目录的缺省位置：包内的 `repo/`。 */
export const DEFAULT_REPO_DIR: string = join(PACKAGE_ROOT, 'repo');
