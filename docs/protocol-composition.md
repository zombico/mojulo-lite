# Protocol Composition

The bot's `instructions.txt` — the system prompt the LLM sees on every turn — isn't a single hand-authored file. It's **composed at deploy time** from a fixed set of stackable protocol cartridges, the configured form/calendar/triage data, and a JSON response template that's also assembled from the same toggles. One config object goes in, one prompt comes out.

This doc describes the cartridges, how they're combined, and how the prose protocols and the response format stay in sync.

---

## Why this shape

Three properties drive the design:

1. **Stackable, not switched.** A bot is rarely "just knowledge" or "just forms." A clinic-intake bot might want knowledge + form gathering + appointments; a routing concierge wants knowledge + triage. So the composer takes a `{ knowledge, formGathering, appointments, triage }` toggle map and concatenates the matching cartridges, instead of branching to one of N hardcoded prompt templates. Adding a fifth capability is a new file in [protocols/](../control/lib/composer/protocols/) plus an entry in `PROTOCOL_FILES`, not a refactor of the prompt.
2. **One composer for two builders.** The wizard ([docs/wizard-builder.md](wizard-builder.md)) and the chat builder ([docs/chat-builder.md](chat-builder.md)) take very different paths to a config — structured form vs. Claude tool-use over SSE — but both converge on [composeInstructions()](../control/lib/composer/composer.js). Past that call, nothing downstream branches on which builder produced the input. Same `instructions.txt` shape, same artifact, same runtime.
3. **The response schema is composed alongside the prose.** Every protocol that asks the LLM to *do* something also adds *fields the LLM must return*. Form gathering needs `formTracker`, appointments need `calendarId`, triage needs `deploymentId`. If the prose asks for a field but the response template doesn't list it, the LLM will omit it half the time. So both halves come out of the same toggle map ([response-builder.js](../control/lib/composer/response-builder.js)) and ship as one document — the prose protocols up top, the response JSON template at the bottom.

---

## The cartridges

Five plain-text files in [control/lib/composer/protocols/](../control/lib/composer/protocols/). Filenames are numerically prefixed for deterministic ordering on disk; the composer enforces order independently via `PROTOCOL_ORDER`.

| Order | File | Toggle key | Always on? | Role |
|-------|------|------------|------------|------|
| 0 | `00_base.txt` | — | Yes | Reasoning restriction (RAG-anchored answers) and prompt-injection defenses |
| 1 | `01_knowledge.txt` | `knowledge` | No | Tells the LLM how to consume retrieved RAG chunks; answer formatting |
| 2 | `02_form-gathering.txt` | `formGathering` | No | Progressive form filling: third-person confirmations, `formTracker` state, `consentToTC` ordering |
| 3 | `03_appointments.txt` | `appointments` | No | Match user intent to a calendar destination; emit `calendarId` + `showCalendarLaunchButton` |
| 4 | `04_triage.txt` | `triage` | No | Match user intent to a downstream bot; emit `deploymentId` + `starterPrompt` |
| 5 | `05_optical-read.txt` | `opticalRead` | No | Extract structured fields from an uploaded image; emit `extractedFields` + `showUploadButton` |

`00_base.txt` is special: it's not a capability, it's the safety floor. Every bot gets it, including bots that have *no* capabilities toggled on (which are still legal — they just answer from RAG with no tool-shaped behaviors).

The cartridges are written in a deliberately blunt voice — short lines, ALL CAPS imperatives, no preamble. They're read by an LLM, not a human, and the structure is more about reducing ambiguity than about prose quality.

---

## What the composer does

[composeInstructions()](../control/lib/composer/composer.js) takes:

```js
{
  objective: 'Help patients book a consult',
  enabledProtocols: { knowledge: true, formGathering: true, appointments: true, triage: false },
  protocolData: {
    formStructure: { sections: [...] },     // wizard's generated form JSON
    appointments:  [ { calendarId, ... } ], // calendar destinations
    triage:        [ { deploymentId, name, description } ],
  }
}
```

…and produces a single string assembled in this order:

```
<00_base.txt>

<01_knowledge.txt>             # if knowledge enabled

<02_form-gathering.txt>        # if formGathering enabled
## FORM STRUCTURE - Use these exact field IDs ...
{ stripped formStructure JSON }

<03_appointments.txt>          # if appointments enabled
## AVAILABLE CALENDARS ...
[ appointment destinations JSON ]

<04_triage.txt>                # if triage enabled
## TRIAGE ROUTES ...
[ stripped triage routes JSON ]

<05_optical-read.txt>          # if opticalRead enabled
## EXTRACTION FIELDS ...
[ stripped optical-read fields JSON ]

## USER CUSTOM INSTRUCTIONS

## OBJECTIVE: <user's objective string>

## RESPONSE FORMAT PROTOCOL
RESPOND ONLY IN VALID JSON.
...
{ composed response template }
```

