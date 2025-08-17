module.exports = {
  root: true,
  env: {
    es6: true,
    node: true,
  },
  extends: [
    "eslint:recommended",
    "plugin:import/errors",
    "plugin:import/warnings",
    "plugin:import/typescript",
    "google",
    "plugin:@typescript-eslint/recommended",
  ],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: ["tsconfig.json"],
    sourceType: "module",
    tsconfigRootDir: __dirname,
  },
  ignorePatterns: [
    "/lib/**/*", // Ignore compiled output
    ".eslintrc.js", // Ignore this config file itself
    "node_modules/", // Ignore node modules
  ],
  plugins: ["@typescript-eslint", "import"],
  rules: {
    "quotes": ["error", "double"], // Prefer double quotes
    "import/no-unresolved": 0, // Allow imports without resolution (handled by TS)
    "indent": ["error", 2], // Enforce 2-space indentation
    "object-curly-spacing": ["error", "always"], // Require spaces inside object literals
    "max-len": ["error", { "code": 120 }], // Max line length of 120 characters
    "require-jsdoc": "off", // Disable JSDoc requirement, common in serverless functions
    "camelcase": "off", // Allow non-camelCase names where appropriate (e.g., API responses)
    "@typescript-eslint/no-explicit-any": "warn", // Warn on explicit 'any' types
    "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }], // Warn on unused variables, ignore those starting with '_'
  },
};