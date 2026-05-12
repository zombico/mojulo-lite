# Optical Read

A mojulo-lite protocol that pulls structured data out of an uploaded image using a vision-capable LLM. The user uploads, the model reads, the chain locks. The user reviews — and optionally edits — then submits.

This is a deliberately different stance from ghost forms (which never let PII near the model). Optical Read is built on the user *intentionally* sharing a visual artifact for read-out.

---

## Why this shape

Three properties drive the design:

1. **The model already knows what templated artifacts look like.** Magic: The Gathering cards, driver's licenses, prescription labels, business cards, receipts — the model has seen them. The bot builder doesn't write a coordinate map or train a per-template extractor; the builder just *names the slots* they want pulled, and the model resolves them against its own visual prior.
2. **The hint is the load-bearing tuning primitive.** Each extraction field carries an optional `hint` that primes location ("bottom-right of card frame") or format ("MM/DD/YYYY"). When the model resolves an idName ambiguously, the hint is what disambiguates. Empty `hint` is fine; a *good* hint is what turns a 70% extraction into a 95% extraction.
3. **Two turns, not one.** Extraction is Turn 1 in the conversation chain; Send is Turn 2. The diff between the model's read and the user's submitted values *is* the audit trail — there's no parallel `extractedFieldsRaw` snapshot to keep in sync, because Turn 1 is the snapshot.

The cartridge is named `05_optical-read.txt` for [protocol composition](protocol-composition.md) ordering; the toggle key is `opticalRead`.

---

## What the user configures

Each extraction field has three shape:

```js
{
  idName: 'dob',                              // snake_case key in extractedFields
  label: 'Date of Birth',                     // display label
  hint: 'MM/DD/YYYY, front of license'        // optional priming
}
```

The wizard validates that `idName` matches `^[a-z][a-z0-9_]*$` and that the list has no duplicates. The chat builder's `generate_optical_read_config` tool slugifies missing `idName`s from `label` and dedupes on collision.

Field structure stripped to `{ idName, label, hint }` before it ships into the cartridge — same discipline as form-structure stripping in [composer.js](../control/lib/composer/composer.js). No leakage of widget-side metadata into the prompt.

---

## How the runtime works

Three new pieces inside the bot:

1. **Boot loader** ([server.js](../lite-template/server.js)) reads `config/opticalReadFields.json` once at startup and caches it. Mirrors the `formFormat.json` pattern. Missing file = protocol silently disabled.
2. **Vision adapter** ([llm-client.js](../lite-template/helper/llm-client.js)) — the Anthropic adapter accepts an optional `image` parameter and prepends a base64 `image` block to the user message. Other adapters reject it loudly. Wizard gating prevents the rejection in normal flows.
3. **Extraction endpoint** (`POST /api/extract`) — accepts `{ conversationId?, fileName, mime, base64 }`, validates mime ∈ {png, jpeg, webp} and bytes ≤ 5MB, then:
   - composes a deterministic user prompt around the field list,
   - calls `llmClient.generate(...)` with the cached instructions, conversation history, and the image,
   - parses `extractedFields` out of the response, narrowing to the configured idNames (defense in depth against hallucinated keys),
   - hashes the turn — `content_hash` includes a sentinel of the form `[optical_read image: <sha256(imageBytes)>]`, so the chain is tamper-evident over the source artifact,
   - inserts a chained `turns` row.

The endpoint is rate-limited (30 / 15 min) and capped at 7MB JSON body (≈5MB image post base64 inflation).

---

## Two turns, one chain

Turn 1 (extraction) and Turn 2 (submission) are both chain entries:

```
Turn N-1     [chat]        prev_chain
Turn N       [extract]     prev_chain ← image_hash, model_response
Turn N+1     [submit-form] prev_chain ← user-attested values
```

