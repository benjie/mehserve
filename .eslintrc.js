module.exports = {
  parser: "babel-eslint",
  parserOptions: {
    sourceType: "module",
  },
  extends: ["eslint:recommended", "plugin:prettier/recommended"],
  env: {
    jest: true,
    es6: true,
    node: true,
  },
  globals: {
    process: true,
    modules: true,
  },
  rules: {
    "no-debugger": 0,
    "prettier/prettier": "error",
    "no-confusing-arrow": 0,
    "no-console": 0,
    "no-else-return": 0,
    "no-underscore-dangle": 0,
    "no-unused-vars": [
      2,
      {
        argsIgnorePattern: "^_",
      },
    ],
    "no-restricted-syntax": 0,
    "no-await-in-loop": 0,
  },
};
