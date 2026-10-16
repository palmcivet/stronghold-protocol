import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { type DefaultTheme, defineConfig } from 'vitepress';
import { generateSidebar } from 'vitepress-sidebar';
import type {
  Sidebar,
  SidebarMulti,
  VitePressSidebarOptions,
} from 'vitepress-sidebar/types';
import { noticeLinks } from './plugins/notice-links.js';
import { typecheck } from './plugins/typecheck.js';
import { renderTraceSection, traceSourceFiles } from './trace-page.js';

const docsRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Sidebar label of a section home. */
const OVERVIEW_TEXT = '概览';

interface Section {
  /** Docs directory and nav slug. */
  name: string;
  /** Sidebar「概览」points at this section's index. */
  overview?: boolean;
  /** Unwrap maintain/ so its pages sit directly under the section. */
  flattenMaintain?: boolean;
  /** License pages have no fenced examples to type-check. */
  skipExamples?: boolean;
}

/**
 * Nav order. A section appears once it has an `index.md`.
 * alliance is maintainer-only for now: pages live under maintain/, that
 * folder is unwrapped (no「维护」header), and the index stays as「概览」.
 */
const SECTIONS: readonly Section[] = [
  { name: 'alliance', overview: true, flattenMaintain: true },
  { name: 'mission-core' },
  { name: 'mission-renderer' },
  { name: 'assets-catalog' },
  { name: 'assets-extractor' },
  { name: 'license', skipExamples: true },
];

const published = SECTIONS.filter((section) =>
  existsSync(join(docsRoot, section.name, 'index.md')),
);

function sectionOptions(section: Section): VitePressSidebarOptions {
  return {
    documentRootPath: '/',
    scanStartPath: section.name,
    resolvePath: `/${section.name}/`,
    basePath: `/${section.name}/`,
    excludeByGlobPattern: ['node_modules/**'],
    useTitleFromFrontmatter: true,
    useTitleFromFileHeading: true,
    // Topic folders keep the title and link of their index.md.
    // reference/ and maintain/ have no index.md; shapeSidebar names them.
    useFolderTitleFromIndexFile: true,
    useFolderLinkFromIndexFile: true,
    folderLinkNotIncludesFileName: true,
    sortMenusOrderNumericallyFromLink: true,
    removePrefixAfterOrdering: true,
    prefixSeparator: /^\d+-/,
    // Group headers start expanded.
    collapsed: false,
    includeRootIndexFile: section.overview === true,
  };
}

function sectionTitle(section: string): string {
  const indexPath = join(docsRoot, section, 'index.md');
  try {
    // `{}` skips gray-matter's cache. A cached parse drops fields on the next read.
    const title = matter(readFileSync(indexPath, 'utf8'), {}).data.title;
    return typeof title === 'string' && title.length > 0 ? title : section;
  } catch {
    return section;
  }
}

function toDirectoryLink(link: string): string {
  return link.replace(/\/index(\.md)?$/, '/').replace(/^index\.md$/, '');
}

function withChildItems(
  item: DefaultTheme.SidebarItem,
  map: (items: DefaultTheme.SidebarItem[]) => DefaultTheme.SidebarItem[],
): DefaultTheme.SidebarItem {
  const next: DefaultTheme.SidebarItem = { ...item };
  if (item.items) {
    next.items = map(item.items);
  }
  return next;
}

/**
 * Overview sections: the section home becomes a top「概览」item.
 * Other sections drop it; the top nav already opens index.md.
 * The theme prefixes links with the group base and skips empty links,
 * so the home link is the base itself, resolved from the site root.
 */
function withSidebarItems(
  section: Section,
  base: string,
  items: DefaultTheme.SidebarItem[],
): DefaultTheme.SidebarItem[] {
  if (!section.overview) {
    return withDirectoryLinks(items.filter((item) => item.link !== 'index.md'));
  }
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
  return items.map((item) => {
    const next = withChildItems(item, withDirectoryLinks);
    if (item.link !== undefined) {
      next.link = toDirectoryLink(item.link);
    }
    return next;
  });
}

/** Disk folder → header. These folders have no index.md, so they are not links. */
const GROUP_LABEL = {
  reference: '参考',
  maintain: '维护',
} as const;

type GroupFolder = keyof typeof GROUP_LABEL;

function isGroupLink(link: string, folder: GroupFolder): boolean {
  const path = link.endsWith('/') ? link.slice(0, -1) : link;
  return path === folder || path.endsWith(`/${folder}`);
}

