module.exports = {
  env: { browser: true, es2020: true },
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react-hooks/recommended",
  ],
  parser: "@typescript-eslint/parser",
  parserOptions: { ecmaVersion: "latest", sourceType: "module" },
  plugins: ["react-refresh", "simple-import-sort"],
  rules: {
    "react-refresh/only-export-components": "warn",
    "simple-import-sort/imports": "error",
    "simple-import-sort/exports": "error",
  },
  overrides: [
    {
      files: ["**/*.js", "**/*.ts", "**/*.tsx"],
      rules: {
        "simple-import-sort/imports": [
          "error",
          {
            groups: [
              ["^react$", "^[a-z]"],
              ["^@"],
              ["^@/"],
              ["^~"],
              ["^\\.\\.(?!/?$)", "^\\.\\./?$"],
              ["^\\./(?=.*/)(?!/?$)", "^\\.(?!/?$)", "^\\./?$"],
              ["^.+\\.s?css$"],
              ["^\\u0000"],
            ],
          },
        ],
      },
    },
  ],
};
