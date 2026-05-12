---
name: sync-locales
description: Propagate diffs in control/messages/en.json across the other locale files. Computes a leaf-level diff (added/modified/removed keys) vs a git ref, then fans out one subagent per non-en locale to apply removals and translate the new/changed keys. Invoke as `/sync-locales` (vs HEAD) or `/sync-locales <ref>`. Use when the user has edited en.json and wants the translated locale files updated without a full re-translation.
---

# /sync-locales

Sync the non-`en` locale files in `control/messages/` to match the latest edits to `en.json`. Use this when you've changed a handful of English strings (added, modified, or removed keys) and want the existing translated locales to catch up — without re-translating the entire ~99KB / 1834-string file.

Companion to `/translate-messages`: that skill bootstraps a new locale from scratch, this one keeps existing locales in step with the source.

## When invoked

The user types one of:
- `/sync-locales` — diffs the working-tree `en.json` against `HEAD`.
- `/sync-locales <ref>` — diffs against an arbitrary commit/branch (e.g. `main`, `HEAD~3`).

If no non-`en` locale files exist in `control/messages/`, stop and tell the user — there's nothing to sync.

## Plan of action

Steps 1–3 are sequential; step 4 fans out in parallel.

### 1. Compute the diff

Run the helper script:

```
cd control && node scripts/diff-locale.mjs [<ref>]
```

It emits JSON `{ ref, added, modified, removed }` on stdout. Each entry carries a `path` (array of keys from root to leaf) and the relevant English value(s):

- `added`: `{ path, value }` — leaf present in the new en.json, missing at the ref.
- `modified`: `{ path, before, after }` — leaf value changed.
- `removed`: `{ path, before }` — leaf present at the ref, absent in the new en.json.

Whole subtree adds/removes naturally expand into one entry per leaf (so the subagent never receives a nested object as `value`/`before`/`after`).

If the script exits non-zero, surface the error and stop.

If all three arrays are empty, stop and tell the user there's nothing to sync.

### 2. Brief the user

Print one short line: e.g. `Syncing 12 locales — 3 added / 2 modified / 0 removed keys.` Don't dump the full changeset; the subagents handle that.

### 3. Discover target locales

List `control/messages/*.json` and drop `en.json`. Each remaining file is a target locale. The locale code is the filename without `.json`.

For each code, the autonym to pass to the subagent comes from `localeNames` in [control/i18n/config.js](control/i18n/config.js) (e.g. `es` → "Español", `ja` → "日本語"). If a code is somehow missing from `localeNames`, skip that locale and warn — it shouldn't be on disk without being wired in.

### 4. Fan out — one subagent per locale, all in one message

Spawn one `Agent` per target locale, **all in the same message** so they run in parallel. Use `subagent_type: general-purpose`.

Each subagent prompt is the **Sync Subagent Brief** below, with `<LOCALE_CODE>`, `<LOCALE_NAME>`, and `<CHANGESET_JSON>` substituted. The changeset JSON is the full output from step 1 — every subagent gets the same changeset, since the same keys need to change in every locale.

### 5. Final validation pass

After every subagent has returned, re-run the validator on each touched locale from the parent:

```
cd control && node scripts/validate-locale.mjs en <code>
```

