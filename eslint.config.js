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
    // node:test's test() returns a promise the runner tracks itself.
    files: ["cli/**/*.test.ts"],
    rules: { "@typescript-eslint/no-floating-promises": "off" },
  },
);