Each section is joined with a blank line. Disabled protocols and their inline-data sections are simply omitted — there is no "this section intentionally left blank" placeholder.

### Inline data injection

Four of the five optional protocols don't just add prose — they also embed runtime config the LLM needs to reference:

- **Form gathering** (`buildFormStructureSection`) ships the form schema *stripped* down to `id`, `label`, `condition`, `required`. Field types, validation rules, UI hints — anything the LLM doesn't need for conversational orchestration — are dropped. The bot's frontend already owns rendering; the LLM only needs to know which IDs exist and which are required.
- **Appointments** (`buildCalendarSection`) ships destinations as-is. The shape is small and there's no field that needs hiding from the model.
- **Triage** (`buildTriageSection`) ships routes stripped to `deploymentId`, `name`, `description`. The `url` field is **deliberately excluded** — it's a client-side redirect handle, and keeping it out of the prompt prevents the LLM from emitting raw URLs in `answer` text. Same stripping discipline as form structure.
- **Optical read** (`buildOpticalReadSection`) ships extraction fields stripped to `idName`, `label`, `hint`. Wizard widget metadata stays out of the prompt — the model only sees the slot names, the human-readable label, and the optional priming hint that disambiguates ambiguous reads.

If a protocol is enabled but its data is missing or malformed (e.g. invalid form JSON), the helper returns an empty string and the inline section is skipped — the prose cartridge still ships, the bot just has no concrete config to reference. This is logged but not fatal; deploys with bad form JSON should be caught at validation time, not here.

---

## The response format, composed in lockstep

[buildResponseFormatSection()](../control/lib/composer/response-builder.js) is called from inside `composeInstructions` with the same `enabledProtocols` map. It builds a JSON template by merging attribute groups:

```
CORE_ATTRIBUTES                    always
  ├─ answer
  └─ suggestions

FORM_GATHERING_ATTRIBUTES          if formGathering
  ├─ formTracker
  ├─ formSuggestions
  ├─ fieldsRemaining
  ├─ isComplete
  └─ suggestions   (overrides core)

APPOINTMENTS_ATTRIBUTES            if appointments
  ├─ showCalendarLaunchButton
  └─ calendarId

TRIAGE_ATTRIBUTES                  if triage
  ├─ triage
  ├─ deploymentId
  ├─ starterPrompt
  └─ suggestions   (overrides)

OPTICAL_READ_ATTRIBUTES            if opticalRead
  ├─ extractedFields
  └─ showUploadButton
```

The output is a JSON-shaped template with **inline descriptions as values** — `"isComplete": "true/false"`, `"suggestions": "[3 MAX]"` — so the LLM sees both the field name and an inline hint about what to put there, without a separate description block to keep in sync.

The `suggestions` collision is intentional: enabling form gathering or triage replaces the core `suggestions` description with one specific to that protocol. Last write wins, in `PROTOCOL_ORDER` sequence — so when both forms and triage are on, triage's wording takes effect.

Knowledge protocol adds **no** response attributes — it shapes how `answer` should be written (paragraph length, RAG anchoring) but doesn't introduce new fields, so the LLM's response shape is identical whether knowledge is on or off.

### Why composed, not handwritten

