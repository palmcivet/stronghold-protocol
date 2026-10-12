// Rewrites the relative links of one page that includes a repository file.
//
// Included files such as the repository's NOTICE.md write their links for the
// repository (GitHub) layout. On the site those targets may be other pages or
// outside the docs, so they would be dead links. This plugin replaces the href
// of the links listed for the given page, and leaves every other link alone.
//
// The rewrite is done by `markdown-it-replace-link` in a markdown-it core rule,
// before VitePress renders the links, so the dead link check still validates
// the rewritten targets.

import replaceLink from 'markdown-it-replace-link';
import type { MarkdownRenderer } from 'vitepress';

export interface NoticeLinksOptions {
  /** Source path of the page, relative to the docs root, e.g. `license/02-notice.md`. */
  page: string;
  /** Maps the original href to the href used on the site. */
  links: Record<string, string>;
}

export function noticeLinks(
  options: NoticeLinksOptions,
): (md: MarkdownRenderer) => void {
  const targets = new Map(Object.entries(options.links));
  return (md) => {
    md.use(replaceLink, {
      replaceLink: (link: string, env: { relativePath?: unknown }) =>
        env.relativePath === options.page ? (targets.get(link) ?? link) : link,
    });
  };
}
