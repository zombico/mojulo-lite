'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import useSWR, { mutate } from 'swr';

const fetcher = (url) => fetch(url).then((r) => r.json());
const LIBRARY_KEY = '/api/documents?include=deployments';

function formatBytes(n) {
  if (!n) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = Number(n);
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

const FILTER_IDS = ['all', 'unattached', 'parse-failed'];
const FILTER_LABEL_KEYS = {
  all: 'all',
  unattached: 'unattached',
  'parse-failed': 'parseFailed',
};

function FilterTab({ id, label, count, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-xs transition border ${
        active
          ? 'border-[color:var(--brand-teal)] text-[color:var(--text-primary)] bg-[color:var(--surface-elevated)]/40'
          : 'border-[color:var(--border-color)] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]'
      }`}
    >
      {label}
      <span className="ml-1.5 text-[color:var(--text-muted)]">{count}</span>
    </button>
  );
}

export default function DocumentsLibraryPage() {
  const t = useTranslations('dashboard.documents');
  const tNav = useTranslations('nav');
  const { data, isLoading, error } = useSWR(LIBRARY_KEY, fetcher);
  const documents = data?.documents || [];

  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');

  const counts = useMemo(() => {
    let unattached = 0;
    let parseFailed = 0;
    for (const d of documents) {
      if ((d.deployments || []).length === 0) unattached += 1;
      if (!d.hasParsedText) parseFailed += 1;
    }
    return { all: documents.length, unattached, 'parse-failed': parseFailed };
  }, [documents]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return documents.filter((d) => {
      if (filter === 'unattached' && (d.deployments || []).length > 0) return false;
      if (filter === 'parse-failed' && d.hasParsedText) return false;
      if (q && !d.originalName.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [documents, filter, search]);

  // Selection only meaningful on the unattached filter, where deletion is safe.
  const showBulkDelete = filter === 'unattached';
  const visibleSelected = useMemo(() => {
    if (!showBulkDelete) return [];
    return filtered.filter((d) => selectedIds.has(d.id));
  }, [filtered, selectedIds, showBulkDelete]);

  function toggle(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allSelected = filtered.every((d) => next.has(d.id));
      if (allSelected) {
        for (const d of filtered) next.delete(d.id);
      } else {
        for (const d of filtered) next.add(d.id);
      }
      return next;
    });
  }

  function changeFilter(id) {
    setFilter(id);
    setSelectedIds(new Set());
    setActionError('');
  }

  async function bulkDelete() {
    if (visibleSelected.length === 0) return;
    const msg =
      visibleSelected.length === 1
        ? t('deleteSingleConfirm', { name: visibleSelected[0].originalName })
        : t('deleteMultiConfirm', { count: visibleSelected.length });
    if (!confirm(msg)) return;

    setBusy(true);
    setActionError('');
    try {
      const results = await Promise.all(
        visibleSelected.map(async (d) => {
          const res = await fetch(`/api/documents/${d.id}`, { method: 'DELETE' });
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            return { id: d.id, name: d.originalName, error: body.error || res.statusText };
          }
          return { id: d.id, name: d.originalName };
        })
      );
      const failures = results.filter((r) => r.error);
      if (failures.length > 0) {
        setActionError(
          t('deleteFailed', {
            failed: failures.length,
            total: results.length,
            details: failures.map((f) => `${f.name} (${f.error})`).join('; '),
          })
        );
      }
      setSelectedIds(new Set());
      await mutate(LIBRARY_KEY);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-[color:var(--text-muted)]">
            <Link href="/dashboard" className="hover:text-[color:var(--text-primary)] transition">
              {tNav('dashboard')}
            </Link>
            <span>/</span>
            <span>{t('breadcrumbHere')}</span>
          </div>
          <h1 className="text-3xl font-semibold">{t('title')}</h1>
          <p className="text-[color:var(--text-secondary)]">
            {t('subtitle')}
          </p>
        </header>

        {error && (
          <p className="text-sm text-red-400">{t('loadFailed', { error: String(error) })}</p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-2">
            {FILTER_IDS.map((id) => (
              <FilterTab
                key={id}
                id={id}
                label={t(`filters.${FILTER_LABEL_KEYS[id]}`)}
                count={counts[id] ?? 0}
                active={filter === id}
                onClick={() => changeFilter(id)}
              />
            ))}
          </div>
          <div className="flex-1 min-w-[200px]">
            <input
              type="search"
              placeholder={t('searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md border border-[color:var(--border-color)] bg-[color:var(--surface-elevated)]/40 px-3 py-2 text-sm"
            />
          </div>
        </div>

        {showBulkDelete && filtered.length > 0 && (
          <div className="flex items-center justify-between gap-3 rounded-md border border-[color:var(--border-color)] bg-[color:var(--surface-elevated)]/30 px-4 py-2">
            <div className="flex items-center gap-3 text-xs text-[color:var(--text-secondary)]">
              <button
                type="button"
                onClick={toggleAllVisible}
                className="hover:text-[color:var(--text-primary)] transition"
              >
                {filtered.every((d) => selectedIds.has(d.id)) ? t('deselectAll') : t('selectAll')}
              </button>
              <span>·</span>
              <span>
                {t('selectionStatus', { selected: visibleSelected.length, total: filtered.length })}
              </span>
            </div>
            <button
              type="button"
              onClick={bulkDelete}
              disabled={busy || visibleSelected.length === 0}
              className="rounded-md px-3 py-1.5 text-xs border border-red-500/40 text-red-300 hover:bg-red-500/10 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy
                ? t('deleting')
                : visibleSelected.length === 0
                  ? t('deleteSelected')
                  : t('deleteCount', { count: visibleSelected.length })}
            </button>
          </div>
        )}

        {actionError && (
          <p className="text-xs text-red-400 break-words">{actionError}</p>
        )}

        {isLoading && (
          <p className="text-sm text-[color:var(--text-muted)]">{t('loading')}</p>
        )}

        {!isLoading && filtered.length === 0 && (
          <div className="rounded-xl border border-dashed border-[color:var(--border-color)] bg-[color:var(--surface-primary)] p-12 text-center">
            <p className="text-sm text-[color:var(--text-muted)]">
              {documents.length === 0 ? t('noDocs') : t('noMatch')}
            </p>
          </div>
        )}

        {!isLoading && filtered.length > 0 && (
          <div className="rounded-xl border border-[color:var(--border-color)] bg-[color:var(--surface-primary)] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[color:var(--surface-elevated)]/40 text-[color:var(--text-muted)]">
                <tr className="text-left">
                  {showBulkDelete && <th className="w-10 px-4 py-2"></th>}
                  <th className="px-4 py-2 font-medium">{t('table.document')}</th>
                  <th className="px-4 py-2 font-medium">{t('table.size')}</th>
                  <th className="px-4 py-2 font-medium">{t('table.uploaded')}</th>
                  <th className="px-4 py-2 font-medium">{t('table.parsed')}</th>
                  <th className="px-4 py-2 font-medium">{t('table.usedBy')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => {
                  const refs = d.deployments || [];
                  const unattached = refs.length === 0;
                  return (
                    <tr
                      key={d.id}
                      className="border-t border-[color:var(--border-color)]/60 align-top"
                    >
                      {showBulkDelete && (
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(d.id)}
                            onChange={() => toggle(d.id)}
                            className="h-4 w-4 cursor-pointer"
                          />
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <div className="font-medium text-[color:var(--text-primary)] break-all">
                          {d.originalName}
                        </div>
                        <div className="text-xs text-[color:var(--text-muted)] mt-0.5">
                          {d.mimeType}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[color:var(--text-secondary)] whitespace-nowrap">
                        {formatBytes(d.sizeBytes)}
                      </td>
                      <td className="px-4 py-3 text-[color:var(--text-secondary)] whitespace-nowrap">
                        {formatDate(d.createdAt)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {d.hasParsedText ? (
                          <span className="text-xs text-green-400">✓</span>
                        ) : (
                          <span
                            className="text-xs text-amber-300"
                            title={t('parseFailedTooltip')}
                          >
                            {t('parseFailedLabel')}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {unattached ? (
                          <span className="text-xs text-[color:var(--text-muted)]">
                            {t('unattachedLabel')}
                          </span>
                        ) : (
                          <ul className="space-y-1">
                            {refs.map((r) => (
                              <li
                                key={r.id}
                                className="text-xs text-[color:var(--text-secondary)]"
                              >
                                {r.botName}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
