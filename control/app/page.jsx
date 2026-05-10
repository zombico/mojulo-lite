'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
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

function getStatus(deployment, t) {
  const fresh = isFresh(deployment.lastSeenAt);
  const hasUrl = !!deployment.url;
  switch (deployment.status) {
    case 'building':
      return { tone: 'amber', label: t('building'), pulse: true };
    case 'build_failed':
      return { tone: 'red', label: t('buildFailed') };
    case 'stale':
      return { tone: 'amber', label: t('needsRebuild') };
    case 'ready':
      if (hasUrl && fresh) return { tone: 'green', label: t('running') };
      if (hasUrl) return { tone: 'amber', label: t('runningStale') };
      return { tone: 'teal', label: t('ready') };
    case 'saved':
    default:
      return { tone: 'muted', label: t('draft') };
  }
}

function StatusIndicator({ deployment, size = 'sm' }) {
  const t = useTranslations('dashboard.statuses');
  const s = getStatus(deployment, t);
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

function getBuildLabel(deployment, busy, t) {
  if (busy || deployment.status === 'building') return t('building');
  if (deployment.status === 'build_failed') return t('retry');
  if (deployment.status === 'stale') return t('rebuild');
  return t('build');
}

function ConnectModal({ deployment, onClose, onConnected }) {
  const t = useTranslations('dashboard.connect');
  const tCommon = useTranslations('common');
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
        setError(body.error || t('probeFailedFallback', { status: res.status }));
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
          <h2 className="text-lg font-semibold">{t('title')}</h2>
          <p className="text-xs text-[color:var(--text-muted)] mt-1">
            {t.rich('description', {
              name: deployment.botName,
              code: (chunks) => <code>{chunks}</code>,
            })}
          </p>
        </header>
        <form onSubmit={submit} className="space-y-3">
          <label className="block text-xs font-medium">
            {t('botUrlLabel')}
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
                  {t('disconnect')}
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-3 py-1.5 text-sm border border-[color:var(--border-color)]"
              >
                {tCommon('cancel')}
              </button>
              <button
                type="submit"
                disabled={submitting || !url.trim()}
                className="rounded-lg px-3 py-1.5 text-sm bg-[color:var(--brand-teal)] text-[color:var(--brand-navy)] font-semibold hover:bg-[color:var(--brand-teal-hover)] transition disabled:opacity-50"
              >
                {submitting ? t('testing') : t('testAndSave')}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function ListItem({ deployment, selected, onSelect }) {
  const t = useTranslations('dashboard.statuses');
  const s = getStatus(deployment, t);
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
  const t = useTranslations('dashboard.detail');
  const tBuilds = useTranslations('dashboard.builds');
  const [showEmbed, setShowEmbed] = useState(false);

  const fresh = isFresh(deployment.lastSeenAt);
  const hasUrl = !!deployment.url;
  const hasArtifact = deployment.status === 'ready' && deployment.artifactPath;
  const isReady = deployment.status === 'ready';
  const isBuilding = busy || deployment.status === 'building';
  const showBuildSlot =
    ['saved', 'build_failed', 'stale', 'building'].includes(deployment.status) || busy;
  const buildLabel = getBuildLabel(deployment, busy, tBuilds);

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
            title={t('backToList')}
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
              · {t('runningAt')} <span className="font-mono">{deployment.url}</span>
            </>
          )}
        </p>
        {deployment.error && (
          <p className="text-xs text-red-400 break-words">{deployment.error}</p>
        )}
        {deployment.status === 'stale' && (
          <p className="text-xs text-amber-300/90">
            {t('staleNotice')}
          </p>
        )}
      </header>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <div className="flex flex-wrap gap-2">
            <GhostAction href={`/bot-factory/modular?from=${deployment.id}`}>{t('wizard')}</GhostAction>
            <GhostAction href={`/chat-builder?from=${deployment.id}`}>{t('chat')}</GhostAction>
          </div>
          {(isReady || hasUrl) && (
            <span
              className="h-5 w-px bg-[color:var(--border-color)] self-center"
              aria-hidden
            />
          )}
          <div className="flex flex-wrap gap-2">
            {isReady && !hasUrl && (
              <GhostAction onClick={() => onConnect(deployment)}>{t('connect')}</GhostAction>
            )}
            {hasUrl && !fresh && (
              <GhostAction onClick={() => onConnect(deployment)}>{t('reconnect')}</GhostAction>
            )}
            {hasUrl && fresh && (
              <GhostAction href={`/dashboard/deployments/${deployment.id}/conversations`}>
                {t('conversations')}
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
                {t('downloadZip')}
              </GhostAction>
            )}
            {!showBuildSlot && hasArtifact && deployment.documentCount > 0 && (
              <GhostAction href={`/api/deployments/${deployment.id}/download?withDocs=1`}>
                {t('downloadWithDocs')}
              </GhostAction>
            )}
            <GhostAction href={`/dashboard/deployments/${deployment.id}/cloud-deploy`}>
              {t('deployToCloud')}
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
                {t('live')}
              </GhostAction>
              <GhostAction onClick={() => setShowEmbed((v) => !v)}>
                {showEmbed ? t('hideEmbed') : t('embedScript')}
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
          {t('deleteBot')}
        </button>
      </div>
    </div>
  );
}

