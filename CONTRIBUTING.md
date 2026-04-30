# Contributing to Markdown PDF Plus

Thank you for your interest in contributing! This document covers everything you need to set up the development environment, make changes, and submit a pull request.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Build Commands](#build-commands)
- [Running and Debugging](#running-and-debugging)
- [Testing](#testing)
- [Submitting a Pull Request](#submitting-a-pull-request)
- [Maintainer: Publishing](#maintainer-publishing)

---

## Prerequisites

- **Node.js 20** (the version used in CI)
- **Yarn** (classic / v1) — the project uses `yarn.lock`
- **VS Code** 1.85 or later

---

## Development Setup

```bash
# 1. Fork and clone the repository
git clone https://github.com/ThomasLatham/markdown-pdf-plus.git
cd markdown-pdf-plus

# 2. Install dependencies
yarn install
```

That's it. Chromium is resolved at runtime by `puppeteer-chromium-resolver` — no manual download is needed for development.

---

## Project Structure

```
src/
  extension.ts          # Entry point — command registration and activation
  exportPdf.ts          # PDF export logic (Puppeteer, CSP, progress notification)
  exportHtml.ts         # HTML export logic
  tableStyles.ts        # Table CSS presets
  util/                 # Shared helpers (CSS sanitization, file I/O, etc.)
  test/                 # Mocha tests and test fixtures
docs/
  customCss.md          # End-user CSS documentation
public/                 # Images used in README
.github/workflows/
  pr.yml                # CI quality gate (runs on every PR)
  publish.yml           # Automated Marketplace publishing (runs on push to main)
```

---

## Build Commands

| Command | What it does |
|---|---|
| `yarn run compile` | TypeScript type-check and compile to `out/` (no bundling) |
| `yarn run esbuild` | Bundle with esbuild + source maps (fast, for development) |
| `yarn run esbuild-watch` | Same as above, but watches for file changes |
| `yarn run lint` | Run ESLint across `src/` |
| `yarn run package` | Package a `.vsix` file using `vsce` |
| `yarn run vscode:prepublish` | Production bundle (esbuild, minified) — same as what publish runs |

> **Note:** `yarn run compile` and `yarn run esbuild` produce different outputs. Use `compile` for type-checking during development and `esbuild` (or `esbuild-watch`) when you want a bundled extension to test in the Extension Development Host.

---

## Running and Debugging

1. Open the repository in VS Code.
2. Press **F5** (or **Run → Start Debugging**).

This launches a new **Extension Development Host** window with your local build loaded. Open any Markdown file in that window and run the **Markdown PDF Plus: Export PDF** or **Export HTML** commands to test your changes.

The **Debug Console** in the main VS Code window shows extension host output. For export-specific logs, open **View → Output → Markdown PDF Plus** in the Extension Development Host window.

---

## Testing

```bash
# Run the full test suite (compile + lint first, then Mocha)
yarn run test
```

Tests live in `src/test/`. The suite uses Mocha with `@vscode/test-electron` to run tests inside a real VS Code instance.

---

## Submitting a Pull Request

1. **Fork** the repository and create a branch from `main`.

2. **Write conventional commits.** Commit messages must follow the [Conventional Commits](https://www.conventionalcommits.org/) format:

   ```
   type(scope): short description

   Optional longer explanation.
   ```

   Common types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `ci`.

3. **Keep changes focused.** One logical change per PR. If you are fixing a bug and also refactoring unrelated code, split them into two PRs.

4. **Include in your PR:**
   - A clear description of what changed and why
   - Steps to reproduce (for bug fixes) or steps to verify (for new features)
   - Updates to documentation (`README.md`, `docs/customCss.md`, etc.) if your change affects user-facing behavior
   - An entry in the `[Unreleased]` section of `CHANGELOG.md`

5. **CI must pass.** The `pr.yml` workflow runs on every PR and checks compile, lint, esbuild bundle, and VSIX packaging. PRs that fail CI will not be reviewed until the failures are resolved.

---

## Maintainer: Publishing

> This section is for repository maintainers only.

### How automated publishing works

The `publish.yml` workflow runs automatically on every push to `main` (excluding the version-bump commit it creates). Each run:

1. Computes a date-based version: `YYYY.M.D` (UTC, no zero-padding, e.g. `2025.6.15`).
2. Skips the release if a tag for that date already exists (at most one release per calendar day).
3. Bumps `version` in `package.json`, commits it as `chore(release): vYYYY.M.D`, and pushes it to `main`.
4. Runs TypeScript type-checking, ESLint, and the esbuild production bundle.
5. Packages a `.vsix`, publishes it to the VS Code Marketplace, and creates a GitHub Release with the `.vsix` attached.

### Required secret

| Secret name | Where to set it | Description |
|---|---|---|
| `VSCE_PAT` | Repository → Settings → Secrets and variables → Actions | Azure DevOps personal access token with **Marketplace (Manage)** scope |

To generate a `VSCE_PAT`, follow the [VS Code publishing guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#get-a-personal-access-token).

### Publisher ID

The `publisher` field in `package.json` must match the publisher registered at [marketplace.visualstudio.com/manage](https://marketplace.visualstudio.com/manage). A mismatch will cause the publish step to fail with a 401 or 403 error.

Current publisher: **`tom-latham`**

### Manual publish (fallback)

If you need to publish outside of the automated workflow:

```bash
yarn run package           # produces markdown-pdf-plus-<version>.vsix
npx vsce publish --yarn    # requires VSCE_PAT in the environment
```
