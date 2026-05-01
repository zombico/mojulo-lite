/**
 * Preview shim — only loaded when the bot client is rendered inside the
 * wizard's preview iframe (NOT inside a deployed container). Injected by
 * the control plane's /api/preview/bot route at the top of <head>.
 *
 * Two responsibilities:
 *   1. Receive `botContext` + `previewMeta` from the parent window via
 *      postMessage and stash botContext into window.__INITIAL_CONFIG__ so
 *      the unmodified client picks it up via its existing fallback path.
 *   2. Monkey-patch fetch() to redirect the deployed bot's three endpoints
 *      (/chat, /api/send-webhook, /api/submit-form) at the control plane's
 *      preview-equivalents (or no-op stubs).
 *
 * Side effect: also blocks the client's bootstrap until config arrives, so
 * we never race the iframe's getContext() against the parent's postMessage.
 */
(function previewShim() {
  const ORIGIN = window.location.origin;
  const PARENT_ORIGIN = '*'; // Same-origin iframe; relax if hosted cross-origin later.
  const HISTORY = []; // { user_prompt, llm_response (stringified) }
  let TURN = 0;
  let CONFIG_RESOLVED = false;
  let previewMeta = null;

  // Convert the incoming postMessage into window.__INITIAL_CONFIG__ so the
  // production client's `getContext()` fallback (index.html ~line 1776)
  // reads from us instead of hitting /context.
  const configReady = new Promise((resolve) => {
    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (!msg || msg.type !== 'preview-config') return;
      window.__INITIAL_CONFIG__ = msg.botContext;
      previewMeta = msg.previewMeta || null;
      CONFIG_RESOLVED = true;
      resolve();
    });

    // Tell the parent we're ready to receive config. Parent should respond
    // with a `preview-config` postMessage.
    window.parent?.postMessage({ type: 'preview-shim-ready' }, PARENT_ORIGIN);
  });

  const realFetch = window.fetch.bind(window);

  function isUrl(input, predicate) {
    try {
      const url =
        typeof input === 'string'
          ? new URL(input, ORIGIN)
          : new URL(input.url, ORIGIN);
      return predicate(url);
    } catch {
      return false;
    }
  }

  function jsonResponse(body, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  async function handleChat(init) {
    if (!CONFIG_RESOLVED) await configReady;
    let body = {};
    try {
      body = JSON.parse(init?.body || '{}');
    } catch {
      /* keep empty */
    }
    const prompt = body.prompt || '';

    const previewPayload = {
      prompt,
      conversationHistory: HISTORY,
      turn: TURN,
      ...(previewMeta || {}),
    };

    const res = await realFetch('/api/preview/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(previewPayload),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return jsonResponse(
        { error: json.error || `Preview chat failed (${res.status})` },
        res.status,
      );
    }

    const sati = json.response || {};
    HISTORY.push({ user_prompt: prompt, llm_response: JSON.stringify(sati) });
    TURN += 1;

    // Reshape into the deployed bot's /chat response so the unmodified
    // client code path keeps working without any branching.
    return jsonResponse({
      response: sati,
      conversationId: 'preview',
      trace: json.trace || {},
      hashMsg: 'preview',
      sources: json.sources || [],
    });
  }

  function notifyParent(kind, detail) {
    try {
      window.parent?.postMessage(
        { type: 'preview-side-effect', kind, detail },
        PARENT_ORIGIN,
      );
    } catch {
      /* ignore */
    }
  }

  async function handleWebhookStub(init) {
    let body = {};
    try {
      body = JSON.parse(init?.body || '{}');
    } catch { /* ignore */ }
    console.log('[preview] webhook would POST to:', body.webhookUrl, body.data);
    notifyParent('webhook', { url: body.webhookUrl, data: body.data });
    return jsonResponse({ success: true, status: 200, preview: true });
  }

  async function handleSubmitFormStub(init) {
    let body = {};
    try {
      body = JSON.parse(init?.body || '{}');
    } catch { /* ignore */ }
    console.log('[preview] submit-form would send to control plane:', body);
    notifyParent('submit-form', body);
    return jsonResponse({
      success: true,
      message: 'preview: not actually submitted',
      preview: true,
    });
  }

  window.fetch = async function patchedFetch(input, init) {
    if (isUrl(input, (u) => u.pathname === '/chat')) {
      return handleChat(init);
    }
    if (isUrl(input, (u) => u.pathname === '/api/send-webhook')) {
      return handleWebhookStub(init);
    }
    if (isUrl(input, (u) => u.pathname === '/api/submit-form')) {
      return handleSubmitFormStub(init);
    }
    if (isUrl(input, (u) => u.pathname === '/context')) {
      // The production client checks window.__INITIAL_CONFIG__ first and
      // only falls back to /context if it's empty. We exploit that fallback:
      // if config hasn't arrived yet, await it here before responding.
      if (!CONFIG_RESOLVED) await configReady;
      return jsonResponse(window.__INITIAL_CONFIG__ || {});
    }
    return realFetch(input, init);
  };
})();
