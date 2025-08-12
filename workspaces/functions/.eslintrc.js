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
    // THE FIX: Point to the tsconfig.json in the CURRENT directory
    project: ["tsconfig.json"],
    sourceType: "module",
    // Add this line to specify the tsconfig's root directory
    tsconfigRootDir: __dirname,
  },
  ignorePatterns: [
    "/lib/**/*", // Ignore built files.
    ".eslintrc.js",
  ],
  plugins: ["@typescript-eslint", "import"],
  rules: {
    "quotes": ["error", "double"],
    "import/no-unresolved": 0,
    "indent": ["error", 2],
    "object-curly-spacing": ["error", "always"],
    "max-len": ["error", { "code": 120 }],
    "require-jsdoc": "off",
    "camelcase": "off",
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
  },
};