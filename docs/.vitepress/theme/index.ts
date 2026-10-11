/// <reference types="vitepress/client" />

import type { Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import { createMermaidRenderer } from 'vitepress-mermaid-renderer';
import { onMounted } from 'vue';
import './mermaid.css';

export default {
  extends: DefaultTheme,
  setup() {
    onMounted(() => {
      createMermaidRenderer();
    });
  },
} satisfies Theme;
