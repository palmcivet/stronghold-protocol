import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { pageSocketUrl } from '#infra/connection/socket.js';
import { getWsde } from '#infra/debug/index.js';
import { Overlays } from '#infra/debug/overlays.js';
import { probe } from '#infra/platform/index.js';
import { createAppRouter } from '#infra/router/router.js';
import { installTheme } from '#infra/theme/install.js';
import { boot } from './boot.js';
import { createIdentity } from './identity.js';
import { seatStore } from './seat.js';
import { startStorage } from './storage.js';

async function start(): Promise<void> {
  // Host overrides: probe({ ... }) or configurePlatform({ ... }) before this when embedding.
  probe();
  installTheme();
  // a Tauri or Capacitor host passes its adapters here (`startStorage(url, { small, large, secureTab, secureDevice })`)
  await startStorage(pageSocketUrl(location));
  // the identity reads the preloaded token, and picks one before the first hello, as master's main.js
  const identity = createIdentity({
    onYield: () => seatStore.getState().reconnect(),
  });
  await identity.init();
  const runtime = boot(location, identity);
  // Attach host API on window.wsde; DEV builds also merge debug overlays.
  if (import.meta.env.DEV) {
    const debug = getWsde();
    window.wsde = debug ? { ...runtime.api, ...debug } : runtime.api;
  } else {
    window.wsde = runtime.api;
  }
  const router = createAppRouter(runtime);
  const mount = document.getElementById('app');
  if (mount) {
    createRoot(mount).render(
      <StrictMode>
        <RouterProvider router={router} />
        {import.meta.env.DEV ? <Overlays /> : null}
      </StrictMode>,
    );
  }
}

void start();
