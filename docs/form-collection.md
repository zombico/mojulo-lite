# Form Collection (Ghost Forms)

Mojulo-Lite bots can collect structured data from users alongside ordinary chat. The mechanism is called **ghost forms**: the form schema is generated once in the control panel for a chosen locale, baked into the bot deployment, rendered and filled entirely on the client, and submitted to the server in a single dedicated request that bypasses the LLM entirely.

Three properties hold by construction:

1. **Locale-aware fields.** Patterns, labels, and PII hints are picked per-locale at generation time, so a German deployment validates German phone numbers and a Japanese deployment uses Japanese date order.
2. **Static schema, immutable post-deploy.** The form JSON is part of the deployed artifact. The bot startup hashes it into a fingerprint that gets stamped onto every submission, so schema drift is detectable from the database alone.
3. **PII never reaches the LLM.** Field values live in a browser-side registry until the user submits. The chat history records only an opaque marker like `{contact_form_filled}`; the actual values flow through a separate endpoint.

---

## Architecture

```
Control panel (per-deployment, one-shot)        Bot deployment (per-conversation, recurring)
─────────────────────────────────────────       ──────────────────────────────────────────────
  user picks locale (e.g. de-DE)                  GET /context  ───►  formStructure JSON
            │                                              │
            ▼                                              ▼
  buildFormGenerationPrompt(locale)               client renders fields into FormInputRegistry
  + LLM ──► form schema JSON                              │
            │                                              │  (typing stays in browser memory)
            ▼                                              ▼
  config/formFormat.json                          user clicks Submit
  + isForm=true in config.json                            │
            │                                              ▼
            ▼                                     POST /api/submit-form  (formData + metadata)
       ship to bot                                        │
                                                          ▼
                                             form_submissions row + (optional) webhook
                                                          │
                                                          ▼
                                          chat turn carries only `{name_filled}` marker
```

---

## Locale-aware schema generation

Form schemas are produced once, in the control panel, by the LLM-powered form builder. Locale is the load-bearing input: it picks the regex patterns, the field labels, the date/currency formats, and the GDPR hints that get injected into the generation prompt.

Locale config lives in [control/lib/form-schema-config/](../control/lib/form-schema-config/):

