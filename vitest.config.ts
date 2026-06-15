import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  test: {
    alias: {
      "@obsidian-image-clipper/shared": resolve(root, "packages/shared/src/index.ts"),
    },
  },
});
