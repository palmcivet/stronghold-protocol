import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type DefaultTheme, defineConfig } from 'vitepress';
import { generateSidebar } from 'vitepress-sidebar';
import type { VitePressSidebarOptions } from 'vitepress-sidebar/types';
import { noticeLinks } from './plugins/notice-links';
import { typecheck } from './plugins/typecheck';

const docsRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Sidebar label of a section home. */
const OVERVIEW_TEXT = '概览';

/** Top navigation order. A section appears once it has an `index.md`. */
const SECTION_ORDER = [
  'alliance',
  'guides',
  'mission-core',
  'mission-renderer',
  'assets-catalog',
  'assets-extractor',
  'license',
];

const sectionNames = SECTION_ORDER.filter((section) =>
  existsSync(join(docsRoot, section, 'index.md')),
);

function sectionOptions(section: string): VitePressSidebarOptions {
  return {
    documentRootPath: '/',
    scanStartPath: section,
    resolvePath: `/${section}/`,
    basePath: `/${section}/`,
    excludeByGlobPattern: ['node_modules/**'],
    useTitleFromFrontmatter: true,
    useTitleFromFileHeading: true,
    useFolderTitleFromIndexFile: true,
    useFolderLinkFromIndexFile: true,
    folderLinkNotIncludesFileName: true,
    sortMenusOrderNumericallyFromLink: true,
    removePrefixAfterOrdering: true,
    prefixSeparator: /^\d+-/,
    collapsed: false,
    includeRootIndexFile: true,
  };
}

function sectionTitle(section: string): string {
  const indexPath = join(docsRoot, section, 'index.md');
  try {
    const title = readFileSync(indexPath, 'utf8').match(
      /^title:\s*"?([^"\n]+?)"?\s*$/m,
    );
    return title?.[1] ?? section;
  } catch {
    return section;
  }
}

function toDirectoryLink(link: string | undefined): string | undefined {
  return link?.replace(/\/index(\.md)?$/, '/').replace(/^index\.md$/, '');
}

/**
 * Moves the section home to the top of its sidebar, labelled as the overview.
 * The theme prefixes links with the group base and skips empty links, so the home link is the base itself from the site root.
 */
function withOverviewFirst(
  base: string,
  items: DefaultTheme.SidebarItem[],
): DefaultTheme.SidebarItem[] {
  const home = items.find((item) => item.link === 'index.md');
  if (!home) {
    return withDirectoryLinks(items);
  }
  const overview: DefaultTheme.SidebarItem = {
    text: OVERVIEW_TEXT,
    base: '/',
    link: base.replace(/^\//, ''),
  };
  return [
    overview,
    ...withDirectoryLinks(items.filter((item) => item !== home)),
  ];
}

function withDirectoryLinks(
  items: DefaultTheme.SidebarItem[],
): DefaultTheme.SidebarItem[] {
  return items.map((item) => ({
    ...item,
    link: toDirectoryLink(item.link),
    items: item.items && withDirectoryLinks(item.items),
  }));
}

const generated = generateSidebar(sectionNames.map(sectionOptions)) as Record<
  string,
  { base: string; items: DefaultTheme.SidebarItem[] }
>;

const sidebar: Record<
  string,
  { base: string; items: DefaultTheme.SidebarItem[] }
> = Object.fromEntries(
  Object.entries(generated).map(([path, group]) => [
    path,
    { base: group.base, items: withOverviewFirst(group.base, group.items) },
  ]),
);

const nav: DefaultTheme.NavItem[] = sectionNames.map((section) => ({
  text: sectionTitle(section),
  link: `/${section}/`,
  activeMatch: `^/${section}/`,
}));

const examples = typecheck({
  modules: [
    'assets-catalog',
    'assets-extractor',
    'alliance',
    'mission-renderer',
    'mission-core',
  ],
});

export default defineConfig({
  title: '卫戍协议：盟约',
  description: 'Stronghold Protocol: Alliance 的项目文档',
  locales: {
    root: {
      label: '简体中文',
      lang: 'zh-CN',
    },
  },
  base: process.env.VITEPRESS_BASE ?? '/',
  cleanUrls: true,
  srcExclude: ['README.md'],
  markdown: {
    config: (md) => {
      examples.markdown(md);
      md.use(
        noticeLinks({
          page: 'license/02-notice.md',
          links: {
            'LICENSE.md': '/license/01-gpl',
            'assets-extractor/source/local-client/python/LICENSE.md':
              'https://github.com/palmcivet/stronghold-protocol/blob/main/assets-extractor/source/local-client/python/LICENSE.md',
          },
        }),
      );
    },
    codeCopyButtonTitle: '复制代码',
    container: {
      tipLabel: '提示',
      infoLabel: '信息',
      warningLabel: '警告',
      dangerLabel: '危险',
      detailsLabel: '详细信息',
    },
  },
  buildEnd: examples.buildEnd,
  themeConfig: {
    nav,
    sidebar,
    outline: { level: 'deep', label: '本页目录' },
    langMenuLabel: '选择语言',
    sidebarMenuLabel: '目录',
    returnToTopLabel: '返回顶部',
    darkModeSwitchLabel: '外观',
    lightModeSwitchTitle: '切换到浅色主题',
    darkModeSwitchTitle: '切换到深色主题',
    docFooter: {
      prev: '上一页',
      next: '下一页',
    },
    lastUpdatedText: '最后更新于',
    editLink: {
      text: '编辑此页',
      pattern:
        'https://https://github.com/palmcivet/stronghold-protocol/edit/main/docs/:path',
    },
    socialLinks: [
      {
        icon: 'github',
        link: 'https://github.com/palmcivet/stronghold-protocol',
      },
    ],
  },
});
