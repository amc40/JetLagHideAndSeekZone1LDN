import pluginJs from "@eslint/js";
import pluginImportAlias from "eslint-plugin-import-alias";
import pluginReact from "eslint-plugin-react";
import pluginReactHooks from "eslint-plugin-react-hooks";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import globals from "globals";
import tseslint from "typescript-eslint";

import tsconfig from "./tsconfig.json" with { type: "json" };

/** @type {import('eslint').Linter.Config[]} */
export default [
    { files: ["**/*.{js,mjs,cjs,ts,jsx,tsx}"] },
    { languageOptions: { globals: globals.browser } },
    pluginJs.configs.recommended,
    ...tseslint.configs.strict,
    pluginReact.configs.flat.recommended,
    {
        plugins: {
            "import-alias": pluginImportAlias,
            "simple-import-sort": simpleImportSort,
            "react-hooks": pluginReactHooks,
        },
        settings: {
            react: {
                version: "19",
            },
        },
        rules: {
            "react-hooks/rules-of-hooks": "error",
            "react-hooks/exhaustive-deps": "warn",
            "import-alias/import-alias": [
                "error",
                {
                    relativeDepth: 0,
                    aliases: Object.entries(tsconfig.compilerOptions.paths).map(
                        ([to, [from]]) => ({
                            alias: to.replace(/\*$/, ""),
                            matcher: from.replace(/^\.\//, "^"),
                        }),
                    ),
                },
            ],
            "react/react-in-jsx-scope": "off",
            "@typescript-eslint/no-explicit-any": "warn",
            "@typescript-eslint/no-non-null-assertion": "warn",
            "@typescript-eslint/consistent-type-imports": [
                "error",
                { prefer: "type-imports", fixStyle: "inline-type-imports" },
            ],
            "simple-import-sort/imports": "error",
            "simple-import-sort/exports": "error",
            "no-console": ["warn", { allow: ["error", "warn"] }],
        },
    },
];
