import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs", "iife"],
  globalName: "DebugCssOverflow",
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2019",
  outExtension({ format }) {
    if (format === "cjs") return { js: ".cjs" };
    if (format === "iife") return { js: ".global.js" };
    return { js: ".mjs" };
  },
});
