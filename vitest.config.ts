import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    environmentOptions: {
      jsdom: {
        // A real origin is required for localStorage to be available.
        url: "http://localhost/",
      },
    },
  },
});
