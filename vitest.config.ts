import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(rootDir),
    },
  },
  test: {
    coverage: {
      exclude: [
        "app/layout.tsx",
        "app/multiplayer/page.tsx",
        "app/page.tsx",
        "test/**",
      ],
      include: ["app/**/*.{ts,tsx}"],
      provider: "v8",
      reporter: ["text", "html"],
    },
    environment: "jsdom",
    include: ["test/ui/**/*.test.{ts,tsx}"],
    setupFiles: ["./test/ui/setup.ts"],
  },
});
