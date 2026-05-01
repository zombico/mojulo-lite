'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import useSWR, { mutate } from 'swr';

const fetcher = (url) => fetch(url).then((r) => r.json());

const PROVIDERS = [
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'gemini', label: 'Google Gemini' },
  { id: 'cohere', label: 'Cohere' },
  { id: 'bedrock', label: 'AWS Bedrock (paste JSON credentials)' },
];

function SettingsPageInner() {
  const searchParams = useSearchParams();
  const gate = searchParams.get('gate');
  const { data, isLoading } = useSWR('/api/settings/api-keys', fetcher);
  const keys = data?.keys || [];

  const [name, setName] = useState('Default');
  const [provider, setProvider] = useState('anthropic');
  const [apiKey, setApiKey] = useState('');
  const [makeDefault, setMakeDefault] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch('/api/settings/api-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, provider, apiKey, makeDefault }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Save failed');
    } else {
      setApiKey('');
      await mutate('/api/settings/api-keys');
    }
    setSaving(false);
  }

  async function remove(id) {
    await fetch(`/api/settings/api-keys/${id}`, { method: 'DELETE' });
    await mutate('/api/settings/api-keys');
  }

  async function setDefault(id) {
    await fetch(`/api/settings/api-keys/${id}`, { method: 'PATCH' });
    await mutate('/api/settings/api-keys');
  }

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-3xl mx-auto space-y-10">
        <header>
          <h1 className="text-3xl font-semibold">Settings</h1>
          <p className="text-[color:var(--text-secondary)] mt-2">
            Your LLM provider key powers the bot builder AND gets baked into
            every bot you compile. One key; everything uses it.
          </p>
          {gate === 'no-key' && keys.length === 0 && (
            <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
              The builders need an LLM provider key to run. Add one below and
              head back.
            </div>
          )}
        </header>

        <section className="rounded-2xl border border-[color:var(--border-color)] bg-[color:var(--surface-primary)] p-6 space-y-4">
          <h2 className="text-xl font-semibold">Add an API key</h2>
          <form onSubmit={save} className="space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-[color:var(--text-muted)]">Display name</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="rounded-lg bg-[color:var(--surface-elevated)] px-3 py-2 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-[color:var(--text-muted)]">Provider</span>
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  className="rounded-lg bg-[color:var(--surface-elevated)] px-3 py-2 text-sm"
                >
                  {PROVIDERS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[color:var(--text-muted)]">API key</span>
              <input
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                type="password"
                placeholder={
                  provider === 'bedrock'
                    ? '{"region":"us-east-1","accessKeyId":"…","secretAccessKey":"…"}'
                    : 'sk-…'
                }
                className="rounded-lg bg-[color:var(--surface-elevated)] px-3 py-2 text-sm font-mono"
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={makeDefault}
                onChange={(e) => setMakeDefault(e.target.checked)}
              />
              Make this the default key
            </label>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={saving || !apiKey}
              className="rounded-lg px-4 py-2 bg-[color:var(--brand-teal)] text-[color:var(--brand-navy)] font-semibold disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save key'}
            </button>
          </form>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Stored keys</h2>
          {isLoading && <p className="text-sm text-[color:var(--text-muted)]">Loading…</p>}
          {!isLoading && keys.length === 0 && (
            <p className="text-sm text-[color:var(--text-muted)]">
              No keys yet — add one above to unlock the builders.
            </p>
          )}
          <ul className="space-y-2">
            {keys.map((k) => (
              <li
                key={k.id}
                className="flex items-center justify-between rounded-lg border border-[color:var(--border-color)] bg-[color:var(--surface-primary)] p-4 text-sm"
              >
                <div>
                  <p className="font-medium">
                    {k.name}{' '}
                    {k.isDefault && (
                      <span className="ml-2 text-xs text-[color:var(--brand-teal)]">
                        default
                      </span>
                    )}
                  </p>
                  <p className="text-[color:var(--text-muted)]">{k.provider}</p>
                </div>
                <div className="flex items-center gap-2">
                  {!k.isDefault && (
                    <button
                      onClick={() => setDefault(k.id)}
                      className="text-xs px-2 py-1 rounded border border-[color:var(--border-color)]"
                    >
                      Make default
                    </button>
                  )}
                  <button
                    onClick={() => remove(k.id)}
                    className="text-xs px-2 py-1 rounded border border-red-500/50 text-red-400"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsPageInner />
    </Suspense>
  );
}
