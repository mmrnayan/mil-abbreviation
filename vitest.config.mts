import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  test: {
    environment: "node",
    globals: true,
    // Exclude the stray nested copy of this project.
    exclude: ["**/node_modules/**", "service-abbreviation-converter/**", ".consumer-build/**", "platforms/**"],
    coverage: {
      reporter: ["text", "html"],
    },
  },
});
