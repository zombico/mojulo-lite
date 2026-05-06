# Bot Frontend (Client + Widget + Embed)

The Mojulo-Lite bot serves its own UI from the same Express container that runs the chat backend. The same HTML+JS file runs in three different surfaces — a full-page browser tab, an embedded iframe on someone else's site, and a control-plane preview iframe — without any conditional rendering or build step.

This doc describes how those three surfaces work and what holds them together.

---

## Why this shape

Three properties drive the design:

1. **No build step.** The bot's UI is one `index.html` and one `style.css`, served directly. Markdown rendering uses `marked` + `DOMPurify` from a CDN; everything else is vanilla JS embedded in the page. Anyone who can run `docker compose up` can also fork the UI with a text editor — no `npm run build`, no bundler, no JSX.
2. **One client, three surfaces.** The same DOM and the same script handle the standalone page, the embeddable widget, and the control-plane preview. Surface-specific behavior (close button, postMessage to parent, mocked fetch) is layered on the outside via window-globals or a top-of-`<head>` shim — the core client code path doesn't branch.
3. **The widget script is what gets embedded — not the iframe.** The host page only writes `<script src="https://your-bot/widget">`. The script injects both the launcher button and the iframe, owns its own lifecycle, and exposes a single `window.__mojuloBotCleanup()` hook for SPA hosts to call on route change. The host never has to think about iframe sizing, z-index, or message handling.

---

## The three surfaces

```
                          ┌───────────────────────┐
                          │  GET /  (lite bot)    │
                          │  → injects config and │
                          │    serves index.html  │
                          └──────────┬────────────┘
                                     │
        ┌────────────────────────────┼────────────────────────────┐
        ▼                            ▼                            ▼
┌──────────────────┐   ┌──────────────────────────┐   ┌────────────────────────┐
│ Standalone page  │   │ Embedded iframe          │   │ Preview iframe         │
│ (browser tab     │   │ injected by /widget      │   │ injected by control    │
│  pointed at the  │   │ on a host site:          │   │ plane during wizard:   │
│  bot's URL)      │   │   <script src=".../widget">│   │   /api/preview/bot     │
│                  │   │                          │   │   adds preview-shim.js │
│ window.parent    │   │ window.parent !== self   │   │   to <head>            │
│   === self       │   │ → posts mojulo-bot-*     │   │ window.parent !== self │
│                  │   │   messages on close /    │   │ → fetch is monkey-     │
│ window.closeWidget│  │   open / toggle          │   │   patched to hit       │
│   becomes a no-op│   │                          │   │   control-plane preview│
└──────────────────┘   └──────────────────────────┘   └────────────────────────┘
```

The same `index.html` runs in all three. What differs:

