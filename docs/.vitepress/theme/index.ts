/// <reference types="vitepress/client" />
import DefaultTheme from "vitepress/theme"
import type { Theme } from "vitepress"
import { onMounted } from "vue"
import { createMermaidRenderer } from "vitepress-mermaid-renderer"
import "./mermaid.css"

export default {
  extends: DefaultTheme,
  setup() {
    onMounted(() => {
      createMermaidRenderer()
    })
  },
} satisfies Theme
