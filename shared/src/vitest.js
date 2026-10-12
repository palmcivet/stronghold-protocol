// The vitest config every package uses

import { defineConfig } from 'vitest/config';
import { findWorkspaceRoot } from './workspace.js';

const workspaceRoot = findWorkspaceRoot(new URL('.', import.meta.url));
const conditions = ['source', 'import', 'module', 'default'];

/** @type {typeof import('../types/vitest.js').moduleTest} */
export function moduleTest(name, options = {}) {
  return defineConfig({
    resolve: { conditions },
    ssr: { resolve: { conditions } },
    server: { fs: { allow: [workspaceRoot] } },
    test: {
      name,
      environment: options.environment ?? 'node',
      include: options.include ? [...options.include] : ['test/**/*.test.ts'],
      server: { deps: { inline: [/^@alliance\//, /^arknights-/] } },
    },
  });
}