The alternative — a static "full" response template the LLM is told to "ignore fields you don't need" — works for two protocols and falls apart at four. The LLM either fills in fields it shouldn't (emitting `formTracker` on a triage-only bot) or hallucinates the format when given an unfamiliar combination. Composing only the active fields makes the schema match the bot's actual capabilities, which is also what the [Anthropic adapter's forced tool-use schema](../control/ANTHROPIC_TOOL_USE_PLAN.md) ([response-schema.js](../lite-template/helper/response-schema.js)) needs to mirror — when you add a field to one, you cross-check the other.

---

## Where the output lands

The composed string is written to the artifact at `config/instructions.txt` by [DockerDeployer](../control/lib/deployers/docker.js):

```js
const instructions =
  config._composedInstructions ||
  (await composeInstructions({ objective, enabledProtocols, protocolData }));
await fsp.writeFile(path.join(configDir, 'instructions.txt'), instructions, 'utf8');
```

The `_composedInstructions` short-circuit lets the chat builder pass through pre-composed text (so its preview and its deploy use byte-identical instructions); the wizard takes the live-compose path. Both produce the same shape.

At bot startup ([server.js](../lite-template/server.js)), `instructions.txt` is read once and cached in memory:

```js
cachedInstructions = fs.readFileSync(instructionsPath, "utf-8");
```

…and then passed to [prompt-assembler.js](../lite-template/helper/prompt-assembler.js) on every `/chat` turn, which sandwiches it between the user's history and the RAG block before handing the assembled prompt to the LLM client. The bot never re-reads or re-composes — the file is the contract.

---

## Adding a new protocol

The shape codifies a recipe — a new capability, end to end, is:

1. Write `protocols/XT_<name>.txt`. Imperative voice, blunt, no preamble. Keep the cartridge focused on *behavior*; per-deploy data goes in the inline section, not the prose.
2. Add an entry to `PROTOCOL_FILES` and `PROTOCOL_ORDER` in [composer.js](../control/lib/composer/composer.js).
3. If the protocol needs per-deploy config: write a `build<Name>Section()` that strips the input to fields the LLM needs and returns either a header + JSON section or `''` on missing/invalid input. Mirror the form/calendar/triage discipline — strip aggressively, never leak URLs or secrets into the prompt.
4. If the protocol needs new response fields: add a `<NAME>_ATTRIBUTES` group in [response-builder.js](../control/lib/composer/response-builder.js) and a conditional `Object.assign` in `buildResponseFormatSection`.
5. Cross-check [response-schema.js](../lite-template/helper/response-schema.js) — the Anthropic forced tool-use path enforces structure separately, and a missing field there means the model returns shapes the bot can't parse.
6. Wire the toggle into both builders: a wizard step (or a section of an existing step) and a chat-builder tool. Both write to the same `enabledProtocols.<name>` key and the same `protocolData.<name>` bucket.

What you do **not** need to touch: the deployer, the bot runtime, the prompt assembler, the response parser. Past `composeInstructions`, nothing branches on which protocols are on — the file is the contract, and a new file with a new toggle is enough.

---

## File map

| File | Role |
|------|------|
| [control/lib/composer/composer.js](../control/lib/composer/composer.js) | `composeInstructions` entrypoint; protocol registry (`PROTOCOL_FILES`, `PROTOCOL_ORDER`); inline-section helpers (`buildFormStructureSection`, `buildCalendarSection`, `buildTriageSection`, `buildOpticalReadSection`) |
| [control/lib/composer/response-builder.js](../control/lib/composer/response-builder.js) | `buildResponseFormatSection` + the `*_ATTRIBUTES` groups merged by toggle |
| [control/lib/composer/protocols/00_base.txt](../control/lib/composer/protocols/00_base.txt) | Reasoning restriction + prompt-injection defenses (always included) |
| [control/lib/composer/protocols/01_knowledge.txt](../control/lib/composer/protocols/01_knowledge.txt) | RAG-anchored answers; paragraph formatting |
| [control/lib/composer/protocols/02_form-gathering.txt](../control/lib/composer/protocols/02_form-gathering.txt) | Progressive form filling; `formTracker`; `consentToTC` ordering |
| [control/lib/composer/protocols/03_appointments.txt](../control/lib/composer/protocols/03_appointments.txt) | Calendar destination matching; `showCalendarLaunchButton` |
| [control/lib/composer/protocols/04_triage.txt](../control/lib/composer/protocols/04_triage.txt) | Downstream-bot routing; `deploymentId` + `starterPrompt` |
| [control/lib/composer/protocols/05_optical-read.txt](../control/lib/composer/protocols/05_optical-read.txt) | Image-to-fields extraction; `extractedFields` + `showUploadButton` |
| [control/lib/builder/composer-bridge.js](../control/lib/builder/composer-bridge.js) | Adapts a chat-builder session into the composer's input shape; powers `previewComposition` |
| [control/lib/deployers/docker.js](../control/lib/deployers/docker.js) §step 3 | Calls `composeInstructions` (or uses cached `_composedInstructions`); writes `config/instructions.txt` into the artifact |
| [lite-template/server.js](../lite-template/server.js) §boot | Reads `config/instructions.txt` once at startup into `cachedInstructions` |
| [lite-template/helper/prompt-assembler.js](../lite-template/helper/prompt-assembler.js) | Injects the cached instructions alongside RAG context and conversation history per turn |
| [lite-template/helper/response-schema.js](../lite-template/helper/response-schema.js) | Anthropic forced-tool-use schema — must mirror the response template `response-builder.js` produces |
