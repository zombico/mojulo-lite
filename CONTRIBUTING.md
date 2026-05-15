# Contributing

Thanks for considering a contribution.

This document covers the test surface and how to run the suite. For architecture, see [ARCHITECTURE.md](ARCHITECTURE.md) and [CLAUDE.md](CLAUDE.md). For the full test roadmap, see [lite-template/integration/UNIT_TEST_PLAN.md](lite-template/integration/UNIT_TEST_PLAN.md).

## Running tests

```bash
# Bot runtime (Node's built-in node:test, no extra deps)
cd lite-template
npm install
npm test

# Control plane (Vitest)
cd control
npm install
npm test
```

Both run in CI on every PR via [.github/workflows/test.yml](.github/workflows/test.yml) — Linux + macOS on Node 20.

## Test surface

Tests target three surfaces where a regression would be either silent or load-bearing:

1. **Public attack surface.** Auth, file uploads, user-controlled inputs — anything reachable from the open internet has tests. A regression here is a CVE.
2. **Silent corruption.** Hash chains, key encryption, artifact ZIP shape — bugs that ship to a user and aren't noticed for weeks.
3. **Install success.** The README must work on a fresh clone. CI smoke-tests this.

If you're adding a test, mapping it to one of those surfaces is the fastest path to merge. Tests for React rendering, framework glue (`path.join`, route wiring), translation fluency, or IO-heavy mocked wiring tend to lock in implementation details without catching regressions a user would notice — they'll usually be asked to retarget. Coverage percentages aren't a goal.

Rule of thumb when in doubt: **would a regression here be silent, or loud?** Silent regressions deserve tests; loud ones (which throw or visibly fail the first time you run the feature) usually don't.

## File layout

- `control/lib/foo.js` → `control/lib/foo.test.js` (co-located).
- `lite-template/test/*.test.js` (the bot's runner uses native CommonJS, kept under `test/` to match `node --test test/**/*.test.js`).

New tests should follow the existing pattern in the package they cover.

## Before submitting a PR

1. `npm test` passes in both packages.
2. `node --check` passes on any `.js`/`.mjs` you edited (CI enforces this).
3. If you touched `control/messages/en.json`, run `node control/scripts/validate-locale.mjs en <code>` for the locales you have changes for (the `/sync-locales` workflow handles propagation if you don't).
4. New strings in JSX are i18n-wrapped per CLAUDE.md.