export default function HomePage() {
  const t = useTranslations('dashboard');
  const tDetail = useTranslations('dashboard.detail');
  const { data, isLoading } = useSWR('/api/deployments', fetcher);
  const { data: keysData } = useSWR('/api/settings/api-keys', fetcher);
  const hasLLMKey = Array.isArray(keysData?.keys) && keysData.keys.some(
    (k) => ['anthropic', 'openai', 'gemini', 'cohere', 'bedrock'].includes(k.provider),
  );
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
    if (!confirm(tDetail('deleteConfirm'))) return;
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
        alert(t('buildFailedAlert', { error: body.error || res.statusText }));
        return;
      }
      await mutate('/api/deployments');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="min-h-[calc(100vh-33px)] p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {!hasLLMKey && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm flex items-center justify-between gap-3">
            <span className="text-[color:var(--text-secondary)]">
              {t('noKeyBanner.text')}
            </span>
            <Link
              href="/settings"
              className="font-medium text-amber-300 hover:text-amber-200 whitespace-nowrap"
            >
              {t('noKeyBanner.cta')}
            </Link>
          </div>
        )}
        <header className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold">{t('myBots')}</h1>
            <p className="text-[color:var(--text-secondary)] mt-2">
              {t('subtitle')}
            </p>
            <Link
              href="/dashboard/documents"
              className="inline-block mt-2 text-xs text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] underline decoration-dotted underline-offset-2 transition"
            >
              {t('documentLibrary')}
            </Link>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <Link
              href="/chat-builder"
              className="rounded-lg px-4 py-2 bg-[color:var(--brand-teal)] text-[color:var(--brand-navy)] font-semibold hover:bg-[color:var(--brand-teal-hover)] transition"
            >
              {t('newBotChat')}
            </Link>
            <Link
              href="/bot-factory/modular"
              className="rounded-lg px-4 py-2 border border-[color:var(--border-color)] hover:border-[color:var(--text-muted)] transition"
            >
              {t('newBotWizard')}
            </Link>
          </div>
        </header>

        {isLoading && <p className="text-sm text-[color:var(--text-muted)]">{t('loadingShort')}</p>}
        {!isLoading && deployments.length === 0 && (
          <p className="text-sm text-[color:var(--text-muted)]">
            {t('noBotsHint')}
          </p>
        )}

        {!isLoading && deployments.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <aside className={`md:col-span-1 space-y-3 ${selected ? 'hidden md:block' : ''}`}>
              <input
                type="search"
                placeholder={t('searchBots')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-md border border-[color:var(--border-color)] bg-[color:var(--surface-elevated)]/40 px-3 py-2 text-sm"
              />
              <ul className="space-y-0.5 overflow-y-auto pr-1 max-h-[calc(100vh-220px)]">
                {filtered.length === 0 ? (
                  <li className="text-xs text-[color:var(--text-muted)] px-1 py-2">
                    {t('noBotsMatch', { query: search })}
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
                    {t('emptyDetailHint')}
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
