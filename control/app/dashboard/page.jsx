'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import useSWR, { mutate } from 'swr';
import EmbedScript from '@/components/shared/EmbedScript';

const fetcher = (url) => fetch(url).then((r) => r.json());

const STATUS_PILLS = {
  saved: { label: 'Saved', className: 'bg-blue-900/40 text-blue-300 border-blue-800' },
  building: { label: 'Building', className: 'bg-yellow-900/40 text-yellow-300 border-yellow-800' },
  ready: { label: 'Ready', className: 'bg-green-900/40 text-green-300 border-green-800' },
  stale: { label: 'Stale', className: 'bg-orange-900/40 text-orange-300 border-orange-800' },
  build_failed: { label: 'Build failed', className: 'bg-red-900/40 text-red-300 border-red-800' },
};

const STALE_THRESHOLD_MS = 5 * 60 * 1000;

function isFresh(lastSeenAt) {
  if (!lastSeenAt) return false;
  return Date.now() - new Date(lastSeenAt).getTime() < STALE_THRESHOLD_MS;
}

function ConnectionDot({ url, lastSeenAt }) {
  if (!url) return null;
  const fresh = isFresh(lastSeenAt);
  const seenAt = lastSeenAt ? new Date(lastSeenAt).getTime() : 0;
  const title = fresh
    ? `Connected — last seen ${new Date(seenAt).toLocaleTimeString()}`
    : seenAt
      ? `Connected (stale) — last seen ${new Date(seenAt).toLocaleString()}`
      : 'Connected';
  return (
    <span
      title={title}
      className={`inline-block h-2 w-2 rounded-full ${fresh ? 'bg-green-400' : 'bg-gray-500'}`}
    />
  );
}

