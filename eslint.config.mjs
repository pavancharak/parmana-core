import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
  {
    ignores: [
      "**/dist/**",
      "**/*.d.ts",
      "**/coverage/**",
      "**/node_modules/**",

      // npm run mutation: Stryker's copy of the repository, and its reports.
      ".stryker-tmp/**",
      "reports/**",

      // Legacy/generated JS examples
      "typescript/**",
    ],
  },

  {
    files: ["**/*.cjs", "**/*.mjs", "*.cjs", "*.mjs"],
    languageOptions: {
      globals: {
        module: "readonly",
        require: "readonly",
        process: "readonly",
        console: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        exports: "readonly",
        // Global since Node 18; this repo requires Node >=24
        // (docs/VERIFICATION-GAPS.md #16), so it's always available.
        fetch: "readonly",
      },
    },
  },

  js.configs.recommended,

  ...tseslint.configs.recommended,

  {
    // proof-audit/ is the audit harness. It builds deliberately malformed and
    // tampered proofs and casts fixtures to the connector and gateway types, so
    // explicit any is the right tool there. Every other rule still applies.
    files: ["proof-audit/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },

  {
    // .cjs scripts are plain CommonJS by extension -- require() is the
    // only valid way to import here, not an ESM oversight to fix.
    // tseslint.configs.recommended (above) applies no-require-imports
    // to these files too; this override, coming after it in config
    // order, wins.
    files: ["**/*.cjs", "*.cjs"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },

  {
    files: ["packages/**/*.ts", "examples/**/*.ts"],

    languageOptions: {
      parserOptions: {
        project: false,
      },
    },

    rules: {
      "no-console": "off",

      "no-unused-vars": "off",

      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],

      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
];
