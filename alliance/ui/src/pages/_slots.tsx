'use client';

import { installTheme } from '#ui/theme/index.js';

// Tokens are written to the page once, in the browser; the docs shell renders nothing here.
if (typeof document !== 'undefined') {
  installTheme();
}

export function SidebarHeader() {
  return null;
}
