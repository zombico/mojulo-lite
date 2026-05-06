# Wizard Builder

Mojulo-Lite ships two builders that produce the same artifact: the **chat builder** (a Claude conversation that mutates config via tool calls) and the **wizard** — a structured, multi-step form. This doc describes the wizard: how its steps are generated from protocol toggles, how state moves between them, how the live preview works, and how its output converges with the chat builder's at the same `buildDeploymentConfig()` call.

The chat builder's internals are out of scope here. What matters for this doc: both builders write to the same deployment config shape, save through the same `/api/deployments` endpoint, and produce the same downstream zip via the same [DockerDeployer](../control/lib/deployers/docker.js).

---

## Why this shape

Three properties drive the design:

1. **The step list is generated from protocol toggles, not hardcoded.** A bot with only knowledge retrieval has four steps; a bot with knowledge + forms + appointments + triage has eight. The wizard never asks for input that doesn't apply to the bot the user is building. Step generation lives in [generateStepConfigs](../control/components/wizard/modular/config/ModularBotCreationSteps.jsx#L107) and is recomputed on every toggle change, so the stepper, validators, and navigation always agree on the active step set.
2. **The right-hand panel runs the bot's actual client, not a mockup.** The Theatre iframe is fed wizard state through the preview-shim ([docs/bot-frontend.md](bot-frontend.md)) — the same `index.html`, `marked` rendering, ghost-form pipeline, triage cards. Tweaks reflect immediately, no rebuild between iterations. What you preview is structurally what you ship.
3. **The wizard's output is byte-equivalent to a chat-builder output of the same intent.** Both paradigms call into [buildDeploymentConfig](../control/lib/config-builder.js#L159) with a normalized form-data shape. The deploy API tags wizard saves with `_modular.paradigm = 'modular'` so they can be round-tripped back into wizard state via [parseModularDeploymentConfig](../control/lib/config-builder.js#L333) for edit/clone — but the runtime artifact doesn't branch on paradigm. A bot is a bot.

---

## Step structure

Three fixed steps frame the wizard, four protocol steps appear conditionally, and Deploy always closes:

```
  ┌──────────────────────────── always ──────────────────────────┐
  │                                                              │
  ▼                                                              ▼
┌─────┐  ┌──────────┐  ┌──────────┐                              ┌────────┐
│Core │→ │Protocols │→ │Identity  │→  [protocol steps]  ──────►  │Deploy  │
└─────┘  └──────────┘  └──────────┘                              └────────┘
  LLM       toggle         bot       Knowledge  Forms  Appts  Triage   save
  +key    capabilities   persona      (if on)  (if on) (if on) (if on) +build
```

