import { tokenSheet } from './token.js';
import { TOKENS } from './tokens.js';
import './base.css';

export { TOKENS };

const TOKEN_STYLE_ID = 'alliance-tokens';

/** Puts the default tokens on the page. The base layer loads with this module. */
export function installTheme(target: Document = document): void {
  if (target.getElementById(TOKEN_STYLE_ID)) {
    return;
  }
  const style = target.createElement('style');
  style.id = TOKEN_STYLE_ID;
  style.textContent = tokenSheet(TOKENS, 'tokens');
  target.head.append(style);
}