This catches anything the subagent missed (structural drift, removed keys that didn't get cleaned up, etc.). If any locale fails here, flag it in the report — do not auto-revert; leave the file in place so the user can inspect.

### 6. Report

Three to five lines:
- Counts: locales succeeded vs failed, and the `+A ~M -R` totals applied.
- Any validator failures, by locale code.
- Reminder that this skill does **not** auto-commit — the user reviews the cross-locale diff themselves.

---

## Sync Subagent Brief

Each subagent receives this verbatim, with `<LOCALE_CODE>`, `<LOCALE_NAME>`, and `<CHANGESET_JSON>` substituted:

> You are syncing a translated i18n message catalog to match an updated English source. Apply only the listed changes — do not re-translate anything else.
>
> Target language: **<LOCALE_NAME>** (locale code: `<LOCALE_CODE>`).
> Target file: `/Users/fombico/Documents/mojulo-lite/control/messages/<LOCALE_CODE>.json` — edit in place with the Edit or Write tool.
> Source for context: `/Users/fombico/Documents/mojulo-lite/control/messages/en.json` — read it if you need surrounding strings to gauge tone or terminology.
>
> ### Changeset
>
> ```json
> <CHANGESET_JSON>
> ```
>
> - `added`: paths present in the new en.json but missing from your locale — translate the English `value` and insert at the same path.
> - `modified`: paths whose English value changed — re-translate `after` and overwrite the existing translation at that path.
> - `removed`: paths deleted from en.json — delete the same path from your locale file. If removing a leaf empties its parent object, remove the parent too (match en.json's shape exactly).
>
> ### Translation rules
>
> 1. **Preserve every ICU placeholder unchanged.** Tokens like `{name}`, `{count}`, `{itemLabel}` must appear literally in the translation, same name and braces. Don't translate the variable name; don't add or remove placeholders.
> 2. **Preserve ICU plural/select skeletons.** Strings like `{count, plural, one {file} other {files}}` keep their structural skeleton (`{count, plural, ...}`, `one`, `other`, `=0`, `=1`, `#`, commas, and spaces). Translate **only** the words inside the innermost `{ ... }` clauses.
>    - If the target language has additional plural forms (Russian: `one`/`few`/`many`/`other`; Polish: `one`/`few`/`many`/`other`), add them in standard ICU order. Always keep `other`.
>    - Don't translate the keyword names (`plural`, `select`, `selectordinal`, `one`, `few`, `many`, `zero`, `two`).
> 3. **Don't translate brand or technical tokens:** `Mojulo`, `Mojulo-Lite`, `Mojulo Control Panel`, `Anthropic`, `OpenAI`, `Gemini`, `Cohere`, `Bedrock`, `Docker`, `GHCR`, `Fly.io`, `SQLite`, `Next.js`, file extensions (`.zip`, `.json`, `.env`), env-var names (e.g. `MOJULO_API_KEY`, `NEXT_LOCALE`), CLI flag names, URL paths, model IDs.
> 4. **Match the existing file's register and terminology.** Read a handful of nearby strings in your locale file before writing — if it already uses a specific word for "deployment", "bot", "wizard", "provider", reuse it. Consistency with the existing translation matters more than picking the dictionary-perfect word.
> 5. **Form of address:** match what the existing translations already use (informal `tú`/`du`/`tu` vs formal). Don't switch mid-file.
> 6. **Output is valid JSON**, 2-space indent, UTF-8, no trailing commas, no comments. Don't reorder existing keys.
>
> ### Process
>
> 1. Read the target file with the Read tool.
> 2. For each `removed` path, delete the leaf and clean up any newly-empty parent objects.
> 3. For each `added` path, translate the value and insert at the same path (creating parent objects as needed).
> 4. For each `modified` path, translate `after` and overwrite the existing translation at that path.
> 5. Write the file back.
> 6. Validate: `cd /Users/fombico/Documents/mojulo-lite/control && node scripts/validate-locale.mjs en <LOCALE_CODE>`. If it prints `<LOCALE_CODE>.json: ok`, return success. If it prints validation errors, fix and re-write the file, then re-validate. Up to 2 retries; on the third failure return failure with the validator errors.
>
> ### Return format
>
> One short line:
> - On success: `<LOCALE_CODE>: ok (applied: +A ~M -R)` where A/M/R are the counts you actually applied.
> - On failure: `<LOCALE_CODE>: failed — <reason>` followed by the validator errors.
>
> Don't dump the modified JSON in your response — the parent doesn't need it; the file on disk is the artifact.

---

## Notes for the orchestrator

- The diff script only looks at leaf-level changes. A whole renamed object becomes a cascade of removes + adds at the leaf level, which is the right behavior — locales mirror the same restructuring.
- Don't update `control/i18n/config.js` from this skill. It never adds a new locale; use `/translate-messages` for that.
- Don't auto-commit. The user reviews the multi-locale diff themselves before staging.
- If `en.json` itself is malformed, `diff-locale.mjs` will exit non-zero with a parse error. Surface and stop — that's a bigger problem than the sync.
- Don't run `next build`. The dev server picks up the new locale strings on save.
