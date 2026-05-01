'use client';

import { useEffect, useRef, useState } from 'react';
import { useModularWizard } from '../ModularWizardContext';
import { buildPreviewConfig } from '@/lib/preview/build-preview-config';

/**
 * Renders the deployed bot's actual client (lite-template/client/index.html
 * + style.css) inside an iframe and "puppeteers" it from the wizard's
 * formData via postMessage. The iframe boots fresh every mount; a "Reset"
 * button bumps the React key to force a clean reload mid-session.
 *
 * Why an iframe and not a React port? Production already has a polished
 * client with form rendering, triage cards, calendar buttons, and ~1200
 * lines of CSS. Reproducing that in React would invite drift on every
 * tweak. Instead we reuse the artifact and only abstract the seams that
 * differ (config source, /chat transport, side-effect endpoints) — see
 * lite-template/client/preview-shim.js.
 */
export default function PreviewBot() {
  const { formData, enabledProtocols } = useModularWizard();
  const [resetKey, setResetKey] = useState(0);
  const [sideEffects, setSideEffects] = useState([]); // banner messages
  const iframeRef = useRef(null);

  const previewPayload = buildPreviewConfig(formData, enabledProtocols);

  // Listen for the shim's "ready" handshake and respond with the config.
  // Also surface stubbed webhook / submit-form calls as banners.
  useEffect(() => {
    function onMessage(event) {
      const msg = event.data;
      if (!msg || typeof msg !== 'object') return;

      if (msg.type === 'preview-shim-ready') {
        if (!previewPayload || !iframeRef.current?.contentWindow) return;
        iframeRef.current.contentWindow.postMessage(
          {
            type: 'preview-config',
            botContext: previewPayload.botContext,
            previewMeta: previewPayload.previewMeta,
          },
          '*',
        );
        return;
      }

      if (msg.type === 'preview-side-effect') {
        const label =
          msg.kind === 'webhook'
            ? `Webhook would POST to ${msg.detail?.url || '(no URL)'}`
            : msg.kind === 'submit-form'
              ? 'Form would submit to control plane'
              : 'Side effect skipped in preview';
        setSideEffects((prev) => [...prev.slice(-2), { id: Date.now(), label }]);
      }
    }

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
    // We deliberately re-run on resetKey/payload change so the latest
    // payload is captured in the closure when the shim sends its ready.
  }, [previewPayload, resetKey]);

  function reset() {
    setSideEffects([]);
    setResetKey((k) => k + 1);
  }

  if (!previewPayload) {
    return (
      <div className="h-full flex items-center justify-center p-6 text-sm text-yellow-300">
        Add a provider, model, and API key in step 1 to start the preview bot.
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-900">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700 bg-gray-800">
        <span className="text-xs text-gray-400">Live preview</span>
        <button
          type="button"
          onClick={reset}
          className="text-xs text-teal-400 hover:text-teal-300 font-medium"
        >
          Reset preview
        </button>
      </div>

      {sideEffects.length > 0 && (
        <div className="px-3 py-2 border-b border-gray-700 bg-gray-800 space-y-1">
          {sideEffects.map((e) => (
            <div key={e.id} className="text-xs text-amber-300">
              {e.label} <span className="text-gray-500">(skipped in preview)</span>
            </div>
          ))}
        </div>
      )}

      <iframe
        key={resetKey}
        ref={iframeRef}
        src="/api/preview/bot/index.html"
        title="Bot preview"
        className="flex-1 w-full border-0"
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-modals"
      />
    </div>
  );
}
