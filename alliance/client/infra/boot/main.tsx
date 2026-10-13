import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createAppRouter } from '../router/router.js';
import { installTheme } from '../theme/install.js';
import { boot } from './boot.js';

installTheme();
const runtime = boot();
window.alliance = runtime.api;
const router = createAppRouter(runtime);

const mount = document.getElementById('app');
if (mount) {
  createRoot(mount).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  );
}