- **Standalone:** `window.parent === window`, so the calls to `window.parent.postMessage(...)` short-circuit. The "close widget" button is harmless because the page itself can't be closed by a postMessage.
- **Embedded iframe:** The `/widget` script is the wrapper — it owns the launcher button and the iframe. The client inside the iframe talks to its own origin (the bot's domain) for `/chat` and friends; it talks to the parent page only via postMessage for widget controls and Calendly handoffs.
- **Preview iframe:** The control plane injects [preview-shim.js](../lite-template/client/preview-shim.js) at the very top of `<head>` before the rest of the page loads. The shim monkey-patches `window.fetch` so the bot's network calls get rerouted to control-plane preview endpoints, and it stashes wizard-supplied config into `window.__INITIAL_CONFIG__` so the client picks it up via the same fallback path it would use for the deployed bot.

---

## The client (`client/index.html`)

A single 2000-line HTML file — most of it is the vanilla-JS application embedded in `<script>` at the bottom. Loaded into all three surfaces.

### Bootstrap

[server.js](../lite-template/server.js) `GET /` reads the file, replaces the title tag, and injects a `<script>window.__INITIAL_CONFIG__ = {...}</script>` block before the closing `</head>`. The injected config carries:

- Bot identity (name, display name, first message).
- Form structure (when forms enabled).
- Calendar config (when calendar enabled).
- Triage routes (when triage enabled).

The client's `getContext()` reads `window.__INITIAL_CONFIG__` first and falls back to `GET /context` if the global is empty. The fallback is what the **preview shim** exploits — it monkey-patches `fetch` for `/context` and resolves it from a postMessage payload, so the same getContext() code reaches different config sources without branching.

### Bot-message components

When `/chat` returns, the client renders the LLM's `answer` markdown into the message bubble (sanitized, then word-by-word streamed via `streamHtmlContent`). After streaming finishes, an `onComplete` callback decides what extra elements to attach to the bubble:

- **Triage card** ([federated-routing.md](federated-routing.md) covers the chain-hash plumbing) — rendered when `data.response.triage` and `starterPrompt` are set. The card's URL carries `prompt`, `source`, `conversationId`, and `chainHash` query params; the click handler fires `navigator.sendBeacon` to `/handoff` before navigation.
- **Calendar card** — rendered when `botContext.isCalendar` is on and the LLM emits `showCalendarLaunchButton: "true"`. Click triggers a Calendly popup. In an iframe, it posts `mojulo-bot-open-calendly` to the parent (the widget script handles the actual Calendly load); on the standalone page, the client lazily loads `https://assets.calendly.com/...` and pops the widget itself.
- **Suggestions** (`displaySuggestionsInChat`) — chip buttons under the message that prefill `userInput` when clicked.
- **Form fields** (`processFormSuggestions`) — the LLM emits `formSuggestions: ['fieldId', 'fieldId2']` and the client renders those fields below the input area.

### Form-by-conversation pattern

The "ghost form" mode — the bot collects structured data through the chat flow, surfacing form fields only when the LLM decides to ask for them — runs on a small registry plus a few rendering primitives.

- **`FormInputRegistry`** — central `Map<fieldId, inputElement>` plus change listeners. Holds the live values across re-renders. Exposed on `window.FormInputRegistry` for debugging from the browser console.
- **`processFormSuggestions(formSuggestions)`** — receives a list of field IDs from the LLM. Skips any field already in the registry (so the LLM saying "ask for name + email" twice doesn't duplicate inputs) and appends new fields to the form area.
- **`handleFormSubmit()`** — runs HTML5 + registry validation, collects values via `FormInputRegistry.getAllValues()`, then **clones the form container into the messages list** as a `.form-message` bubble. The clone gets re-wired to the registry so its inputs stay reactive even after the live form section advances. Each submission becomes a visually-pinned snapshot in the conversation flow.
- **`handleFormComplete()`** — fired when the LLM marks `isComplete: true`. Posts collected values to `POST /api/submit-form` (which captures locally + relays to the control plane if a webhook is configured).

The instructions cartridge tells the LLM how to drive this — the client just renders what it's told.

### Streamed rendering

`streamHtmlContent(container, html, scrollTarget, onComplete)`:

1. Parses sanitized HTML into a temp div.
2. Walks all text nodes, replaces each with a `<span data-stream-id="N">` (initially empty).
3. Inserts the full marked-up structure into the container all at once.
4. Iterates word-by-word at 25 ms per word, appending to the right span by index.
5. On finish, unwraps the spans (replaces with raw text nodes) and calls `onComplete`.

This preserves the markdown structure (lists, code blocks, links) during streaming — the DOM tree is final from the first frame, only the visible text grows.

### Iframe-side widget controls

When the client runs inside an iframe, three globals expose widget control to in-page code (e.g., a triage card's click handler asking the parent to close the widget):

```js
window.closeWidget()   // postMessage 'mojulo-bot-close' to parent
window.openWidget()    // postMessage 'mojulo-bot-open'  to parent
window.toggleWidget()  // postMessage 'mojulo-bot-toggle' to parent
```

All three short-circuit when `window.parent === window` (standalone page), so calling them is always safe.

The client also listens for `mojulo-bot-focus-input` from the parent and calls `userInput.focus()` — the widget script sends this 100 ms after opening so the iframe has time to mount before the focus call lands.

---

## The widget (`/widget`)

The bot serves an embeddable JS snippet at `GET /widget` ([server.js](../lite-template/server.js#L1241-L1253)). The response is generated by [helper/widget-generator.js](../lite-template/helper/widget-generator.js) — a string-template factory that bakes the bot's base URL and display name into a vanilla IIFE.

### What `/widget` returns

`Content-Type: application/javascript`, `Cache-Control: public, max-age=300`. The body is an IIFE that, when executed, does five things:

1. **Idempotency check.** If `document.getElementById('mojulo-bot-widget')` already exists, returns immediately. Two `<script src="/widget">` tags on the same page won't double-inject.
2. **Creates the launcher button** — a circular floating div with the chat icon, fixed-position, z-index 9999. Hardcoded styling (color `#3b3e5a`, 60px round, position `bottom-right`).
3. **Creates the iframe container** — fixed-position above the launcher (z-index 9998), `src` pointing at the bot's `/`. Hidden until first launcher click.
4. **Wires up open/close/toggle/resize** — launcher click toggles the container, a small minimize button overlay does the same, window resize triggers `updateWidgetSize` (mobile-responsive: full-screen below 600 px viewport, capped 720×600 above).
5. **Registers a `message` listener** on the host window for the postMessage contract (next section).

### Cleanup hook

The IIFE exposes one global:

```js
window.__mojuloBotCleanup()
```

Calling it removes the `resize` and `message` listeners, removes the launcher and iframe container from the DOM, and deletes itself. SPAs (Next.js, React Router, etc.) call this on route change to avoid stacking widgets.

### postMessage contract

Both directions, validated by origin against the bot's `baseUrl` and the host's own origin:

| Message type                  | Direction          | Effect                                                                 |
|-------------------------------|--------------------|------------------------------------------------------------------------|
| `mojulo-bot-close`            | iframe → parent    | Hides container, shows launcher                                        |
| `mojulo-bot-open`             | iframe → parent    | Shows container, hides launcher, sends focus message to iframe         |
| `mojulo-bot-toggle`           | iframe → parent    | Toggles, with same focus-on-open behavior                              |
| `mojulo-bot-focus-input`      | parent → iframe    | Iframe focuses the `userInput` element                                 |
| `mojulo-bot-open-calendly`    | iframe → parent    | (Calendly bots only) Parent lazy-loads Calendly assets and pops widget |

The widget script enforces origin: `event.origin === window.location.origin || event.origin === baseUrl`. Other-origin messages are logged and dropped:

```js
console.warn('Blocked postMessage from unauthorized origin:', event.origin);
```

The iframe-side sender (`window.closeWidget()` etc.) currently uses `'*'` as the targetOrigin for cross-origin compatibility — the receiver-side check is the authoritative gate.

### Calendly lazy loading

When the bot is configured with `isCalendar = true`, the widget script *also* embeds a small Calendly loader. The first `mojulo-bot-open-calendly` message triggers:

1. Append `<link rel="stylesheet" href="https://assets.calendly.com/.../widget.css">` to the host's `<head>`.
2. Append `<script src="https://assets.calendly.com/.../widget.js">`.
3. On script load, call `Calendly.initPopupWidget({ url, prefill })` with the message's payload.

Subsequent calls reuse the loaded library — the first popup pays the load cost, the rest are instant. Calendar bots get this loader; non-calendar bots get a slimmer widget script with the Calendly branch omitted entirely (the generator threads `isCalendar` through template conditionals).

---

## Embedding the widget on a host page

The host pastes one tag:

```html
<script src="https://your-bot.example.com/widget"></script>
```

That's it. The script:

- Self-injects the launcher and iframe.
- Manages its own state.
- Communicates with the host page only via the postMessage types above.
- Caches for 5 minutes via `Cache-Control: public, max-age=300` — so subsequent page loads on the host don't re-fetch the script body.

For SPA hosts that mount/unmount routes:

```js
// On route leave
if (typeof window.__mojuloBotCleanup === 'function') {
  window.__mojuloBotCleanup();
}
```

Without this, navigating between routes stacks launchers (one per visit).

The widget is **safe to load on any origin** — the iframe is sandboxed by the browser's normal cross-origin rules; the script doesn't read host-page DOM beyond `document.body.appendChild`, doesn't touch host cookies, and doesn't proxy host events.

---

## The preview shim (`client/preview-shim.js`)

When the wizard renders a live preview of the bot it's currently building, the control plane serves the same `index.html` but with [preview-shim.js](../lite-template/client/preview-shim.js) injected at the top of `<head>`. This is the only file that ever runs *before* the client's main script.

The shim does two things:

### 1. postMessage handshake for config

```
Wizard parent              Preview iframe (preview-shim.js)
     │                              │
     │                              │ window.parent.postMessage(
     │                              │   { type: 'preview-shim-ready' },
     │                              │   '*'
     │◀─────────────────────────────┤ )
     │
     │ on receiving "shim-ready",
     │ post config back:
     │
     │ postMessage(                 │
     │   { type: 'preview-config',  │
     │     botContext, previewMeta} ├─▶ stash botContext into
     │ )                            │   window.__INITIAL_CONFIG__
     │                              │   resolve configReady promise
```

The client's `getContext()` then reads `window.__INITIAL_CONFIG__` and proceeds normally — same fallback path as a deployed bot, just populated from a different source.

### 2. fetch monkey-patch

The shim wraps `window.fetch`. Four routes are intercepted:

| Path                  | What the shim does                                                                                                                  |
|-----------------------|-------------------------------------------------------------------------------------------------------------------------------------|
| `/context`            | Resolves from `window.__INITIAL_CONFIG__` (waits on `configReady` if config hasn't arrived yet — blocks the bootstrap until ready). |
| `/chat`               | Forwards to `POST /api/preview/chat` on the control plane with `{ prompt, conversationHistory, turn, ...previewMeta }`. Reshapes the response into the deployed bot's `/chat` shape (`{ response, conversationId: 'preview', trace, hashMsg: 'preview', sources }`) so the unmodified client doesn't notice. |
| `/api/send-webhook`   | Stub — returns `{ success: true, preview: true }` and posts a `preview-side-effect` message to the parent so the wizard can show "would have called this webhook." |
| `/api/submit-form`    | Stub — same shape, posts `preview-side-effect` with the form payload.                                                              |

Everything else (CDN loads, asset requests) hits `realFetch` unchanged.

The result: the wizard preview is the deployed client running against a synthetic backend. No special "preview mode" branch in `index.html` ever fires — the shim is the thin layer that makes the same DOM behave like a real session against a fake server.

---

## Fork it with a text editor

The frontend is built so any developer can pop the hood and change anything they see. Every choice below trades a piece of modern ergonomics for that property:

- **Plain DOM, no client-side framework.** No React, Vue, Svelte, lit-html, htmx — just DOM APIs, event listeners, and `setInterval` for streaming. `view-source:` is the source of truth.
- **No bundler, no build step.** Edit the file, refresh. The Dockerfile copies `client/` into the image as-is. Patching a deployed bot is `docker cp` and a restart.
- **One page, no client router.** Triage handoffs are full navigations to a different bot's URL — which is also what makes the federated chain audit-able from URL parameters alone.
- **Hand-rolled state.** `FormInputRegistry` is a 200-line `Map`-backed object with change listeners; `machineState` is a plain object updated after each `/chat`. Everything is inspectable in the browser console.
- **Hand-written CSS.** A single `style.css`, no preprocessor. The widget script's launcher styles are inline so they outlive the host page's stylesheet — a class name would let host CSS override them.

The trade-off is that accessibility (skip links, ARIA roles, keyboard handlers) and mobile responsiveness are also hand-written. That's a real cost, but it's what makes the client legible end-to-end to anyone who wants to fork it.

---

## File map

| File | Role |
|------|------|
| [lite-template/client/index.html](../lite-template/client/index.html) | The single-page client. ~2000 lines of HTML + embedded JS. Runs in all three surfaces (standalone, widget iframe, preview iframe). |
| [lite-template/client/style.css](../lite-template/client/style.css) | All UI styling. No preprocessor. |
| [lite-template/client/preview-shim.js](../lite-template/client/preview-shim.js) | Injected by the control plane *only* during wizard preview. Receives config via postMessage, monkey-patches `fetch` for `/context`, `/chat`, `/api/send-webhook`, `/api/submit-form`. |
| [lite-template/helper/widget-generator.js](../lite-template/helper/widget-generator.js) | `generateWidgetScript(baseUrl, botName, { isCalendar })` — string-template factory for the embeddable IIFE. |
| [lite-template/server.js](../lite-template/server.js) `GET /` | Reads index.html, swaps the title, injects `window.__INITIAL_CONFIG__`. |
| [lite-template/server.js](../lite-template/server.js) `GET /widget` | Returns the generated IIFE with `Cache-Control: public, max-age=300`. |
| [lite-template/server.js](../lite-template/server.js) `GET /context` | Fallback config endpoint (used when `window.__INITIAL_CONFIG__` is missing — the preview shim intercepts this). |
| [client/index.html](../lite-template/client/index.html) §`FormInputRegistry` | Central form state registry. Exposed on `window.FormInputRegistry` for console debugging. |
| [client/index.html](../lite-template/client/index.html) §`streamHtmlContent` | Word-by-word markdown streaming over a pre-built sanitized DOM. |
| [client/index.html](../lite-template/client/index.html) §`createTriageCard` | Triage handoff UI element — see [federated-routing.md](federated-routing.md) for the chain-hash plumbing. |
| [client/index.html](../lite-template/client/index.html) §`window.closeWidget` / `openWidget` / `toggleWidget` | Iframe-side handles that postMessage to the widget wrapper. No-op when `window.parent === window`. |