/** A reference/ or maintain/ group, before or after it has been renamed. */
function groupFolder(item: DefaultTheme.SidebarItem): GroupFolder | undefined {
  const text = item.text ?? '';
  for (const folder of Object.keys(GROUP_LABEL) as GroupFolder[]) {
    if (
      text === folder ||
      text === GROUP_LABEL[folder] ||
      (item.link !== undefined && isGroupLink(item.link, folder))
    ) {
      return folder;
    }
  }
  return undefined;
}

/**
 * Rename reference/maintain groups to 参考/维护 and drop their links,
 * so they render as collapsible headers.
 */
function withGroupFolders(
  items: DefaultTheme.SidebarItem[],
): DefaultTheme.SidebarItem[] {
  return items.map((item) => {
    const folder = groupFolder(item);
    const next = withChildItems(item, withGroupFolders);
    if (!folder) {
      return next;
    }
    const header: DefaultTheme.SidebarItem = {
      ...next,
      text: GROUP_LABEL[folder],
    };
    delete header.link;
    return header;
  });
}

/** Replace a maintain/ group with its children. Their links already include `maintain/`. */
function withFlattenedMaintain(
  section: Section,
  items: DefaultTheme.SidebarItem[],
): DefaultTheme.SidebarItem[] {
  if (!section.flattenMaintain) {
    return items;
  }
  return items.flatMap((item) =>
    groupFolder(item) === 'maintain' ? (item.items ?? []) : [item],
  );
}

/**
 * vitepress-sidebar orders by link, so maintain/ comes before reference/.
 * Swap those two groups. Every other item stays where it is.
 */
function withReferenceBeforeMaintain(
  items: DefaultTheme.SidebarItem[],
): DefaultTheme.SidebarItem[] {
  const next = items.map((item) =>
    withChildItems(item, withReferenceBeforeMaintain),
  );
  const reference = next.findIndex((item) => groupFolder(item) === 'reference');
  const maintain = next.findIndex((item) => groupFolder(item) === 'maintain');
  const referenceItem = next[reference];
  const maintainItem = next[maintain];
  if (referenceItem && maintainItem && maintain < reference) {
    next[maintain] = referenceItem;
    next[reference] = maintainItem;
  }
  return next;
}

function shapeSidebar(
  section: Section,
  base: string,
  items: DefaultTheme.SidebarItem[],
): DefaultTheme.SidebarItem[] {
  const withOverview = withSidebarItems(section, base, items);
  const named = withGroupFolders(withOverview);
  const flattened = withFlattenedMaintain(section, named);
  return withReferenceBeforeMaintain(flattened);
}

function sectionSidebars(options: VitePressSidebarOptions[]): SidebarMulti {
  const sidebar: Sidebar = generateSidebar(options);
  if (Array.isArray(sidebar)) {
    throw new Error(
      'vitepress-sidebar returned one sidebar; expected a group per section',
    );
  }
  return sidebar;
}

const generated = sectionSidebars(published.map(sectionOptions));

const sidebar: Record<
  string,
  { base: string; items: DefaultTheme.SidebarItem[] }
> = Object.fromEntries(
  published.map((section) => {
    const path = `/${section.name}/`;
    const group = generated[path];
    if (!group) {
      throw new Error(`vitepress-sidebar omitted the ${path} sidebar`);
    }
    return [
      path,
      {
        base: group.base,
        items: shapeSidebar(section, group.base, group.items),
      },
    ];
  }),
);

const nav: DefaultTheme.NavItem[] = published.map((section) => ({
  text: sectionTitle(section.name),
  link: `/${section.name}/`,
  activeMatch: `^/${section.name}/`,
}));

const examples = typecheck({
  modules: published
    .filter((section) => !section.skipExamples)
    .map((section) => section.name),
});

export default defineConfig({
  vite: {
    plugins: [
      {
        name: 'trace-entries',
        enforce: 'pre',
        async transform(code, id) {
          if (!id.endsWith('alliance/maintain/compat/03-trace.md')) {
            return;
          }
          for (const file of traceSourceFiles()) {
            this.addWatchFile(file);
          }
          let next = code;
          for (const match of code.matchAll(
            /<!-- trace-entries:([a-z-]+) -->/g,
          )) {
            const pkg = match[1];
            if (pkg === undefined) {
              continue;
            }
            const section = await renderTraceSection(pkg);
            next = next.replace(match[0], () => section);
          }
          return next;
        },
      },
    ],
  },
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
        'https://github.com/palmcivet/stronghold-protocol/edit/main/docs/:path',
    },
    socialLinks: [
      {
        icon: 'github',
        link: 'https://github.com/palmcivet/stronghold-protocol',
      },
    ],
  },
});