| File | Role |
|------|------|
| [index.js](../control/lib/form-schema-config/index.js) | Locale registry (`LOCALES`, `SUPPORTED_LOCALES`), `DEFAULT_LOCALE = 'en-US'`, `buildFormSchemaPrompt(locale)` |
| [base.js](../control/lib/form-schema-config/base.js) | Locale-agnostic primitives: `PII_INDICATORS` (name, email, phone, ssn, dob, creditCard, …), shared archetypes |
| [locales/*.js](../control/lib/form-schema-config/locales/) | 22 locale modules — each exports `LOCALE_INFO`, `PATTERNS`, `ARCHETYPES`, `FIELD_LABELS`, `GDPR_HINTS` |

A locale module looks roughly like this — patterns and labels carry the locale-specific rules:

```js
// locales/en-US.js
export const PATTERNS = {
  phone: { regex: '^(\\+1)?[-.\\s]?\\(?\\d{3}\\)?[-.\\s]?\\d{3}[-.\\s]?\\d{4}$',
           message: 'US phone number' },
  postalCode: { regex: '^\\d{5}(-\\d{4})?$', message: 'US ZIP code' },
  // ...
};
```

`buildFormSchemaPrompt(localeCode)` flattens the chosen locale's `LOCALE_INFO`, `PATTERNS`, `ARCHETYPES`, and field-label dictionary into a prompt fragment. That fragment is concatenated with the base form-builder system prompt and the user's natural-language description ("collect lead info: name, email, phone"), then sent to the configured LLM. The model returns a JSON form schema where:

- Field types (`text`, `email`, `tel`, `radio`, `select`, …) are chosen from the archetype set.
- Each PII-bearing field carries `"pii": true` (driven by `PII_INDICATORS`).
- Validation patterns are taken from the locale, not invented.

The wizard step that drives this is [control/components/wizard/modular/steps/FormGatheringConfig.jsx](../control/components/wizard/modular/steps/FormGatheringConfig.jsx); the API route is [control/app/api/generate-form/route.js](../control/app/api/generate-form/route.js), which validates the locale via `isLocaleSupported(locale)` and falls back to `DEFAULT_LOCALE` if missing or unknown.

---

## How fields get tagged — and what `pii: true` actually does

Every entry in a generated form schema is one of the locale's `ARCHETYPES`, plus optional overrides. The archetypes in [base.js](../control/lib/form-schema-config/base.js) seed the `pii: true` flag on the obvious cases — `email`, `fullName`, `firstName`, `lastName`, `dateOfBirth` — and locale modules layer on region-specific PII (national IDs, postal codes where they're sensitive, etc.). When the schema-generation LLM picks an archetype for a user-described field, it inherits whichever flag the archetype carries.

At runtime, the bot's `generateFormElement` reads `field.pii` once and does exactly one thing with it: writes `input.dataset.pii = 'true'` ([client/index.html:766-767](../lite-template/client/index.html#L766), [client/index.html:808-809](../lite-template/client/index.html#L808)). No other code in the bot or the control plane reads that attribute.

**The flag is a label, not a mechanism.** The thing that makes ghost forms ghosts is structural, not per-field:

- *All* field values — flagged or not — sit in `FormInputRegistry` in browser memory until submit.
- *All* field values travel through `POST /api/submit-form`, never through `/chat`.
- The LLM only ever sees the `{<form_name>_filled}` marker, regardless of which fields the form contained.

So the question "is field X kept out of the LLM's view?" has the same answer for every X: **yes, by construction**. `data-pii="true"` is a hook for operator-side instrumentation — CSS rules that highlight sensitive inputs, analytics filters that drop attributes, screenshot redaction tools, audit reports that count PII fields.

**Shaping it.** Because the flag is labelling, you can adjust it freely without touching runtime behavior:

- Describe a custom field as PII when generating the schema ("collect a tax ID — treat it as PII") and the LLM will tag it.
- Edit `config/formFormat.json` post-generation to add or remove `"pii": true` on any field; rebuild and redeploy.
- Add new PII archetypes in `base.js` or a locale module if you want them picked automatically across future deployments.

The form is ghosted whether you flag two fields or twenty. The flag just says which ones you want your downstream tooling to notice.

---

## What gets shipped to the bot

The deployer writes two things into the bot's config directory:

| File | Contents |
|------|----------|
| `config/config.json` | Sets `config.isForm = true` and `config.formStructure = "config/formFormat.json"` (relative path) |
| `config/formFormat.json` | The locale-stamped JSON schema produced by the builder (sections, fields, patterns, PII flags) |

That's it — no per-locale runtime switching. Each deployed bot is single-locale by construction. To serve a different locale, generate a new form in the control panel and redeploy.

---

## Database schema

The bot owns one form-specific table, [lite-template/server.js:260-275](../lite-template/server.js#L260-L275):

```sql
CREATE TABLE IF NOT EXISTS form_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id   TEXT NOT NULL,
    form_data         TEXT NOT NULL,        -- JSON-serialized field values
    schema_fingerprint TEXT,                -- SHA256(formFormat.json)[0:16]
    is_complete       INTEGER NOT NULL DEFAULT 1,
    submitted_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    webhook_status    TEXT,                 -- 'sent' | 'failed' | 'disabled'
    webhook_error     TEXT,
    metadata          TEXT                  -- JSON: formTitle, completedAt, turn
);
```

`metadata` was added later; an idempotent `ALTER TABLE` probe on startup adds it for older deployments ([server.js:280-285](../lite-template/server.js#L280-L285)).

`schema_fingerprint` is the first 16 hex chars of `SHA256(formFormat.json)`, computed once in `app.listen()` ([server.js:1476-1490](../lite-template/server.js#L1476-L1490)) and stamped onto every row. A schema change shows up in the database as a new fingerprint value, so post-hoc analysis can group submissions by schema version without consulting the deployment record.

Form submissions are **a separate table from `turns`**. They do not share the per-conversation tamper-evident chain that chat turns and handoff events use (see [federated-routing.md](./federated-routing.md)). A submission row is linked to a conversation only by `conversation_id`.

---

## Endpoints

### `GET /context` — exposes form schema to the client

When `config.isForm` is set, the bot reads `config/formFormat.json` from disk and returns it as `formStructure` in the response body alongside the rest of the per-conversation context ([server.js:1299-1319](../lite-template/server.js#L1299-L1319)). The schema is not embedded in the LLM's system prompt — it is only sent to the client renderer.

### `POST /api/submit-form` — captures filled form

```json
{
  "conversationId": "<uuid v4>",
  "formData": { "name": "Ada", "email": "ada@example.com", ... },
  "metadata": { "formTitle": "...", "completedAt": "...", "turn": 4 }
}
```

The handler ([server.js:1429-1465](../lite-template/server.js#L1429-L1465)):

1. Validates `conversationId` and `formData` are present.
2. If `formSendHome` is configured for the deployment, calls `sendFormHome(conversationId, formData, metadata)` against the control plane URL and records `webhook_status` (`'sent' | 'failed'`).
3. Inserts a `form_submissions` row with the raw `formData`, the schema fingerprint, and the webhook status.

The form-data row is the **only** place form values are persisted. The chat-turn row for the same submission contains only the `{<form_name>_filled}` marker as `user_prompt` — the LLM-visible value.

### `POST /chat` — sees only the marker

The marker pattern `/{[a-zA-Z0-9_]+(filled|skipped)}/` is detected in [helper/prompt-assembler.js:9](../lite-template/helper/prompt-assembler.js#L9). When `userPrompt` matches it, RAG retrieval is skipped (the marker is not a meaningful query). The LLM sees the marker verbatim, so it knows the form was completed (or skipped) and can respond accordingly, but it never receives the field values themselves.

---

## Client behavior — the ghost layer

All form data is held in `FormInputRegistry`, defined in [client/index.html:160-374](../lite-template/client/index.html#L160). It is a single Map keyed by `fieldId` whose values are the live DOM input elements. Public methods include `register`, `getValue`, `getAllValues`, `getFilledValues`, `clear`, and `addChangeListener`. The registry is the authoritative store for in-flight form state.

### Rendering

`generateFormElement(fieldId)` ([client/index.html:638-880](../lite-template/client/index.html#L638-L880)) creates the DOM input for one field from the schema entry — input type, validation pattern, label, required flag, and a `data-pii="true"` attribute when `field.pii` is set. Each input registers itself with `FormInputRegistry.register(fieldId, input)` and emits `notifyChange` events on user input, so a single change-listener callback can re-evaluate completeness after every keystroke.

### Submission

When the user clicks the submit control, [client/index.html:932-967](../lite-template/client/index.html#L932-L967) reads `FormInputRegistry.getAllValues()` and posts it to `/api/submit-form` along with the conversation ID and lightweight metadata (form title, completion time, turn number). On success, the client may optionally also POST to a customer-configured webhook via the server-side proxy at `/api/send-webhook` ([client/index.html:969-1020](../lite-template/client/index.html#L969-L1020)) to avoid CORS exposure.

The client then sends a normal chat message whose body is the marker string `{<form_name>_filled}` (or `_skipped`). That message — and only that message — appears in the LLM's view of the conversation.

### Cross-turn form progress

Form *progress state* (which fields are filled, which the bot has already prompted for) lives in the `formTracker` field of `machine_state` on each chat turn ([server.js:411-425](../lite-template/server.js#L411-L425)). On every `/chat` call the server reads the previous turn's `formTracker` from `machine_state` and forwards it to the LLM so the bot doesn't re-ask for the same field. `formTracker` contains tracking metadata only — never field values — so the chat-turn rows stay PII-free.

This is also what survives a federated handoff: see [federated-routing.md](./federated-routing.md) for how `lastFormTracker` lookups walk the same `event_type IS NULL` filtered history.

---

## Scope of the "ghost" guarantee

The ghost in *ghost forms* refers to one specific property: every form value stays in the browser until submit, and only ever reaches the bot through a dedicated endpoint that bypasses the LLM. That holds for *all* fields by construction — the `pii: true` flag is a decorative label for operator-side tooling, not a per-field protection (see [How fields get tagged](#how-fields-get-tagged--and-what-pii-true-actually-does) above). Reading the rest of the trust model in those terms:

- **No client-side encryption.** Values move plaintext over HTTPS to `/api/submit-form` and sit plaintext in `form_submissions.form_data` — exactly where the bot operator already controls the database. Encryption-at-rest, if you want it, is an operator concern (disk-level, SQLite extension) layered underneath.
- **Submissions are atomic.** A row exists only when the user clicks submit (`is_complete = 1`); abandoned forms leave nothing behind. If you want autosave-style retention, a separate `formTracker` mirror table is the natural extension point.
- **The hash chain covers conversations, not submissions.** Form rows live in their own table so the chain stays uniform — every chat turn and handoff event hashes the same way. `/verify/:conversationId` attests to the conversation; submissions are audited against their own webhook + `webhook_status` trail.
- **Schema is loaded at startup.** Edit `formFormat.json` and restart the container — fingerprints stay consistent for the lifetime of a run, which is what makes a fingerprint meaningful in the first place.

---

## Trust model

- The control plane is trusted to produce a correct locale-stamped schema and ship it to the bot.
- The bot is trusted to store submissions and forward them to webhooks. Submission data is durable on the bot's local SQLite by default.
- The LLM is **not** trusted with PII: by construction, it sees only markers and `formTracker` metadata.
- The browser holds raw values for the duration of the form session; the user is the only party with a record of those values until they click submit.

If a deployment needs cryptographic continuity for submissions (analogous to the chain coverage chat turns get), that would be a separate addition — `form_submissions` would need its own chain or would need to be promoted into a chained event row in `turns`.

---

## File map

| File | Role |
|------|------|
| [control/lib/form-schema-config/index.js](../control/lib/form-schema-config/index.js) | `LOCALES` registry, `buildFormSchemaPrompt`, `isLocaleSupported`, `DEFAULT_LOCALE` |
| [control/lib/form-schema-config/base.js](../control/lib/form-schema-config/base.js) | `PII_INDICATORS`, shared archetypes |
| [control/lib/form-schema-config/locales/](../control/lib/form-schema-config/locales/) | Per-locale `PATTERNS`, `FIELD_LABELS`, `ARCHETYPES`, `GDPR_HINTS` (22 locales) |
| [control/components/wizard/modular/steps/FormGatheringConfig.jsx](../control/components/wizard/modular/steps/FormGatheringConfig.jsx) | Locale picker + natural-language input + Generate action |
| [control/app/api/generate-form/route.js](../control/app/api/generate-form/route.js) | Validates locale, calls `buildFormGenerationPrompt`, dispatches to LLM |
| [lite-template/server.js](../lite-template/server.js) §schema | `form_submissions` CREATE + idempotent `metadata` ADD COLUMN |
| [lite-template/server.js](../lite-template/server.js) §`app.listen` | Computes `formSchemaFingerprint = SHA256(formFormat.json)[0:16]` |
| [lite-template/server.js](../lite-template/server.js) §`GET /context` | Reads `formFormat.json` from disk, returns as `formStructure` |
| [lite-template/server.js](../lite-template/server.js) §`POST /api/submit-form` | Persists row, optional webhook relay |
| [lite-template/helper/form-submission.js](../lite-template/helper/form-submission.js) | `sendFormHome` — control-plane webhook with bearer auth |
| [lite-template/helper/prompt-assembler.js](../lite-template/helper/prompt-assembler.js) | `FORM_SUBMISSION_MARKER` regex; skips RAG on marker turns |
| [lite-template/client/index.html](../lite-template/client/index.html) §`FormInputRegistry` | Browser-side Map of `fieldId → DOM input`; sole holder of in-flight values |
| [lite-template/client/index.html](../lite-template/client/index.html) §`generateFormElement` | Renders fields from schema; sets `data-pii` on PII inputs |
| [lite-template/client/index.html](../lite-template/client/index.html) §`sendFormToControlPlane` | POSTs `getAllValues()` to `/api/submit-form` |
