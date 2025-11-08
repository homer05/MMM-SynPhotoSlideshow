# Git Hooks

This directory contains Git hooks managed by [Husky](https://typicode.github.io/husky/).

## Pre-commit Hook

The pre-commit hook runs [lint-staged](https://github.com/lint-staged/lint-staged) which:

- Runs Prettier and ESLint on staged `.js`, `.mjs`, and `.css` files
- Runs Prettier on staged `.md` and `.json` files
- Automatically fixes issues when possible
- Only processes files that are staged for commit

### Configuration

The lint-staged configuration is in `package.json`:

```json
"lint-staged": {
  "*.{js,mjs,css}": [
    "prettier --write",
    "eslint --fix"
  ],
  "*.{md,json}": [
    "prettier --write"
  ]
}
```

### Bypassing Hooks

If you need to bypass the pre-commit hook (not recommended):

```bash
git commit --no-verify
```
