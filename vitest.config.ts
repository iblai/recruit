import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // tsconfig's `@/*`, for modules that import through it (the store).
  resolve: {
    alias: [{ find: /^@\//, replacement: fileURLToPath(new URL("./", import.meta.url)) }],
  },
  test: {
    include: ["__tests__/**/*.test.ts"],
    // The store test loads the SDK, whose ESM imports `next/navigation` without
    // an extension (Node can't resolve it); bundled, it also loads in ~1 s.
    deps: {
      optimizer: {
        ssr: {
          enabled: true,
          include: [
            "@iblai/iblai-js/data-layer",
            "@iblai/iblai-js/web-utils",
            "@iblai/iblai-js/web-containers/next",
          ],
        },
      },
    },
  },
});