Step IDs and their roles ([source](../control/components/wizard/modular/config/ModularBotCreationSteps.jsx#L10)):

| Step             | Always? | Collects                                                                  |
|------------------|---------|---------------------------------------------------------------------------|
| `core`           | Yes     | LLM provider, model, API key, bot name, objective, summary                |
| `protocols`      | Yes     | Toggles for `knowledge`, `formGathering`, `appointments`, `triage`        |
| `identity`       | Yes     | First message, chat display name, input placeholder, suggested prompts    |
| `knowledge`      | If on   | Document uploads + the embedding run that produces the vector index       |
| `form-gathering` | If on   | Locale, natural-language form description, generated form JSON, webhooks  |
| `appointments`   | If on   | Calendar destinations (Calendly URLs + provider tags)                     |
| `triage`         | If on   | Routing destinations: target deployment IDs, names, descriptions, URLs    |
| `deploy`         | Yes     | Confirms config, kicks off save + build, surfaces the download link       |

Step numbering is recomputed when protocols change so the stepper always shows a contiguous 1..N sequence — no gaps when a protocol is turned off.

---

## State management

All wizard state lives in one React context, [ModularWizardContext](../control/components/wizard/modular/ModularWizardContext.jsx), wrapping the whole wizard tree. State is kept in memory only — there is no draft autosave, no resume-where-you-left-off. Closing the tab discards an in-progress build. The expectation is that completing the wizard takes a few minutes; persistence kicks in once the user reaches Deploy and clicks Save.

The state shape is normalized into four buckets:

```js
{
  enabledProtocols: { knowledge, formGathering, appointments, triage },
  core:             { provider, model, apiKey, botName, objective, botSummary },
  identity:         { firstMessage, chatDisplayName, placeholder, suggestedPrompts },
  protocolData: {
    knowledge:      { skipRag, documents, embeddings },
    formGathering:  { formLocale, generatedFormJson, formCompletionWebhook, ... },
    appointments:   { destinations },
    triage:         { routes },
  }
}
```

A flat `formData` view is computed via `useMemo` for legacy step components that predate the bucketed shape — they read flat keys, the context maps writes back into the right bucket. Both APIs coexist on the same context.

### Per-step validation

Each step has a validator. They run on Next click, on stepper jump-forward, and (for protocol-specific data) before save. Validators are split:

- `core`, `protocols`, `identity` validate inline in [validateStep](../control/components/wizard/modular/ModularWizardContext.jsx#L353) — required fields, length caps, provider-specific credential shape (Bedrock takes a JSON blob, others take a plain key).
- `knowledge`, `formGathering`, `appointments`, `triage` validate via the [PROTOCOL_VALIDATORS](../control/components/wizard/modular/ModularWizardContext.jsx#L21) registry — each returns `{ valid, error }`. The knowledge validator gates on `embeddings.storageKey` being populated, not just on documents being uploaded — embedding has to actually have run.

Stepper navigation is one-way-forward by default: a step is accessible only if it's `<= currentStep + 1`, so the user can't skip ahead past unfilled required fields. Edit mode (when a `?from=<deploymentId>` query param is present) marks all steps accessible — operators editing an existing bot can jump anywhere.

### Edit and clone

The route at [control/app/bot-factory/modular/page.jsx](../control/app/bot-factory/modular/page.jsx) reads `?from=<deploymentId>&clone=true|false` from the URL. When `from` is set, the wizard fetches `/api/deployments/:id`, runs the stored config through [parseModularDeploymentConfig](../control/lib/config-builder.js#L333), and hydrates the context via `hydrateFromConfig`. The parser is the inverse of `buildDeploymentConfig`: it walks the LLM section to recover provider/model/credentials, infers `enabledProtocols` from `_modular.enabledProtocols` (with a legacy fallback that derives them from the config shape), and reattaches uploaded documents fetched separately by ID. Edit mode and clone mode share the hydration path; the only difference is whether save writes back to the same row (PATCH) or creates a new one (POST).

---

## Live preview (the Theatre)

The right-hand panel — called the Theatre — takes 61.8% of the viewport width (golden-ratio split with the form). For most steps, it renders a step-specific preview component from [stepsPreview/](../control/components/wizard/modular/stepsPreview/). For the Deploy step, it renders [PreviewBot](../control/components/wizard/modular/stepsPreview/PreviewBot.jsx), which mounts the bot's real `index.html` in an iframe and feeds it wizard state via the preview-shim machinery described in [bot-frontend.md](bot-frontend.md):

- The shim monkey-patches `fetch` so `/context`, `/chat`, and friends hit control-plane preview endpoints instead of the bot's network.
- Wizard state is stashed into `window.__INITIAL_CONFIG__` so the bot client picks it up via the same fallback path it uses in production.

The same client code path runs in three surfaces (standalone, embedded widget, preview iframe) — the wizard's preview is the third surface. A bot rendered in the Theatre during step 7 is structurally the bot the user will download in step 8.

Some steps also expose tabs in the Theatre (Documents/Embeddings on the knowledge step; Fields/Flow/JSON on the form-gathering step). Tab state lives in the wizard component, not the context, since it's transient view state.

---

## Deploy: save then build

Deploy is intentionally **two phases**, not one:

```
[Save & Build] click
       │
       ▼
  ensureEmbeddings()  ──► POST /api/vectorize-rag
       │                    (only if knowledge or triage is enabled and the
       │                     existing embeddings don't cover the current chunk set)
       ▼
1. POST or PATCH /api/deployments
       │  body = { botName, config, documentIds, paradigm: 'modular',
       │           enabledProtocols, embeddings, ... }
       │  → returns { deploymentId, buildUrl, status: 'saved' }
       ▼
2. POST {buildUrl}  → produces the artifact zip
       │  → returns { downloadUrl, status: 'ready' }
       ▼
   phase = 'done'
```

The split is deliberate — *save first, build second*. If the build step fails, the deployment row stays at `status=saved` and a Retry Build button appears; the user keeps every field they just filled in. Config is the durable artifact, the zip is a derivative.

Embedding is also lazy. The wizard only re-runs `/api/vectorize-rag` if the user has triage routes (which the wizard doesn't embed inline) or if the knowledge step's embeddings aren't already cached. Embeddings produced earlier in the wizard (when the user clicked Generate on the Knowledge step's Embeddings tab) are reused. See [vector-rag.md](vector-rag.md) for what `/api/vectorize-rag` actually produces.

---

## Convergence with the chat builder

[buildDeploymentConfig](../control/lib/config-builder.js#L159) is the wizard's output funnel and the chat builder's output funnel. The chat builder reaches it via [lib/builder/executor.js](../control/lib/builder/executor.js#L171); the wizard reaches it via [Deploy.jsx](../control/components/wizard/modular/steps/Deploy.jsx#L119).

Both call the function with `flowType: 'modular'` and an `enabledProtocols` map. The function:

- Validates required fields (`botName`, `objective`, `provider`, `apiKey`, `model`).
- Builds the `config` section (UI strings, capability flags like `isForm`, `isCalendar`, `isTriage`, paths to per-bot JSON files).
- Builds the `llm` section (provider-shaped block).
- Folds in deployer-only fields (`objective`, `formStructure`, `triageRoutes`, `appointmentDestinations`) that won't end up in `config.json` but will be projected into separate files (`formFormat.json`, `triageRoutes.json`, etc.) by the [DockerDeployer](../control/lib/deployers/docker.js).

The output is the same shape regardless of which builder produced it. The only marker that distinguishes them downstream is `_modular.paradigm = 'modular'`, persisted onto the saved config row by the deployments API and read back by `parseModularDeploymentConfig` so the wizard knows whether it can hydrate a given deployment for editing. The runtime artifact and the bot it produces are paradigm-agnostic.

---

## File map

| File | Role |
|------|------|
| [control/app/bot-factory/modular/page.jsx](../control/app/bot-factory/modular/page.jsx) | Route entry; wraps the wizard in `ModularWizardProvider` |
| [control/components/wizard/modular/ModularBotCreationWizard.jsx](../control/components/wizard/modular/ModularBotCreationWizard.jsx) | Wizard shell: stepper, two-panel layout, step + theatre dispatch |
| [control/components/wizard/modular/ModularWizardContext.jsx](../control/components/wizard/modular/ModularWizardContext.jsx) | All wizard state, validators, navigation, hydration |
| [control/components/wizard/modular/config/ModularBotCreationSteps.jsx](../control/components/wizard/modular/config/ModularBotCreationSteps.jsx) | Step metadata + `generateStepConfigs` (turns toggle state into a step list) |
| [control/components/wizard/modular/steps/](../control/components/wizard/modular/steps/) | One component per step (Core, Protocols, Identity, Knowledge, FormGathering, Appointments, Triage, Deploy) |
| [control/components/wizard/modular/stepsPreview/](../control/components/wizard/modular/stepsPreview/) | Theatre's per-step preview components, including `PreviewBot.jsx` |
| [control/components/wizard/modular/workflows/](../control/components/wizard/modular/workflows/) | Add/Edit modal flows for triage destinations and appointment calendars |
| [control/lib/config-builder.js](../control/lib/config-builder.js) | Shared `buildDeploymentConfig` / `parseModularDeploymentConfig` round-trip |

---

## See also

- [docs/bot-frontend.md](bot-frontend.md) — the bot client the Theatre's preview iframe runs
- [docs/vector-rag.md](vector-rag.md) — what the Knowledge step's embedding run actually produces
- [docs/form-collection.md](form-collection.md) — what the Form Gathering step's locale-aware schema generation feeds into
- [docs/federated-routing.md](federated-routing.md) — what the Triage step's routes become at runtime
