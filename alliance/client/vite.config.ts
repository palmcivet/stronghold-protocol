import { join } from 'node:path';
import { dataWorkspace } from '@alliance/data/workspace';
import react from '@vitejs/plugin-react';
import browserslist from 'browserslist';
import { browserslistToTargets } from 'lightningcss';
import { defineConfig, loadEnv, type ProxyOptions } from 'vite';
import { devResourcesPlugin } from './vite-plugins.ts';

const workspace = dataWorkspace();
const repoRoot = workspace.workspaceRoot;
const clientRoot = join(repoRoot, 'alliance', 'client');

/** Backend the dev server forwards to. The master backend sends no CORS headers, so the page stays same-origin. */
const DEFAULT_BACKEND = 'http://localhost:3000';
const PROXIED_PATHS = ['/data', '/assets', '/media'] as const;

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, clientRoot, 'ALLIANCE_');
  const backend = env.ALLIANCE_BACKEND || DEFAULT_BACKEND;
  const proxy: Record<string, ProxyOptions> = {
    '/ws': { target: backend, ws: true, changeOrigin: true },
  };
  for (const path of PROXIED_PATHS) {
    proxy[path] = { target: backend, changeOrigin: true };
  }
  return {
    root: clientRoot,
    plugins: [
      react(),
      devResourcesPlugin({
        productDir: workspace.productDir,
        derivedDir: workspace.derivedDir,
        extractedFilesDir: join(workspace.extractCacheDir, 'files'),
        localDir: join(clientRoot, 'local'),
      }),
    ],
    resolve: {
      conditions: ['@wsde/source'],
    },
    css: {
      transformer: 'lightningcss',
      lightningcss: {
        targets: browserslistToTargets(
          browserslist(undefined, { path: clientRoot }),
        ),
      },
    },
    server: {
      proxy,
      fs: {
        allow: [repoRoot],
      },
    },
    build: {
      outDir: 'dist-web',
      emptyOutDir: true,
      sourcemap: true,
      cssMinify: 'lightningcss',
    },
  };
});
