import type { UserConfig } from 'vitest/config';

export interface ModuleTestOptions {
  readonly environment?: 'node' | 'jsdom' | 'happy-dom';
  readonly include?: readonly string[];
}

/** The vitest config every package uses: source conditions, workspace packages inlined, files allowed from the workspace root. */
export function moduleTest(
  name: string,
  options?: ModuleTestOptions,
): UserConfig;
