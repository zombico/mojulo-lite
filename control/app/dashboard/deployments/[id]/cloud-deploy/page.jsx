'use client';

import { useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import useSWR, { mutate } from 'swr';
import { useTranslations } from 'next-intl';

const fetcher = (url) => fetch(url).then((r) => r.json());

const DEFAULTS = {
  fly: {
    region: 'iad',
    cpus: 1,
    memoryMb: 1024,
    volumeGb: 1,
  },
};

const CLOUD_STATUS_CLASSES = {
  pending: 'bg-blue-900/40 text-blue-300 border-blue-800',
  deploying: 'bg-yellow-900/40 text-yellow-300 border-yellow-800',
  running: 'bg-green-900/40 text-green-300 border-green-800',
  paused: 'bg-gray-800 text-gray-300 border-gray-700',
  failed: 'bg-red-900/40 text-red-300 border-red-800',
  destroyed: 'bg-gray-800 text-gray-400 border-gray-700',
};

function StatusPill({ status, t }) {
  if (!status) return null;
  const className =
    CLOUD_STATUS_CLASSES[status] || 'bg-gray-800 text-gray-300 border-gray-700';
  const label = CLOUD_STATUS_CLASSES[status] ? t(`statusPills.${status}`) : status;
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium border ${className}`}
    >
      {label}
    </span>
  );
}

function formatTimestamp(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString();
}

export default function CloudDeployPage() {
  const params = useParams();
  const deploymentId = params.id;
  const t = useTranslations('cloudDeploy');

  const providers = [
    {
      id: 'fly',
      name: t('provider.fly.name'),
      enabled: true,
      description: t('provider.fly.description'),
    },
  ];

  const { data: deployment } = useSWR(
    deploymentId ? `/api/deployments/${deploymentId}` : null,
    fetcher
  );

  const cloudUrl = deploymentId
    ? `/api/deployments/${deploymentId}/cloud-deploy`
    : null;
  const { data: cloud } = useSWR(cloudUrl, fetcher, {
    refreshInterval: (data) =>
      data?.status === 'deploying' || data?.status === 'pending' ? 2000 : 0,
  });

  const [provider, setProvider] = useState('fly');
  const [region, setRegion] = useState(DEFAULTS.fly.region);
  const [cpus, setCpus] = useState(DEFAULTS.fly.cpus);
  const [memoryMb, setMemoryMb] = useState(DEFAULTS.fly.memoryMb);
  const [volumeGb, setVolumeGb] = useState(DEFAULTS.fly.volumeGb);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const isReady = deployment?.status === 'ready';
  const isStale = deployment?.status === 'stale';
  const hasArtifact = !!deployment?.artifactPath;
  const cloudStatus = cloud?.status;
  const isDeploying = cloudStatus === 'deploying' || cloudStatus === 'pending';
  const isRunning = cloudStatus === 'running';
  const cloudOptions = cloud?.options || {};

  const progress = cloud?.progress || [];

  const enabledProtocols = useMemo(() => {
    const proto =
      deployment?.config?._modular?.enabledProtocols ||
      deployment?.config?.enabledProtocols ||
      {};
    return Object.entries(proto)
      .filter(([, v]) => v)
      .map(([k]) => k);
  }, [deployment]);

  async function handleDeploy(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch(`/api/deployments/${deploymentId}/cloud-deploy`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          provider,
          options: {
            region,
            guest: { cpu_kind: 'shared', cpus: Number(cpus), memory_mb: Number(memoryMb) },
            volumeGb: Number(volumeGb),
          },
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || t('errors.deployFailed', { status: res.status }));
        return;
      }
      await mutate(cloudUrl);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDestroy() {
    if (!confirm(t('confirmDestroy'))) return;
    setError('');
    try {
      const res = await fetch(`/api/deployments/${deploymentId}/cloud-deploy`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || t('errors.destroyFailed', { status: res.status }));
        return;
      }
      await mutate(cloudUrl);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRebuild() {
    setError('');
    try {
      const res = await fetch(`/api/deployments/${deploymentId}/build`, {
        method: 'POST',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || t('errors.buildFailed', { status: res.status }));
        return;
      }
      await mutate(`/api/deployments/${deploymentId}`);
    } catch (err) {
      setError(err.message);
    }
  }

  if (!deployment) {
    return (
      <div className="p-8 text-sm text-[color:var(--text-muted)]">{t('loading')}</div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <header className="space-y-2">
        <Link
          href="/dashboard"
          className="text-xs text-[color:var(--text-muted)] hover:underline"
        >
          {t('backToDashboard')}
        </Link>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold">{t('title')}</h1>
          <StatusPill status={cloudStatus} t={t} />
        </div>
        <p className="text-sm text-[color:var(--text-muted)]">
          {t('botLabel')} <span className="font-mono">{deployment.botName}</span>
          {enabledProtocols.length > 0 && (
            <> · {t('protocolsLabel', { protocols: enabledProtocols.join(', ') })}</>
          )}
        </p>
      </header>

      <section className="rounded-xl border border-[color:var(--border-color)] bg-[color:var(--surface-primary)] p-5 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[color:var(--text-muted)]">
          {t('artifact.title')}
        </h2>
        <dl className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <dt className="text-[color:var(--text-muted)]">{t('artifact.status')}</dt>
            <dd className="font-mono">{deployment.status}</dd>
          </div>
          <div>
            <dt className="text-[color:var(--text-muted)]">{t('artifact.configHash')}</dt>
            <dd className="font-mono truncate">
              {deployment.configHash ? deployment.configHash.slice(0, 12) : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-[color:var(--text-muted)]">{t('artifact.lastBuiltHash')}</dt>
            <dd className="font-mono truncate">
              {deployment.lastBuiltHash ? deployment.lastBuiltHash.slice(0, 12) : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-[color:var(--text-muted)]">{t('artifact.artifactPath')}</dt>
            <dd className="font-mono truncate">
              {deployment.artifactPath || t('artifact.notBuiltYet')}
            </dd>
          </div>
        </dl>
        {isStale && (
          <p className="text-xs text-orange-400">
            {t('artifact.staleWarning')}
          </p>
        )}
        {!hasArtifact && (
          <p className="text-xs text-orange-400">
            {t('artifact.missingWarning')}
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleRebuild}
            className="rounded-lg px-3 py-1.5 text-xs border border-[color:var(--border-color)]"
          >
            {hasArtifact ? t('artifact.rebuildZip') : t('artifact.buildZip')}
          </button>
          {hasArtifact && (
            <a
              href={`/api/deployments/${deploymentId}/download`}
              className="rounded-lg px-3 py-1.5 text-xs border border-[color:var(--border-color)]"
            >
              {t('artifact.downloadZip')}
            </a>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-[color:var(--border-color)] bg-[color:var(--surface-primary)] p-5 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[color:var(--text-muted)]">
          {t('provider.title')}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {providers.map((p) => (
            <label
              key={p.id}
              className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition ${
                provider === p.id
                  ? 'border-[color:var(--brand-teal)] bg-[color:var(--surface-secondary)]'
                  : 'border-[color:var(--border-color)] bg-[color:var(--surface-primary)] hover:border-[color:var(--text-muted)]'
              } ${!p.enabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <input
                type="radio"
                name="provider"
                value={p.id}
                disabled={!p.enabled}
                checked={provider === p.id}
                onChange={(e) => setProvider(e.target.value)}
                className="mt-1"
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{p.name}</div>
                <div className="text-xs text-[color:var(--text-muted)] mt-0.5">
                  {p.description}
                </div>
              </div>
            </label>
          ))}
        </div>
      </section>

      {provider === 'fly' && (
        <section className="rounded-xl border border-[color:var(--border-color)] bg-[color:var(--surface-primary)] p-5 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[color:var(--text-muted)]">
            {t('fly.title')}
          </h2>
          <form onSubmit={handleDeploy} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <label className="block text-xs font-medium">
                {t('fly.region')}
                <input
                  type="text"
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  placeholder="iad"
                  className="mt-1 w-full rounded-md border border-[color:var(--border-color)] bg-[color:var(--surface-secondary)] px-3 py-2 text-sm font-mono"
                />
                <span className="block text-[10px] text-[color:var(--text-muted)] mt-0.5">
                  {t('fly.regionHint')}
                </span>
              </label>
              <label className="block text-xs font-medium">
                {t('fly.volumeSize')}
                <input
                  type="number"
                  min="1"
                  max="500"
                  value={volumeGb}
                  onChange={(e) => setVolumeGb(e.target.value)}
                  className="mt-1 w-full rounded-md border border-[color:var(--border-color)] bg-[color:var(--surface-secondary)] px-3 py-2 text-sm font-mono"
                />
                <span className="block text-[10px] text-[color:var(--text-muted)] mt-0.5">
                  {t('fly.volumeHint')}
                </span>
              </label>
              <label className="block text-xs font-medium">
                {t('fly.cpuCount')}
                <input
                  type="number"
                  min="1"
                  max="8"
                  value={cpus}
                  onChange={(e) => setCpus(e.target.value)}
                  className="mt-1 w-full rounded-md border border-[color:var(--border-color)] bg-[color:var(--surface-secondary)] px-3 py-2 text-sm font-mono"
                />
                <span className="block text-[10px] text-[color:var(--text-muted)] mt-0.5">
                  {t('fly.cpuHint')}
                </span>
              </label>
              <label className="block text-xs font-medium">
                {t('fly.memory')}
                <input
                  type="number"
                  min="256"
                  step="256"
                  max="8192"
                  value={memoryMb}
                  onChange={(e) => setMemoryMb(e.target.value)}
                  className="mt-1 w-full rounded-md border border-[color:var(--border-color)] bg-[color:var(--surface-secondary)] px-3 py-2 text-sm font-mono"
                />
                <span className="block text-[10px] text-[color:var(--text-muted)] mt-0.5">
                  {t('fly.memoryHint')}
                </span>
              </label>
            </div>

            {error && (
              <p className="text-xs text-red-400 break-words">{error}</p>
            )}

            <div className="flex items-center justify-between gap-3 pt-2">
              <p className="text-[10px] text-[color:var(--text-muted)]">
                {t.rich('fly.tokenNote', {
                  mono: (chunks) => <span className="font-mono">{chunks}</span>,
                })}
              </p>
              <button
                type="submit"
                disabled={submitting || isDeploying}
                className="rounded-lg px-4 py-2 text-sm bg-[color:var(--brand-teal)] text-[color:var(--brand-navy)] font-semibold disabled:opacity-50"
              >
                {submitting || isDeploying
                  ? t('fly.deploying')
                  : isRunning
                    ? t('fly.redeploy')
                    : t('fly.deploy')}
              </button>
            </div>
          </form>
        </section>
      )}

      {(progress.length > 0 || cloud?.appName) && (
        <section className="rounded-xl border border-[color:var(--border-color)] bg-[color:var(--surface-primary)] p-5 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[color:var(--text-muted)]">
            {t('status.title')}
          </h2>
          {cloud?.appName && (
            <dl className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <dt className="text-[color:var(--text-muted)]">{t('status.provider')}</dt>
                <dd className="font-mono">{cloud.provider}</dd>
              </div>
              <div>
                <dt className="text-[color:var(--text-muted)]">{t('status.appName')}</dt>
                <dd className="font-mono truncate">{cloud.appName}</dd>
              </div>
              {cloud.url && (
                <div className="col-span-2">
                  <dt className="text-[color:var(--text-muted)]">{t('status.url')}</dt>
                  <dd>
                    <a
                      href={cloud.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-[color:var(--brand-teal)] hover:underline break-all"
                    >
                      {cloud.url}
                    </a>
                  </dd>
                </div>
              )}
              {cloudOptions.region && (
                <div>
                  <dt className="text-[color:var(--text-muted)]">{t('status.region')}</dt>
                  <dd className="font-mono">{cloudOptions.region}</dd>
                </div>
              )}
              {cloud.lastDeployedAt && (
                <div>
                  <dt className="text-[color:var(--text-muted)]">{t('status.lastDeployed')}</dt>
                  <dd className="font-mono">
                    {new Date(cloud.lastDeployedAt).toLocaleString()}
                  </dd>
                </div>
              )}
            </dl>
          )}
          {cloud?.error && (
            <p className="text-xs text-red-400 break-words">
              {t('status.errorPrefix', { error: cloud.error })}
            </p>
          )}
          {progress.length > 0 && (
            <ol className="space-y-1 text-xs font-mono max-h-64 overflow-auto">
              {progress.map((p, i) => (
                <li key={i} className="flex gap-3">
                  <span className="text-[color:var(--text-muted)] shrink-0">
                    {formatTimestamp(p.timestamp)}
                  </span>
                  <span className="text-[color:var(--text-muted)] shrink-0 w-24 truncate">
                    {p.step}
                  </span>
                  <span className="break-words">{p.message}</span>
                </li>
              ))}
            </ol>
          )}
          {isRunning && (
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={handleDestroy}
                className="rounded-lg px-3 py-1.5 text-xs border border-red-500/50 text-red-400"
              >
                {t('status.destroy')}
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
