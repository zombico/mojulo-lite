'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

export default function SubmissionsPage() {
  const params = useParams();
  const deploymentId = params.id;
  const t = useTranslations('submissions');

  const [submissions, setSubmissions] = useState([]);
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [botName, setBotName] = useState('');
  const [totalCount, setTotalCount] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [unreachable, setUnreachable] = useState(false);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const toUTCParam = (localDateStr) => {
    if (!localDateStr) return '';
    const d = new Date(localDateStr);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  };

  const buildQueryString = useCallback(
    (start, end) => {
      const qs = new URLSearchParams();
      if (start) qs.set('startDate', toUTCParam(start));
      if (end) qs.set('endDate', toUTCParam(end));
      return qs.toString();
    },
    []
  );

  const searchSubmissions = useCallback(
    async (overrides = {}) => {
      const effectiveStart = overrides.startDate ?? startDate;
      const effectiveEnd = overrides.endDate ?? endDate;

      try {
        setLoading(true);
        setError('');
        const qs = buildQueryString(effectiveStart, effectiveEnd);
        const res = await fetch(`/api/deployments/${deploymentId}/submissions?${qs}`);

        if (res.status === 409) {
          setUnreachable(true);
          return;
        }
        if (!res.ok) {
          throw new Error(`Failed to fetch submissions (${res.status})`);
        }

        setUnreachable(false);
        const data = await res.json();
        setBotName(data.botName || '');
        setTotalCount(data.total ?? null);
        setSubmissions(data.submissions || []);
        setSelectedSubmission(null);
        setHasSearched(true);
      } catch (err) {
        console.error('Error fetching submissions:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    },
    [deploymentId, startDate, endDate, buildQueryString]
  );

  function runQuickSearch(period) {
    const now = new Date();
    const from = new Date(now);
    if (period === '24h') from.setHours(from.getHours() - 24);
    else if (period === '7d') from.setDate(from.getDate() - 7);
    else if (period === '30d') from.setDate(from.getDate() - 30);
    const fmt = (d) => {
      const pad = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    const fromStr = fmt(from);
    const toStr = fmt(now);
    setStartDate(fromStr);
    setEndDate(toStr);
    searchSubmissions({ startDate: fromStr, endDate: toStr });
  }

  // Default search: last 7 days on mount.
  useEffect(() => {
    runQuickSearch('7d');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deploymentId]);

  function handleSearch(e) {
    e.preventDefault();
    searchSubmissions();
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleString();
  }

  function formatFieldValue(value) {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value);
  }

  if (unreachable) {
    return (
      <main className="min-h-screen p-8">
        <div className="max-w-2xl mx-auto space-y-4">
          <Link href="/dashboard" className="text-sm text-[color:var(--text-muted)]">
            {t('backToDashboard')}
          </Link>
          <div className="rounded-xl border border-orange-700 bg-orange-900/20 p-6">
            <h2 className="text-lg font-semibold text-orange-300">{t('unreachable.title')}</h2>
            <p className="text-sm text-orange-200/80 mt-2">{t('unreachable.message')}</p>
            <Link
              href="/dashboard"
              className="inline-block mt-4 rounded-lg px-3 py-1.5 text-sm bg-orange-600 text-white font-semibold"
            >
              {t('unreachable.reconnect')}
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const exportHref = `/api/deployments/${deploymentId}/submissions/export?${buildQueryString(startDate, endDate)}`;

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-2">
          <Link href="/dashboard" className="text-xs text-gray-400 hover:text-gray-200">
            {t('dashboardLink')}
          </Link>
        </div>
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-100">
            {t('title')}
            {botName && <span className="ml-2 text-base text-gray-400">— {botName}</span>}
          </h1>
          <p className="text-gray-400 mt-1 text-sm">
            {t('description', { botName: botName || 'your bot' })}
            {totalCount !== null && (
              <span className="ml-2 text-gray-500">{t('total', { count: totalCount })}</span>
            )}
          </p>
        </div>

        <form onSubmit={handleSearch} className="bg-gray-800/60 rounded-lg border border-gray-700 p-4 mb-6">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => runQuickSearch('24h')}
                className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 rounded-md transition"
              >
                {t('search.last24h')}
              </button>
              <button
                type="button"
                onClick={() => runQuickSearch('7d')}
                className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 rounded-md transition"
              >
                {t('search.last7days')}
              </button>
              <button
                type="button"
                onClick={() => runQuickSearch('30d')}
                className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 rounded-md transition"
              >
                {t('search.last30days')}
              </button>
            </div>
            <div className="flex-1" />
            <div>
              <label className="block text-xs text-gray-400 mb-1">{t('search.from')}</label>
              <input
                type="datetime-local"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-3 py-1.5 bg-gray-900 border border-gray-700 rounded-md text-sm text-gray-100"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">{t('search.to')}</label>
              <input
                type="datetime-local"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-3 py-1.5 bg-gray-900 border border-gray-700 rounded-md text-sm text-gray-100"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-1.5 bg-purple-600 text-white rounded-md hover:bg-purple-500 transition disabled:opacity-50"
            >
              {loading ? t('search.searching') : t('search.search')}
            </button>
            <a
              href={exportHref}
              className="px-4 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-100 rounded-md text-sm font-semibold"
            >
              {t('search.export')}
            </a>
          </div>
        </form>

        {error && (
          <div className="bg-red-900/30 border border-red-700 text-red-300 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 bg-gray-800/60 rounded-lg border border-gray-700 overflow-hidden">
            <div className="p-4 border-b border-gray-700 bg-gray-800">
              <h2 className="font-semibold text-gray-200">
                {t('list.title')}
                {submissions.length > 0 && (
                  <span className="ml-2 text-sm font-normal text-gray-400">
                    {t('list.shown', { count: submissions.length })}
                  </span>
                )}
              </h2>
            </div>
            <div className="divide-y divide-gray-700/60 max-h-[600px] overflow-y-auto">
              {loading && submissions.length === 0 ? (
                <div className="p-8 text-center text-gray-400">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500 mx-auto mb-2" />
                  {t('list.loading')}
                </div>
              ) : submissions.length === 0 ? (
                <div className="p-8 text-center text-gray-400">
                  {hasSearched ? t('list.noSubmissions') : t('list.searchToView')}
                </div>
              ) : (
                submissions.map((sub) => (
                  <button
                    key={sub.id}
                    onClick={() => setSelectedSubmission(sub)}
                    className={`w-full text-left p-4 hover:bg-gray-700/50 transition ${
                      selectedSubmission?.id === sub.id
                        ? 'bg-purple-900/30 border-l-4 border-purple-500'
                        : ''
                    }`}
                  >
                    <div className="text-sm font-medium text-gray-100 truncate">
                      {sub.conversationId}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">{formatDate(sub.submittedAt)}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      {t('list.fields', {
                        count: Object.keys(sub.formData || {}).length,
                      })}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="lg:col-span-2 bg-gray-800/60 rounded-lg border border-gray-700 overflow-hidden">
            <div className="p-4 border-b border-gray-700 bg-gray-800">
              <h2 className="font-semibold text-gray-200">{t('detail.title')}</h2>
            </div>
            <div className="p-6">
              {selectedSubmission ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-400">{t('detail.conversationId')}</span>
                      <div className="font-mono text-gray-100 break-all">
                        {selectedSubmission.conversationId}
                      </div>
                    </div>
                    <div>
                      <span className="text-gray-400">{t('detail.submitted')}</span>
                      <div className="text-gray-100">{formatDate(selectedSubmission.submittedAt)}</div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-gray-200 mb-3">
                      {t('detail.formData')}
                    </h3>
                    <div className="bg-gray-900/60 rounded-lg p-4 border border-gray-700">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-700">
                            <th className="text-left py-2 pr-4 font-medium text-gray-300">
                              {t('detail.field')}
                            </th>
                            <th className="text-left py-2 font-medium text-gray-300">
                              {t('detail.value')}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(selectedSubmission.formData || {}).map(([key, value]) => (
                            <tr key={key} className="border-b border-gray-800 last:border-0">
                              <td className="py-2 pr-4 font-medium text-gray-300 align-top">
                                {key}
                              </td>
                              <td className="py-2 text-gray-100 whitespace-pre-wrap break-words">
                                {formatFieldValue(value)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {selectedSubmission.metadata &&
                    Object.keys(selectedSubmission.metadata).length > 0 && (
                      <div>
                        <h3 className="text-sm font-semibold text-gray-200 mb-3">
                          {t('detail.metadata')}
                        </h3>
                        <div className="bg-gray-900/60 rounded-lg p-4 border border-gray-700">
                          <pre className="text-xs text-gray-300 overflow-x-auto">
                            {JSON.stringify(selectedSubmission.metadata, null, 2)}
                          </pre>
                        </div>
                      </div>
                    )}
                </div>
              ) : (
                <div className="text-center text-gray-500 py-12">{t('detail.selectSubmission')}</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
