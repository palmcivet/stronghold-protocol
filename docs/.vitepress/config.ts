import { readdirSync, readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig, type DefaultTheme } from "vitepress"
import { generateSidebar } from "vitepress-sidebar"
import type { VitePressSidebarOptions } from "vitepress-sidebar/types"

const docsRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")

const sectionNames = readdirSync(docsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules")
  .map((entry) => entry.name)
  .sort((left, right) => left.localeCompare(right, "en"))

function sectionOptions(section: string): VitePressSidebarOptions {
  return {
    documentRootPath: "/",
    scanStartPath: section,
    resolvePath: `/${section}/`,
    basePath: `/${section}/`,
    excludeByGlobPattern: ["node_modules/**"],
    useTitleFromFileHeading: true,
    useFolderTitleFromIndexFile: true,
    useFolderLinkFromIndexFile: true,
    folderLinkNotIncludesFileName: true,
    sortMenusOrderNumericallyFromLink: true,
    removePrefixAfterOrdering: true,
    prefixSeparator: "-",
    collapsed: false,
  }
}

function sectionTitle(section: string): string {
  const indexPath = join(docsRoot, section, "index.md")
  try {
    const title = readFileSync(indexPath, "utf8").match(/^title:\s*"?([^"\n]+?)"?\s*$/m)
    return title?.[1] ?? section
  } catch {
    return section
  }
}

function toDirectoryLink(link: string | undefined): string | undefined {
  return link?.replace(/\/index(\.md)?$/, "/").replace(/^index\.md$/, "")
}

function withDirectoryLinks(items: DefaultTheme.SidebarItem[]): DefaultTheme.SidebarItem[] {
  return items.map((item) => ({
    ...item,
    link: toDirectoryLink(item.link),
    items: item.items && withDirectoryLinks(item.items),
  }))
}

function firstLink(items: DefaultTheme.SidebarItem[]): string | undefined {
  for (const item of items) {
    const link = item.link ?? (item.items && firstLink(item.items))
    if (link) {
      return link
    }
  }
  return undefined
}

const generated = generateSidebar(sectionNames.map(sectionOptions)) as Record<
  string,
  { base: string; items: DefaultTheme.SidebarItem[] }
>

const sidebar: Record<string, { base: string; items: DefaultTheme.SidebarItem[] }> = Object.fromEntries(
  Object.entries(generated).map(([path, group]) => [
    path,
    { base: group.base, items: withDirectoryLinks(group.items) },
  ]),
)

const nav: DefaultTheme.NavItem[] = sectionNames.map((section) => {
  const sectionSidebar = sidebar[`/${section}/`]
  const link = sectionSidebar ? firstLink(sectionSidebar.items) : undefined

  return {
    text: sectionTitle(section),
    link: `/${section}/${link ?? ""}`,
  }
})

export default defineConfig({
  title: "卫戍协议：盟约",
  description: "Stronghold Protocol: Alliance 的项目文档",
  base: process.env.VITEPRESS_BASE ?? "/",
  cleanUrls: true,
  ignoreDeadLinks: [/^https?:\/\//, /LICENSE(?:\.md)?$/, /releases\/latest$/],
  themeConfig: {
    nav,
    sidebar,
    outline: "deep",
    socialLinks: [
      {
        icon: "github",
        link: "https://github.com/sganggs/Stronghold-Protocol",
      },
    ],
  },
})
