/**
 * Vite multi-page application (MPA) configuration for the playground.
 *
 * Routes:
 *   /           — redirects to /vanilla/
 *   /vanilla/   — plain HTML + TypeScript module
 *   /nunjucks/  — Nunjucks template (vite-plugin-njk-frontmatter) + HTMX
 *   /svelte/    — Svelte 5 (scoped CSS)
 *   /vue/       — Vue 3 (scoped CSS)
 *   /react/     — React 19
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { nunjucksFrontMatterPlugin } from "vite-plugin-njk-frontmatter";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import vue from "@vitejs/plugin-vue";
import react from "@vitejs/plugin-react";

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, "..");

export default defineConfig({
  plugins: [
    {
      name: "root-redirect",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === "/" || req.url === "/index.html") {
            res.writeHead(302, { Location: "/vanilla/" });
            res.end();
            return;
          }
          next();
        });
      },
    },
    nunjucksFrontMatterPlugin({
      pagesDir: ".",
      templatesDir: ["nunjucks"],
      globals: {
        siteName: "debug-css-overflow playground",
        language: "en",
      },
    }),
    svelte(),
    vue(),
    react(),
  ],
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    rollupOptions: {
      input: {
        vanilla: resolve(__dirname, "vanilla/index.html"),
        nunjucks: resolve(__dirname, "nunjucks/index.njk"),
        svelte: resolve(__dirname, "svelte/index.html"),
        vue: resolve(__dirname, "vue/index.html"),
        react: resolve(__dirname, "react/index.html"),
      },
    },
  },
});