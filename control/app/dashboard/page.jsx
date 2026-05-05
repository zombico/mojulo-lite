'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import useSWR, { mutate } from 'swr';
import EmbedScript from '@/components/shared/EmbedScript';

const fetcher = (url) => fetch(url).then((r) => r.json());

const STALE_THRESHOLD_MS = 5 * 60 * 1000;

function isFresh(lastSeenAt) {
  if (!lastSeenAt) return false;
  return Date.now() - new Date(lastSeenAt).getTime() < STALE_THRESHOLD_MS;
}

const TONE_DOT = {
  muted: 'bg-gray-500',
  teal: 'bg-[color:var(--brand-teal)]',
  green: 'bg-green-400',
  amber: 'bg-amber-400',
  red: 'bg-red-400',
};

const TONE_TEXT = {
  muted: 'text-[color:var(--text-muted)]',
  teal: 'text-[color:var(--text-secondary)]',
  green: 'text-[color:var(--text-secondary)]',
  amber: 'text-amber-300',
  red: 'text-red-300',
};

function getStatus(deployment) {
  const fresh = isFresh(deployment.lastSeenAt);
  const hasUrl = !!deployment.url;
  switch (deployment.status) {
    case 'building':
      return { tone: 'amber', label: 'Building', pulse: true };
    case 'build_failed':
      return { tone: 'red', label: 'Build failed' };
    case 'stale':
      return { tone: 'amber', label: 'Needs rebuild' };
    case 'ready':
      if (hasUrl && fresh) return { tone: 'green', label: 'Running' };
      if (hasUrl) return { tone: 'amber', label: 'Running · stale' };
      return { tone: 'teal', label: 'Ready' };
    case 'saved':
    default:
      return { tone: 'muted', label: 'Draft' };
  }
}

function StatusIndicator({ deployment, size = 'sm' }) {
  const s = getStatus(deployment);
  const dotSize = size === 'lg' ? 'h-2.5 w-2.5' : 'h-2 w-2';
  const textSize = size === 'lg' ? 'text-sm' : 'text-xs';
  return (
    <span className={`inline-flex items-center gap-2 ${textSize} ${TONE_TEXT[s.tone]}`}>
      <span
        className={`inline-block ${dotSize} rounded-full ${TONE_DOT[s.tone]} ${s.pulse ? 'animate-pulse' : ''}`}
        aria-hidden
      />
      {s.label}
    </span>
  );
}

function getBuildLabel(deployment, busy) {
  if (busy || deployment.status === 'building') return 'Building…';
  if (deployment.status === 'build_failed') return 'Retry build';
  if (deployment.status === 'stale') return 'Rebuild';
  return 'Build';
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
              className="mt-1 w-full rounded-md border border-[color:var(--border-color)] bg-[color:var(--surface-elevated)]/40 px-3 py-2 text-sm font-mono"
            />
          </label>
          {error && <p className="text-xs text-red-400 break-words">{error}</p>}
          <div className="flex items-center justify-between gap-2 pt-2">
            <div>
              {deployment.url && (
                <button
                  type="button"
                  onClick={disconnect}
                  disabled={submitting}
                  className="text-xs text-[color:var(--text-muted)] hover:text-red-400 transition disabled:opacity-50"
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
                className="rounded-lg px-3 py-1.5 text-sm bg-[color:var(--brand-teal)] text-[color:var(--brand-navy)] font-semibold hover:bg-[color:var(--brand-teal-hover)] transition disabled:opacity-50"
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

function ListItem({ deployment, selected, onSelect }) {
  const s = getStatus(deployment);
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(deployment.id)}
        className={`group relative w-full text-left rounded-md py-2.5 pl-4 pr-3 transition ${
          selected
            ? 'bg-[color:var(--surface-elevated)]/40'
            : 'hover:bg-[color:var(--surface-elevated)]/25'
        }`}
      >
        <span
          className={`absolute left-0 top-2 bottom-2 w-[3px] rounded-full transition ${
            selected ? 'bg-[color:var(--brand-teal)]' : 'bg-transparent'
          }`}
          aria-hidden
        />
        <div className="flex items-center gap-3 min-w-0">
          <span
            className={`inline-block h-2 w-2 rounded-full flex-shrink-0 ${TONE_DOT[s.tone]} ${s.pulse ? 'animate-pulse' : ''}`}
            aria-hidden
          />
          <span className="flex-1 truncate text-sm">{deployment.botName}</span>
          <span className={`text-[11px] flex-shrink-0 ${TONE_TEXT[s.tone]}`}>{s.label}</span>
        </div>
      </button>
    </li>
  );
}

function GhostAction({ children, onClick, href, external = false, title, disabled = false }) {
  const cls =
    'rounded-lg px-3 py-1.5 text-xs text-[color:var(--text-secondary)] border border-[color:var(--border-color)] hover:border-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] transition disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-[color:var(--border-color)] disabled:hover:text-[color:var(--text-secondary)]';
  if (href && !disabled) {
    if (external) {
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" className={cls} title={title}>
          {children}
        </a>
      );
    }
    return (
      <Link href={href} className={cls} title={title}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls} title={title} disabled={disabled}>
      {children}
    </button>
  );
}

