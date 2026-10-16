import '@fontsource-variable/noto-sans-sc';
import '@fontsource-variable/noto-serif-sc';
import '@fontsource-variable/saira/wdth.css';
import '@fontsource/rajdhani/500.css';
import '@fontsource/rajdhani/600.css';
import '@fontsource/rajdhani/700.css';
import {
  applySafeArea,
  applyViewport,
  installViewport,
  type SafeAreaMode,
  viewportStore,
} from './viewport.js';
import './layer.css';

/** Puts a text size step on the root. The base layer turns it into `--wsde-text-factor`. */
export function applyTextSize(size: string, target: Document = document): void {
  target.documentElement.dataset['text'] = size;
}

export {
  applySafeArea,
  applyViewport,
  installViewport,
  type SafeAreaMode,
  viewportStore,
};
