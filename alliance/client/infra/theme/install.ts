import { tokenSheet } from './token.js';
import { TOKENS } from './tokens.js';
import './layer.css';

const TOKEN_STYLE_ID = 'alliance-tokens';

/** Puts the default tokens on the page. */
export function installTheme(target: Document = document): void {
  if (target.getElementById(TOKEN_STYLE_ID)) {
    return;
  }
  const style = target.createElement('style');
  style.id = TOKEN_STYLE_ID;
  style.textContent = tokenSheet(TOKENS, 'tokens');
  target.head.append(style);
}

/** Puts a text size step on the root; the base layer turns it into the root font size. */
export function applyTextSize(size: string, target: Document = document): void {
  target.documentElement.dataset['text'] = size;
}
