'use client';

import { useState } from 'react';

export default function EmbedScript({ url, isPreview = false }) {
  const [copied, setCopied] = useState(false);
  const embedScript = `<script src="${url}/widget"></script>`;

  const handleCopy = () => {
    navigator.clipboard.writeText(embedScript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-4 border-b border-gray-700 bg-gray-800">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-semibold text-gray-100">Embed Script</h4>
        {isPreview && (
          <span className="text-xs text-amber-400 bg-amber-900/30 px-2 py-0.5 rounded">Test Only</span>
        )}
      </div>
      <p className="text-xs text-gray-400 mb-2">
        {isPreview
          ? 'Copy this script to test embedding (expires in 1 hour):'
          : 'Copy this script to embed the chatbot on your website:'}
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          readOnly
          value={embedScript}
          className="flex-1 px-3 py-2 border border-gray-600 rounded-md bg-gray-900 text-gray-300 font-mono text-xs"
          onClick={(e) => e.target.select()}
        />
        <button
          onClick={handleCopy}
          className="px-3 py-2 bg-teal-600 text-white text-xs rounded-md hover:bg-teal-500 transition whitespace-nowrap"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
    </div>
  );
}