Turn 1's row stores the model's full prose response in `llm_response` and the structured envelope in `machine_state` (with `source: 'optical_read'`, the image hash, mime, byte length, and the original filename). The user's prompt in `user_prompt` is the sentinel `[optical_read image: <hash>]`; the natural-language prompt the model saw is in `full_prompt`.

Turn 2 is just a regular form submission posted to `POST /api/submit-form` with `metadata.source: 'optical_read'`. Reusing the existing endpoint means the SendHome webhook shape doesn't change. Downstream consumers can branch on `metadata.source` if they care.

If the user uploads (Turn 1) and closes the tab without submitting, Turn 1 stands as a record. The lack of a Turn 2 is itself meaningful — the audit-trail signal isn't lost.

---

## Frontend

`createUploadCard()` in [index.html](../lite-template/client/index.html) renders a suggestion-card-styled button that opens a file picker. Click handler:

1. Validate mime + size client-side.
2. If oversized, downscale to ~3.5MP through `<canvas>` (re-encoded as JPEG q=0.9).
3. Read as base64.
4. POST `/api/extract`.
5. Render `data.answer` as an assistant message, then a read-only field panel underneath.

The panel ships an Edit button (unlocks inputs for in-place correction) and a Send button (POSTs to `/api/submit-form` with `metadata.source: 'optical_read'`).

The card is shown when both `botContext.isOpticalRead` and `data.response.showUploadButton === 'true'`. The cartridge instructs the model to set the flag on first turn and any turn where a new upload is welcome — implicit re-extract is "user uploads again," producing a fresh Turn 1.

---

## V1 scope and gating

- **Single image, single LLM call.** Multi-image deferred.
- **Anthropic-only at launch.** Wizard's protocol card is disabled for non-Anthropic providers with the message *"Optical Read requires a vision-capable provider. Anthropic supported in v1; OpenAI coming soon."* The runtime adapter for non-Anthropic providers throws on image input as defense in depth (post-deploy provider swap or hand-edited config can't silently drop the image).
- **5MB image cap, PNG/JPEG/WebP only.**
- **Field config shape:** `{ idName, label, hint }`. No regex/coercion in v1 — the model returns strings, the user edits if needed.
- **No re-extract loop.** Re-upload is the way; it produces a new Turn 1 in the same conversation.

---

## File map

| File | Role |
|------|------|
| [control/lib/composer/protocols/05_optical-read.txt](../control/lib/composer/protocols/05_optical-read.txt) | Behavioral cartridge — directional principle + required output shape |
| [control/lib/composer/composer.js](../control/lib/composer/composer.js) | `buildOpticalReadSection()` — strips and ships the field list into the prompt |
| [control/lib/composer/response-builder.js](../control/lib/composer/response-builder.js) | `OPTICAL_READ_ATTRIBUTES` — adds `extractedFields` + `showUploadButton` to the response template |
| [control/components/wizard/modular/steps/OpticalReadConfig.jsx](../control/components/wizard/modular/steps/OpticalReadConfig.jsx) | Wizard step — row + add-button pattern; validates idName uniqueness and snake_case |
| [control/lib/builder/tools.js](../control/lib/builder/tools.js) | `generate_optical_read_config` — chat-builder tool definition |
| [control/lib/builder/tool-executors.js](../control/lib/builder/tool-executors.js) | Slugify, dedupe, persist on session |
| [control/lib/config-builder.js](../control/lib/config-builder.js) | `buildDeploymentConfig()` — emits `isOpticalRead` + `opticalReadFields` path |
| [control/lib/deployers/docker.js](../control/lib/deployers/docker.js) | Writes `config/opticalReadFields.json` into the artifact |
| [lite-template/server.js](../lite-template/server.js) | Boot loader + `POST /api/extract` |
| [lite-template/helper/llm-client.js](../lite-template/helper/llm-client.js) | Anthropic adapter accepts optional `image` block |
| [lite-template/client/index.html](../lite-template/client/index.html) | `createUploadCard()` + `renderExtractedFields()` |
