import { readFileSync } from "node:fs";
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";

// Keep generated and private files outside lint as well as Git.
const ignores = readFileSync(new URL(".gitignore", import.meta.url), "utf8")
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#"))
  .map((line) => {
    const negated = line.startsWith("!");
    const pattern = negated ? line.slice(1) : line;
    const rooted = pattern.startsWith("/");
    const glob = rooted ? pattern.slice(1) : `**/${pattern}`;
    return `${negated ? "!" : ""}${glob}${glob.endsWith("/") ? "**" : ""}`;
  });

export default tseslint.config(
  { ignores },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx,js,mjs}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "no-empty": ["error", { allowEmptyCatch: true }],
      // Browser/WXT globals and missing names are checked by TypeScript.
      "no-undef": "off",
      // Existing browser mocks and provider payloads use explicit any.
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          ignoreRestSiblings: true,
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_"
        }
      ]
    }
  },
  {
    files: ["**/*.tsx"],
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn"
    }
  },
  {
    files: ["tests/e2e/**/*.ts"],
    // Playwright fixtures require the first argument to be destructured.
    rules: {
      "no-empty-pattern": ["error", { allowObjectPatternsAsParameters: true }]
    }
  },
  prettier
);