function DetailPanel({ deployment, busy, onBuild, onConnect, onDelete, onBack }) {
  const [showEmbed, setShowEmbed] = useState(false);

  const fresh = isFresh(deployment.lastSeenAt);
  const hasUrl = !!deployment.url;
  const hasArtifact = deployment.status === 'ready' && deployment.artifactPath;
  const isReady = deployment.status === 'ready';
  const isBuilding = busy || deployment.status === 'building';
  const showBuildSlot =
    ['saved', 'build_failed', 'stale', 'building'].includes(deployment.status) || busy;
  const buildLabel = getBuildLabel(deployment, busy);

  const enabledProtocolList = deployment.enabledProtocols
    ? Object.entries(deployment.enabledProtocols)
        .filter(([, v]) => v)
        .map(([k]) => k)
    : [];

  return (
    <div className="rounded-xl border border-[color:var(--border-color)] bg-[color:var(--surface-primary)] p-6 space-y-6">
      <header className="space-y-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="md:hidden rounded-md px-2 py-1 text-xs text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] transition"
            title="Back to list"
          >
            ←
          </button>
          <h2 className="text-xl font-semibold truncate">{deployment.botName}</h2>
        </div>
        <StatusIndicator deployment={deployment} size="lg" />
        <p className="text-xs text-[color:var(--text-muted)]">
          {deployment.flowType}
          {enabledProtocolList.length > 0 && <> · {enabledProtocolList.join(', ')}</>}
          {hasUrl && (
            <>
              {' '}
              · running at <span className="font-mono">{deployment.url}</span>
            </>
          )}
        </p>
        {deployment.error && (
          <p className="text-xs text-red-400 break-words">{deployment.error}</p>
        )}
        {deployment.status === 'stale' && (
          <p className="text-xs text-amber-300/90">
            Config edited since last build — rebuild to get the latest ZIP.
          </p>
        )}
      </header>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <div className="flex flex-wrap gap-2">
            <GhostAction href={`/bot-factory/modular?from=${deployment.id}`}>Wizard</GhostAction>
            <GhostAction href={`/chat-builder?from=${deployment.id}`}>Chat</GhostAction>
          </div>
          {(isReady || hasUrl) && (
            <span
              className="h-5 w-px bg-[color:var(--border-color)] self-center"
              aria-hidden
            />
          )}
          <div className="flex flex-wrap gap-2">
            {isReady && !hasUrl && (
              <GhostAction onClick={() => onConnect(deployment)}>Connect</GhostAction>
            )}
            {hasUrl && !fresh && (
              <GhostAction onClick={() => onConnect(deployment)}>Reconnect</GhostAction>
            )}
            {hasUrl && fresh && (
              <GhostAction href={`/dashboard/deployments/${deployment.id}/conversations`}>
                Conversations
              </GhostAction>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <div className="flex flex-wrap gap-2">
            {showBuildSlot && (
              <GhostAction
                onClick={() => onBuild(deployment.id)}
                disabled={isBuilding}
              >
                {buildLabel}
              </GhostAction>
            )}
            {!showBuildSlot && hasArtifact && (
              <GhostAction href={`/api/deployments/${deployment.id}/download`}>
                Download Zip
              </GhostAction>
            )}
            <GhostAction href={`/dashboard/deployments/${deployment.id}/cloud-deploy`}>
              Deploy to Cloud
            </GhostAction>
          </div>
          {hasUrl && (
            <span
              className="h-5 w-px bg-[color:var(--border-color)] self-center"
              aria-hidden
            />
          )}
          {hasUrl && (
            <div className="flex flex-wrap gap-2">
              <GhostAction href={deployment.url} external>
                Live ↗
              </GhostAction>
              <GhostAction onClick={() => setShowEmbed((v) => !v)}>
                {showEmbed ? 'Hide Embed' : 'Embed Script'}
              </GhostAction>
            </div>
          )}
        </div>
      </div>

      {showEmbed && hasUrl && (
        <div className="rounded-lg border border-[color:var(--border-color)] overflow-hidden">
          <EmbedScript url={deployment.url} />
        </div>
      )}

      <div className="pt-4 border-t border-[color:var(--border-color)]/60">
        <button
          type="button"
          onClick={() => onDelete(deployment.id)}
          className="text-xs text-[color:var(--text-muted)] hover:text-red-400 transition"
        >
          Delete bot
        </button>
      </div>
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
              className="rounded-lg px-4 py-2 bg-[color:var(--brand-teal)] text-[color:var(--brand-navy)] font-semibold hover:bg-[color:var(--brand-teal-hover)] transition"
            >
              New bot (chat)
            </Link>
            <Link
              href="/bot-factory/modular"
              className="rounded-lg px-4 py-2 border border-[color:var(--border-color)] hover:border-[color:var(--text-muted)] transition"
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
                className="w-full rounded-md border border-[color:var(--border-color)] bg-[color:var(--surface-elevated)]/40 px-3 py-2 text-sm"
              />
              <ul className="space-y-0.5 overflow-y-auto pr-1 max-h-[calc(100vh-220px)]">
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
                  <img
                    src="/cards-icon.svg"
                    alt=""
                    className="mx-auto mb-4 h-16 w-16"
                  />
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
