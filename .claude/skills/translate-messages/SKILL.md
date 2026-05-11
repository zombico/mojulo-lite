---
name: translate-messages
description: Translate control/messages/en.json into one or more target locales and wire them into the control plane's i18n config. Invoke as `/translate-messages <locale> [<locale> ...]` (BCP-47 codes like es, fr, de, pt-BR, zh-TW). Each locale runs in its own subagent so they translate in parallel.
---

# /translate-messages

Translate `control/messages/en.json` into one or more target locales, validate each output, and add the new locales to `control/i18n/config.js` so the existing Settings → Language switcher picks them up.

## When invoked

The user types `/translate-messages <code> [<code>...]`. Each code is BCP-47 (`es`, `fr`, `de`, `pt-BR`, `zh-TW`, `ja`, `ar`, etc.).

If the user provides no codes, **stop and ask** which locales they want. Don't guess.

## Plan of action

Follow these steps in order. Steps 1–3 are sequential; step 4 fans out in parallel.

### 1. Sanity-check inputs

- Reject any code that doesn't match `^[a-z]{2}(-[A-Z]{2})?$` — tell the user the valid format and stop.
- Reject `en` (that's the source).
- For each requested code, check whether `control/messages/<code>.json` already exists. If it does, **ask the user** whether to overwrite or skip — don't silently clobber.
- Confirm the code is present in `localeNames` in [control/i18n/config.js](control/i18n/config.js). If a code is missing (e.g. user requests something exotic like `sw`), ask them for the autonym (e.g. "Kiswahili") and add it to `localeNames` before fanning out. If the script is RTL, also add the code to `rtlLocales` in the same file.

### 2. Verify the source

Read [control/messages/en.json](control/messages/en.json) once to confirm it parses. If it doesn't, stop and report — there's a bigger problem than translation.

Run the validator against itself as a sanity check:

```
cd control && node scripts/validate-locale.mjs en en
```

It should print `en.json: ok`. If it doesn't, the validator or the source file is broken — stop and investigate.

### 3. Brief the user

Before fanning out, tell the user: "Translating en.json (~99KB, 1834 strings) into <N> locales in parallel — this will take a few minutes." Don't be silent during a long-running fan-out.

### 4. Fan out — one subagent per locale, all in a single message

Spawn one `Agent` per locale, **all in the same message** so they run in parallel. Use `subagent_type: general-purpose`.

Each subagent prompt is the **Translation Subagent Brief** below, with `<LOCALE_CODE>` and `<LOCALE_NAME>` substituted. The autonym from `localeNames` is what to pass as `<LOCALE_NAME>` (e.g. `es` → "Español"), since that's how the model recognises the target.

### 5. Final validation pass

After every subagent has returned, re-run the validator on each new file from the parent:

```
cd control && node scripts/validate-locale.mjs en <code>
```

This is defence-in-depth — the subagent should already have validated, but the parent confirms before wiring anything in. If any locale fails here, flag it and skip wiring that locale (leave the file in place so the user can inspect).

### 6. Wire into the app

For each locale that passed validation, edit [control/i18n/config.js](control/i18n/config.js) to push the code into the `locales` array. Keep alphabetical order *except* leave `en` first. Example after adding `es`, `fr`, `de`:

```js
export const locales = ['en', 'de', 'es', 'fr'];
```

Don't touch `localeNames` (already pre-populated) unless you added a new code in step 1.

### 7. Report

Summarise in 3–5 lines:
- Which locales succeeded, which failed.
- That the Settings → Language tab now shows the new options.
- That a server restart isn't needed (Next.js dev picks up the config change on hot-reload; production needs a rebuild).

Don't auto-commit. Leave that to the user.

---

## Translation Subagent Brief

Each subagent receives this verbatim, with `<LOCALE_CODE>` and `<LOCALE_NAME>` filled in:

> You are translating a Next.js i18n message catalog from English into **<LOCALE_NAME>** (locale code: `<LOCALE_CODE>`).
>
> ### Inputs
> - Source file: `/Users/fombico/Documents/mojulo-lite/control/messages/en.json` — read it with the Read tool.
> - Output path: `/Users/fombico/Documents/mojulo-lite/control/messages/<LOCALE_CODE>.json` — write it with the Write tool.
>
> ### Hard rules — violating any of these fails validation
>
> 1. **Identical key shape.** The output must have the exact same nested object structure as the source: same keys, same nesting, no additions, no removals, no renames, no reordering.
>
> 2. **Preserve every ICU placeholder unchanged.** Tokens like `{name}`, `{count}`, `{itemLabel}`, `{number}` must appear literally in the translation, with the same name and braces. Don't translate the variable name, don't add or remove placeholders.
>
> 3. **Preserve ICU plural/select syntax.** Strings like `{count, plural, one {file} other {files}}` and `{type, select, knowledge {Knowledge} other {Other}}` keep their structural skeleton (`{count, plural, ...}`, `one`, `other`, `=0`, `=1`, `#`, the commas, the spaces). Translate **only** the words inside the innermost `{ ... }` clauses (`file`, `files`).
>    - If the target language has additional plural forms (Russian: `one`/`few`/`many`/`other`; Arabic: `zero`/`one`/`two`/`few`/`many`/`other`; Polish: `one`/`few`/`many`/`other`), add them in the standard ICU order. Always keep `other`.
>    - Don't translate the keyword names (`plural`, `select`, `selectordinal`, `one`, `few`, `many`, `zero`, `two`).
>
> 4. **Don't translate brand/proper nouns or technical tokens:**
>    - Brands: `Mojulo`, `Mojulo-Lite`, `Mojulo Control Panel`, `Anthropic`, `OpenAI`, `Gemini`, `Cohere`, `Bedrock`, `Docker`, `GHCR`, `Fly.io`, `SQLite`, `Next.js`.
>    - Code-like tokens: file extensions (`.zip`, `.json`, `.env`), env var names (e.g. `MOJULO_API_KEY`, `NEXT_LOCALE`), CLI flag names, URL paths, model IDs.
>
> 5. **Translate UI copy, button labels, error messages, helper text, placeholder text.** This is a developer-facing tool, not a marketing site — match the source's terse, slightly technical register. No fluff.
>
> 6. **Form of address:** prefer the informal/familiar second person where the language has one (Spanish `tú`, German `du`, French `tu`, Portuguese `tu`/`você` per regional norm). Japanese: です/ます polite. Korean: 해요체. Russian: «вы» is fine. Match the source's directness.
>
> 7. **Output is one JSON object**, 2-space indent, UTF-8, no trailing comma, no comments. The first character must be `{` and the last `}`.
>
> 8. **Do not abbreviate, summarise, or skip sections** to save space. Every leaf string in the source must have a corresponding leaf in the output.
>
> ### Process
>
> 1. Read the full source file.
> 2. Translate the entire object in one pass — keep terminology consistent across keys (e.g. once you choose a translation for "deployment", use it everywhere).
> 3. Write the output file.
> 4. Validate: run `cd /Users/fombico/Documents/mojulo-lite/control && node scripts/validate-locale.mjs en <LOCALE_CODE>`. If it prints `<LOCALE_CODE>.json: ok`, return success. If it prints validation errors, fix them and re-write the file, then re-validate. You get up to 2 retries; on the third failure return failure with the error list.
>
> ### Return format
>
> One short line:
> - On success: `<LOCALE_CODE>: ok (path: control/messages/<LOCALE_CODE>.json)`
> - On failure: `<LOCALE_CODE>: failed — <reason>` followed by the validator errors.
>
> Don't dump the translated JSON in your response — the parent doesn't need it; the file on disk is the artifact.

---

## Notes for the orchestrator

- The Settings → Language switcher (in [control/app/settings/page.jsx](control/app/settings/page.jsx)) already reads from `locales` + `localeNames` in `i18n/config.js` and writes a `NEXT_LOCALE` cookie. Updating `locales` is all that's needed for the new options to appear.
- [control/i18n/request.js](control/i18n/request.js) already allowlists against `locales`, so an unknown cookie value falls back to `defaultLocale` automatically — no extra defence needed.
- For RTL locales, [control/app/layout.js](control/app/layout.js) already sets `dir={rtlLocales.has(locale) ? 'rtl' : 'ltr'}` from `i18n/config.js`. The CSS isn't fully RTL-audited, so warn the user that RTL locales (`ar`, `he`, `fa`, `ur`) may need visual review.
- Don't run `next build` from the skill — it's slow, and the user's dev server picks up the changes on save anyway.
- Don't add tests, comments, or refactors beyond what's prescribed here.
