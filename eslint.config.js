import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/", "dist-bin/", "node_modules/"] },
  {
    files: ["cli/**/*.ts"],
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // Bun-only entry files are outside the tsc build; type-check them with their own config.
    files: ["cli/bin/standalone.ts", "cli/bin/embed-assets.ts"],
    languageOptions: {
      parserOptions: {
        projectService: false,
        project: "./cli/tsconfig.bun.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // node:test's test() returns a promise the runner tracks itself.
    files: ["cli/**/*.test.ts"],
    rules: { "@typescript-eslint/no-floating-promises": "off" },
  },
);
