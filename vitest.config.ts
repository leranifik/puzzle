import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    exclude: ["tests-e2e/**", "node_modules/**"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      reportsDirectory: "coverage",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/generated/**", // prisma client — generated code
        "src/components/ui/**", // shadcn — vendored library code
        "src/app/**/layout.tsx",
        "src/app/**/page.tsx", // thin server wrappers; covered by e2e
      ],
    },
  },
});