function ConnectModal({ deployment, onClose, onConnected }) {
  const [url, setUrl] = useState(deployment.url || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`/api/deployments/${deployment.id}/connection`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || `Probe failed (${res.status})`);
        return;
      }
      onConnected();
    } finally {
      setSubmitting(false);
    }
  }

  async function disconnect() {
    setSubmitting(true);
    setError('');
    try {
      await fetch(`/api/deployments/${deployment.id}/connection`, { method: 'DELETE' });
      onConnected();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-xl border border-[color:var(--border-color)] bg-[color:var(--surface-primary)] p-6 space-y-4">
        <header>
          <h2 className="text-lg font-semibold">Connect a running bot</h2>
          <p className="text-xs text-[color:var(--text-muted)] mt-1">
            Paste the URL where you&apos;re running <code>{deployment.botName}</code>. The control
            plane will probe it with the row&apos;s baked-in API key.
          </p>
        </header>
        <form onSubmit={submit} className="space-y-3">
          <label className="block text-xs font-medium">
            Bot URL
            <input
              type="url"
              required
              autoFocus
              placeholder="http://localhost:3001"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="mt-1 w-full rounded-md border border-[color:var(--border-color)] bg-[color:var(--surface-secondary)] px-3 py-2 text-sm font-mono"
            />
          </label>
          {error && (
            <p className="text-xs text-red-400 break-words">{error}</p>
          )}
          <div className="flex items-center justify-between gap-2 pt-2">
            <div>
              {deployment.url && (
                <button
                  type="button"
                  onClick={disconnect}
                  disabled={submitting}
                  className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
                >
                  Disconnect
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-3 py-1.5 text-sm border border-[color:var(--border-color)]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !url.trim()}
                className="rounded-lg px-3 py-1.5 text-sm bg-[color:var(--brand-teal)] text-[color:var(--brand-navy)] font-semibold disabled:opacity-50"
              >
                {submitting ? 'Testing…' : 'Test & save'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function StatusPill({ status }) {
  const pill = STATUS_PILLS[status] || {
    label: status,
    className: 'bg-gray-800 text-gray-300 border-gray-700',
  };
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium border ${pill.className}`}>
      {pill.label}
    </span>
  );
}

function ListItem({ deployment, selected, onSelect }) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(deployment.id)}
        className={`w-full text-left rounded-lg border p-3 transition ${
          selected
            ? 'border-[color:var(--brand-teal)] bg-[color:var(--surface-secondary)]'
            : 'border-[color:var(--border-color)] bg-[color:var(--surface-primary)] hover:border-[color:var(--text-muted)]'
        }`}
      >
        <div className="flex items-center gap-2">
          <ConnectionDot url={deployment.url} lastSeenAt={deployment.lastSeenAt} />
          <span className="flex-1 truncate text-sm font-medium">{deployment.botName}</span>
          <StatusPill status={deployment.status} />
        </div>
      </button>
    </li>
  );
}

function ActionGroup({ label, children }) {
  const visible = (Array.isArray(children) ? children : [children]).filter(Boolean);
  if (visible.length === 0) return null;
  return (
    <section className="space-y-2">
      <h3 className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--text-muted)]">
        {label}
      </h3>
      <div className="flex flex-wrap items-center gap-2">{visible}</div>
    </section>
  );
}

function DetailPanel({ deployment, busy, onBuild, onConnect, onDelete, onBack }) {
  const [showEmbed, setShowEmbed] = useState(false);

  const isBuilding = busy || deployment.status === 'building';
  const isStale = deployment.status === 'stale';
  const isReady = deployment.status === 'ready';
  const showBuildButton = ['saved', 'build_failed'].includes(deployment.status) || isStale;
  const buildLabel = isBuilding ? 'Building…' : isStale ? 'Rebuild' : 'Build';
  const hasArtifact = isReady && deployment.artifactPath;
  const hasUrl = !!deployment.url;
  const fresh = isFresh(deployment.lastSeenAt);

  const enabledProtocolList = deployment.enabledProtocols
    ? Object.entries(deployment.enabledProtocols)
        .filter(([, v]) => v)
        .map(([k]) => k)
    : [];

  return (
    <div className="rounded-xl border border-[color:var(--border-color)] bg-[color:var(--surface-primary)] p-6 space-y-6">
      <header className="space-y-2">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="md:hidden rounded-md border border-[color:var(--border-color)] px-2 py-1 text-xs"
            title="Back to list"
          >
            ←
          </button>
          <h2 className="text-xl font-semibold truncate">{deployment.botName}</h2>
          <StatusPill status={deployment.status} />
          <ConnectionDot url={deployment.url} lastSeenAt={deployment.lastSeenAt} />
        </div>
        <p className="text-xs text-[color:var(--text-muted)]">
          {deployment.flowType}
          {enabledProtocolList.length > 0 && (
            <> · protocols: {enabledProtocolList.join(', ')}</>
          )}
        </p>
        {hasUrl && (
          <p className="text-xs text-[color:var(--text-muted)] break-all">
            running at <span className="font-mono">{deployment.url}</span>
          </p>
        )}
        {deployment.error && (
          <p className="text-xs text-red-400 break-words">error: {deployment.error}</p>
        )}
        {isStale && (
          <p className="text-xs text-orange-400">
            Config edited since last build — rebuild to get the latest ZIP.
          </p>
        )}
      </header>

      <div className="space-y-5">
        <ActionGroup label="Build">
          {showBuildButton && (
            <button
              key="build"
              onClick={() => onBuild(deployment.id)}
              disabled={isBuilding}
              className="rounded-lg px-3 py-1.5 text-sm bg-blue-600 text-white font-semibold disabled:opacity-50"
            >
              {buildLabel}
            </button>
          )}
          {hasArtifact && (
            <a
              key="download"
              href={`/api/deployments/${deployment.id}/download`}
              className="rounded-lg px-3 py-1.5 text-sm bg-[color:var(--brand-teal)] text-[color:var(--brand-navy)] font-semibold"
            >
              Download .zip
            </a>
          )}
        </ActionGroup>

        <ActionGroup label="Connect">
          {isReady && !hasUrl && (
            <button
              key="connect"
              onClick={() => onConnect(deployment)}
              className="rounded-lg px-3 py-1.5 text-sm border border-[color:var(--border-color)]"
            >
              Connect…
            </button>
          )}
          {hasUrl && !fresh && (
            <button
              key="reconnect"
              onClick={() => onConnect(deployment)}
              className="rounded-lg px-3 py-1.5 text-sm border border-orange-500/50 text-orange-300"
            >
              Reconnect
            </button>
          )}
          {hasUrl && (
            <a
              key="live"
              href={deployment.url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg px-3 py-1.5 text-sm border border-[color:var(--border-color)]"
            >
              Live ↗
            </a>
          )}
          {hasUrl && (
            <button
              key="settings"
              onClick={() => onConnect(deployment)}
              className="rounded-lg px-2 py-1.5 text-xs border border-[color:var(--border-color)] text-[color:var(--text-muted)]"
              title="Change URL or disconnect"
            >
              ⚙
            </button>
          )}
        </ActionGroup>

        <ActionGroup label="Data">
          {hasUrl && (
            <Link
              key="conversations"
              href={`/dashboard/deployments/${deployment.id}/conversations`}
              className="rounded-lg px-3 py-1.5 text-sm bg-teal-700 text-white font-semibold"
            >
              Go to conversations
            </Link>
          )}
        </ActionGroup>

        <ActionGroup label="Edit">
          <Link
            key="modify"
            href={`/bot-factory/modular?from=${deployment.id}`}
            className="rounded-lg px-3 py-1.5 text-sm border border-[color:var(--border-color)]"
          >
            Modify
          </Link>
          <Link
            key="edit-in-chat"
            href={`/chat-builder?from=${deployment.id}`}
            className="rounded-lg px-3 py-1.5 text-sm border border-[color:var(--border-color)]"
          >
            Edit in chat
          </Link>
        </ActionGroup>

        <ActionGroup label="Embed">
          {hasUrl && (
            <button
              key="embed-toggle"
              onClick={() => setShowEmbed((v) => !v)}
              className="rounded-lg px-3 py-1.5 text-sm border border-[color:var(--border-color)]"
            >
              {showEmbed ? 'Hide embed script' : 'Get embed script'}
            </button>
          )}
        </ActionGroup>

        <ActionGroup label="Danger">
          <button
            key="delete"
            onClick={() => onDelete(deployment.id)}
            className="rounded-lg px-3 py-1.5 text-sm border border-red-500/50 text-red-400"
          >
            Delete
          </button>
        </ActionGroup>
      </div>

      {showEmbed && hasUrl && (
        <div className="rounded-lg border border-[color:var(--border-color)] overflow-hidden">
          <EmbedScript url={deployment.url} />
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const { data, isLoading } = useSWR('/api/deployments', fetcher);
  const deployments = data?.deployments || [];
  const [busyId, setBusyId] = useState(null);
  const [connectFor, setConnectFor] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return deployments;
    return deployments.filter((d) => d.botName.toLowerCase().includes(q));
  }, [deployments, search]);

  const selected = deployments.find((d) => d.id === selectedId) || null;

  async function remove(id) {
    if (!confirm('Delete this bot and its artifact?')) return;
    await fetch(`/api/deployments/${id}`, { method: 'DELETE' });
    if (selectedId === id) setSelectedId(null);
    await mutate('/api/deployments');
  }

  async function build(id) {
    try {
      setBusyId(id);
      const res = await fetch(`/api/deployments/${id}/build`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(`Build failed: ${body.error || res.statusText}`);
        return;
      }
      await mutate('/api/deployments');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold">My bots</h1>
            <p className="text-[color:var(--text-secondary)] mt-2">
              Each bot is a saved configuration. Build it whenever you want a runnable ZIP.
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <Link
              href="/chat-builder"
              className="rounded-lg px-4 py-2 bg-[color:var(--brand-teal)] text-[color:var(--brand-navy)] font-semibold"
            >
              New bot (chat)
            </Link>
            <Link
              href="/bot-factory/modular"
              className="rounded-lg px-4 py-2 border border-[color:var(--border-color)]"
            >
              New bot (wizard)
            </Link>
          </div>
        </header>

        {isLoading && <p className="text-sm text-[color:var(--text-muted)]">Loading…</p>}
        {!isLoading && deployments.length === 0 && (
          <p className="text-sm text-[color:var(--text-muted)]">
            No bots yet. Start one from the chat builder or the wizard.
          </p>
        )}

        {!isLoading && deployments.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <aside className={`md:col-span-1 space-y-3 ${selected ? 'hidden md:block' : ''}`}>
              <input
                type="search"
                placeholder="Search bots…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-md border border-[color:var(--border-color)] bg-[color:var(--surface-secondary)] px-3 py-2 text-sm"
              />
              <ul className="space-y-2 overflow-y-auto pr-1 max-h-[calc(100vh-220px)]">
                {filtered.length === 0 ? (
                  <li className="text-xs text-[color:var(--text-muted)] px-1 py-2">
                    No bots match &ldquo;{search}&rdquo;.
                  </li>
                ) : (
                  filtered.map((d) => (
                    <ListItem
                      key={d.id}
                      deployment={d}
                      selected={selectedId === d.id}
                      onSelect={setSelectedId}
                    />
                  ))
                )}
              </ul>
            </aside>

            <div className={`md:col-span-2 ${selected ? '' : 'hidden md:block'}`}>
              {selected ? (
                <DetailPanel
                  key={selected.id}
                  deployment={selected}
                  busy={busyId === selected.id}
                  onBuild={build}
                  onConnect={setConnectFor}
                  onDelete={remove}
                  onBack={() => setSelectedId(null)}
                />
              ) : (
                <div className="rounded-xl border border-dashed border-[color:var(--border-color)] bg-[color:var(--surface-primary)] p-12 text-center">
                  <p className="text-sm text-[color:var(--text-muted)]">
                    Select a bot to see its lifecycle actions.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      {connectFor && (
        <ConnectModal
          deployment={connectFor}
          onClose={() => setConnectFor(null)}
          onConnected={async () => {
            setConnectFor(null);
            await mutate('/api/deployments');
          }}
        />
      )}
    </main>
  );
}
