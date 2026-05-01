'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

export default function ConversationsPage() {
  const params = useParams();
  const deploymentId = params.id;
  const t = useTranslations('conversations');

  const [activeTab, setActiveTab] = useState('conversations');

  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [conversationDetails, setConversationDetails] = useState(null);
  const [loading, setLoading] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [error, setError] = useState('');
  const [botName, setBotName] = useState('');
  const [totalCount, setTotalCount] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [showMetadata, setShowMetadata] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [unreachable, setUnreachable] = useState(false);

  const [searchId, setSearchId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [storageData, setStorageData] = useState(null);
  const [storageLoading, setStorageLoading] = useState(false);
  const [storageError, setStorageError] = useState('');
  const [exporting, setExporting] = useState(false);

  const fetchTotalCount = useCallback(async () => {
    try {
      const res = await fetch(`/api/deployments/${deploymentId}/conversations`);
      if (res.status === 409) {
        setUnreachable(true);
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setBotName(data.botName || '');
        setTotalCount(data.pagination?.total ?? null);
      } else {
        setUnreachable(true);
      }
    } catch {
      setUnreachable(true);
    }
  }, [deploymentId]);

  const toUTCParam = (localDateStr) => {
    if (!localDateStr) return '';
    const d = new Date(localDateStr);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  };

  const searchConversations = useCallback(
    async (append = false, overrides = {}) => {
      const effectiveId = overrides.searchId ?? searchId;
      const effectiveStart = overrides.startDate ?? startDate;
      const effectiveEnd = overrides.endDate ?? endDate;
      const hasParams = effectiveId || effectiveStart || effectiveEnd;
      if (!hasParams) return;

      try {
        setLoading(true);
        setError('');
        const offset = append ? conversations.length : 0;
        const qs = new URLSearchParams({ limit: '50', offset: String(offset) });
        if (effectiveId) qs.set('conversationId', effectiveId);
        if (effectiveStart) qs.set('startDate', toUTCParam(effectiveStart));
        if (effectiveEnd) qs.set('endDate', toUTCParam(effectiveEnd));

        const res = await fetch(
          `/api/deployments/${deploymentId}/conversations?${qs.toString()}`
        );
        if (res.status === 409) {
          setUnreachable(true);
          return;
        }
        if (!res.ok) throw new Error(t('errors.fetchConversations'));

        const data = await res.json();
        setUnreachable(false);
        setBotName(data.botName || '');

        if (append) {
          setConversations((prev) => [...prev, ...(data.conversations || [])]);
        } else {
          setConversations(data.conversations || []);
          setSelectedConversation(null);
          setConversationDetails(null);
        }
        setHasMore(data.pagination?.hasMore || false);
        setHasSearched(true);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    },
    [deploymentId, searchId, startDate, endDate, conversations.length, t]
  );

  const runQuickSearch = useCallback(
    (period) => {
      const now = new Date();
      const from = new Date(now);
      if (period === '24h') from.setHours(from.getHours() - 24);
      else if (period === '7d') from.setDate(from.getDate() - 7);
      const fmt = (d) => {
        const pad = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      };
      const fromStr = fmt(from);
      const toStr = fmt(now);
      setStartDate(fromStr);
      setEndDate(toStr);
      setSearchId('');
      searchConversations(false, { searchId: '', startDate: fromStr, endDate: toStr });
    },
    [searchConversations]
  );

  useEffect(() => {
    fetchTotalCount();
    runQuickSearch('24h');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deploymentId]);

  useEffect(() => {
    if (!selectedConversation) return;
    let cancelled = false;
    (async () => {
      setDetailsLoading(true);
      setConversationDetails(null);
      try {
        const res = await fetch(
          `/api/deployments/${deploymentId}/conversations/${selectedConversation.conversation_id}`
        );
        if (!res.ok) throw new Error(t('errors.fetchDetails'));
        const data = await res.json();
        if (!cancelled) setConversationDetails(data);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setDetailsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedConversation, deploymentId, t]);

  useEffect(() => {
    if (activeTab !== 'storage' || storageData) return;
    let cancelled = false;
    (async () => {
      setStorageLoading(true);
      setStorageError('');
      try {
        const res = await fetch(`/api/deployments/${deploymentId}/storage`);
        if (!res.ok) throw new Error(t('errors.fetchStorage'));
        const data = await res.json();
        if (!cancelled) setStorageData(data);
      } catch (err) {
        if (!cancelled) setStorageError(err.message);
      } finally {
        if (!cancelled) setStorageLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab, storageData, deploymentId, t]);

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch(`/api/deployments/${deploymentId}/conversations/export`);
      if (!res.ok) throw new Error(t('errors.exportFailed'));
      const blob = await res.blob();
      const cd = res.headers.get('content-disposition') || '';
      const m = cd.match(/filename="(.+)"/);
      const filename = m?.[1] || `conversations-${new Date().toISOString().split('T')[0]}.json`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setStorageError(err.message);
    } finally {
      setExporting(false);
    }
  }

  function formatTimestamp(ts) {
    return new Date(ts).toLocaleString();
  }

  function formatBytes(bytes) {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function getPreview(c) {
    const startedAt = new Date(c.started_at);
    const diffMs = Date.now() - startedAt.getTime();
    const diffH = Math.floor(diffMs / 3.6e6);
    const diffD = Math.floor(diffH / 24);
    const timeAgo =
      diffD > 0
        ? t('timeAgo.days', { count: diffD })
        : diffH > 0
          ? t('timeAgo.hours', { count: diffH })
          : t('timeAgo.minutes', { count: Math.floor(diffMs / 60000) });
    return { id: c.conversation_id.substring(0, 8), timeAgo, turnCount: c.turn_count };
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

  const tabLabels = {
    conversations: t('tabs.conversations'),
    storage: t('tabs.storage'),
  };

  return (
    <div className="h-screen flex flex-col bg-gray-900">
      <div className="flex justify-between items-center px-8 pt-6 pb-2">
        <div>
          <Link href="/dashboard" className="text-xs text-gray-400 hover:text-gray-200">
            {t('dashboardLink')}
          </Link>
          <h1 className="text-2xl font-bold text-gray-100 mt-1">
            {t('title')} {botName && <span className="text-gray-400 text-base">— {botName}</span>}
          </h1>
        </div>
        {totalCount !== null && (
          <span className="text-sm text-gray-400">{t('total', { count: totalCount })}</span>
        )}
      </div>

      <div className="px-8 border-b border-gray-700">
        <nav className="flex gap-6">
          {['conversations', 'storage'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 text-sm font-medium border-b-2 transition ${
                activeTab === tab
                  ? 'border-teal-400 text-teal-400'
                  : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              {tabLabels[tab]}
            </button>
          ))}
        </nav>
      </div>

      {error && (
        <div className="mx-8 mt-4 bg-red-900/30 border border-red-700 text-red-400 px-4 py-3 rounded">
          {error}
          <button
            onClick={() => setError('')}
            className="ml-2 text-red-300 hover:text-red-200 font-medium"
          >
            {t('errors.close')}
          </button>
        </div>
      )}

      {activeTab === 'conversations' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              searchConversations(false);
            }}
            className="px-8 py-4 bg-gray-800 border-b border-gray-700"
          >
            <div className="flex items-end gap-3 flex-wrap">
              <div className="w-48">
                <label className="block text-xs font-medium text-gray-400 mb-1">
                  {t('search.conversationId')}
                </label>
                <input
                  type="text"
                  placeholder={t('search.partialIdShort')}
                  value={searchId}
                  onChange={(e) => setSearchId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-600 rounded-md text-sm bg-gray-700 text-gray-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">
                  {t('search.from')}
                </label>
                <input
                  type="datetime-local"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="px-3 py-2 border border-gray-600 rounded-md text-sm bg-gray-700 text-gray-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">
                  {t('search.to')}
                </label>
                <input
                  type="datetime-local"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="px-3 py-2 border border-gray-600 rounded-md text-sm bg-gray-700 text-gray-100"
                />
              </div>
              <button
                type="submit"
                disabled={loading || (!searchId && !startDate && !endDate)}
                className="px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-md disabled:opacity-50"
              >
                {loading ? t('search.searching') : t('search.search')}
              </button>
              <button
                type="button"
                onClick={() => runQuickSearch('24h')}
                disabled={loading}
                className="px-3 py-2 text-sm border border-gray-600 rounded-md bg-gray-700 text-gray-300 disabled:opacity-50"
              >
                {t('search.last24h')}
              </button>
              <button
                type="button"
                onClick={() => runQuickSearch('7d')}
                disabled={loading}
                className="px-3 py-2 text-sm border border-gray-600 rounded-md bg-gray-700 text-gray-300 disabled:opacity-50"
              >
                {t('search.last7days')}
              </button>
              {hasSearched && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchId('');
                    setStartDate('');
                    setEndDate('');
                    setConversations([]);
                    setSelectedConversation(null);
                    setConversationDetails(null);
                    setHasSearched(false);
                    setHasMore(false);
                  }}
                  className="px-3 py-2 text-sm text-gray-400 hover:text-gray-200"
                >
                  {t('search.clear')}
                </button>
              )}
            </div>
          </form>

          {!hasSearched ? (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              <p className="text-sm">{t('search.searchByIdOrDate')}</p>
            </div>
          ) : (
            <div className="flex-1 grid grid-cols-4 gap-6 px-8 py-4 overflow-hidden">
              <div className="col-span-1 border-r border-gray-700 pr-4 overflow-y-auto flex flex-col">
                <p className="text-xs text-gray-400 mb-3">
                  {conversations.length === 1
                    ? t('search.result', { count: conversations.length })
                    : t('search.results', { count: conversations.length })}
                </p>
                <div className="flex-1 space-y-2 overflow-y-auto">
                  {conversations.map((c) => {
                    const p = getPreview(c);
                    const selected =
                      selectedConversation?.conversation_id === c.conversation_id;
                    return (
                      <div
                        key={c.conversation_id}
                        onClick={() => setSelectedConversation(c)}
                        className={`border rounded-lg p-3 cursor-pointer transition ${
                          selected
                            ? 'border-teal-500 bg-teal-900/30'
                            : 'border-gray-700 hover:border-gray-600 bg-gray-800 hover:bg-gray-700'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono text-xs font-semibold text-gray-200">
                            {p.id}…
                          </span>
                          <span className="text-xs text-gray-500">{p.timeAgo}</span>
                        </div>
                        <p className="text-sm text-gray-400">
                          {t('detail.turns', { count: p.turnCount })}
                        </p>
                      </div>
                    );
                  })}
                </div>
                {hasMore && (
                  <div className="pt-4 border-t border-gray-700 mt-4">
                    <button
                      onClick={() => searchConversations(true)}
                      disabled={loading}
                      className="w-full px-3 py-2 text-sm bg-gray-700 text-gray-300 rounded-md disabled:opacity-50"
                    >
                      {loading ? t('loadingMore') : t('loadMore')}
                    </button>
                  </div>
                )}
                {conversations.length === 0 && (
                  <div className="text-center py-8 text-gray-500 text-sm">
                    {t('search.noMatchShort')}
                  </div>
                )}
              </div>

              <div className="col-span-3 overflow-y-auto">
                {selectedConversation ? (
                  <div className="space-y-4">
                    <div className="border border-gray-700 rounded-lg p-6 bg-gray-800 sticky top-0 z-10">
                      <div className="flex items-center justify-between">
                        <div>
                          <h2 className="text-xl font-bold font-mono text-gray-100">
                            {selectedConversation.conversation_id.substring(0, 16)}…
                          </h2>
                          <p className="text-sm text-gray-400 mt-1">
                            {t('detail.startedAt', {
                              timestamp: formatTimestamp(selectedConversation.started_at),
                            })}
                          </p>
                        </div>
                        <div className="flex items-center gap-4">
                          <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={showMetadata}
                              onChange={(e) => setShowMetadata(e.target.checked)}
                              className="rounded border-gray-600 bg-gray-700 text-teal-500"
                            />
                            {t('detail.showMetadataShort')}
                          </label>
                          <div className="text-right">
                            <p className="text-sm text-gray-400">
                              {t('detail.turns', { count: selectedConversation.turn_count })}
                            </p>
                            <p className="text-xs text-gray-500">
                              {t('detail.lastAt', {
                                timestamp: formatTimestamp(selectedConversation.last_activity),
                              })}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {detailsLoading ? (
                      <div className="text-center py-8 text-gray-400 text-sm">
                        {t('detail.loading')}
                      </div>
                    ) : conversationDetails ? (
                      <div className="space-y-4">
                        {conversationDetails.turns.map((turn) => (
                          <div
                            key={turn.id ?? `${turn.turn}-${turn.timestamp}`}
                            className="border border-gray-700 rounded-lg p-4 bg-gray-800"
                          >
                            <div className="flex items-center gap-2 mb-3">
                              <span className="text-xs font-semibold text-gray-500">
                                {t('detail.turn', { number: turn.turn })}
                              </span>
                              <span className="text-xs text-gray-500">
                                {formatTimestamp(turn.timestamp)}
                              </span>
                            </div>

                            <div className="mb-4">
                              <div className="flex items-center gap-2 mb-2">
                                <div className="w-2 h-2 bg-teal-500 rounded-full"></div>
                                <span className="text-sm font-semibold text-gray-300">
                                  {t('detail.user')}
                                </span>
                              </div>
                              <p className="text-sm text-gray-100 ml-4 whitespace-pre-wrap">
                                {turn.user_prompt}
                              </p>
                            </div>

                            {showMetadata && turn.rag_context && (
                              <div className="mb-4 ml-4 border-l-2 border-amber-600 pl-3">
                                <p className="text-xs font-semibold text-amber-400 mb-1">
                                  {t('detail.ragContextShort')}
                                </p>
                                <pre className="text-xs text-gray-300 bg-amber-900/30 p-3 rounded overflow-x-auto whitespace-pre-wrap">
                                  {typeof turn.rag_context === 'string'
                                    ? (() => {
                                        try {
                                          return JSON.stringify(
                                            JSON.parse(turn.rag_context),
                                            null,
                                            2
                                          );
                                        } catch {
                                          return turn.rag_context;
                                        }
                                      })()
                                    : JSON.stringify(turn.rag_context, null, 2)}
                                </pre>
                              </div>
                            )}

                            <div>
                              <div className="flex items-center gap-2 mb-2">
                                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                <span className="text-sm font-semibold text-gray-300">
                                  {t('detail.assistant')}
                                </span>
                              </div>
                              {(() => {
                                try {
                                  const response =
                                    typeof turn.llm_response === 'string'
                                      ? JSON.parse(turn.llm_response)
                                      : turn.llm_response;
                                  const { answer, ...metadata } = response;
                                  return (
                                    <>
                                      <p className="text-sm text-gray-100 ml-4 whitespace-pre-wrap">
                                        {answer}
                                      </p>
                                      {showMetadata && Object.keys(metadata).length > 0 && (
                                        <pre className="mt-2 ml-4 text-xs text-gray-400 bg-gray-700 p-3 rounded overflow-x-auto">
                                          {JSON.stringify(metadata, null, 2)}
                                        </pre>
                                      )}
                                    </>
                                  );
                                } catch {
                                  return (
                                    <p className="text-sm text-gray-100 ml-4 whitespace-pre-wrap">
                                      {turn.llm_response}
                                    </p>
                                  );
                                }
                              })()}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-500">
                    <p>{t('detail.selectConversationShort')}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'storage' && (
        <div className="flex-1 px-8 py-6 overflow-y-auto">
          {storageLoading ? (
            <p className="text-gray-400 text-sm">{t('storage.loadingShort')}</p>
          ) : storageError ? (
            <div className="bg-red-900/30 border border-red-700 text-red-400 px-4 py-3 rounded">
              {storageError}
            </div>
          ) : storageData ? (
            <div className="max-w-2xl space-y-6">
              {storageData.volume && (
                <div className="border border-gray-700 rounded-lg p-6 bg-gray-800">
                  <h3 className="text-lg font-semibold mb-4 text-gray-100">
                    {t('storage.volumeCapacityShort')}
                  </h3>
                  <div className="mb-3">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-400">
                        {t('storage.usedOfTotal', {
                          used: formatBytes(storageData.volume.usedBytes),
                          total: formatBytes(storageData.volume.totalBytes),
                        })}
                      </span>
                      <span className="text-gray-300">{storageData.volume.usedPercent}%</span>
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-3">
                      <div
                        className="h-3 rounded-full bg-green-500"
                        style={{
                          width: `${Math.min(storageData.volume.usedPercent, 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-3 gap-4">
                <div className="border border-gray-700 rounded-lg p-4 bg-gray-800 text-center">
                  <p className="text-2xl font-bold text-gray-100">
                    {storageData.conversations?.totalConversations ?? '-'}
                  </p>
                  <p className="text-sm text-gray-400">{t('storage.statsConversations')}</p>
                </div>
                <div className="border border-gray-700 rounded-lg p-4 bg-gray-800 text-center">
                  <p className="text-2xl font-bold text-gray-100">
                    {storageData.conversations?.totalTurns ?? '-'}
                  </p>
                  <p className="text-sm text-gray-400">{t('storage.statsTurnsShort')}</p>
                </div>
                <div className="border border-gray-700 rounded-lg p-4 bg-gray-800 text-center">
                  <p className="text-2xl font-bold text-gray-100">
                    {storageData.database
                      ? formatBytes(storageData.database.fileSizeBytes)
                      : '-'}
                  </p>
                  <p className="text-sm text-gray-400">{t('storage.statsDbSizeShort')}</p>
                </div>
              </div>

              <div className="border border-gray-700 rounded-lg p-6 bg-gray-800">
                <h3 className="text-lg font-semibold mb-2 text-gray-100">
                  {t('storage.exportTitleShort')}
                </h3>
                <p className="text-sm text-gray-400 mb-4">
                  {t('storage.exportDescriptionShort')}
                </p>
                <button
                  onClick={handleExport}
                  disabled={exporting}
                  className="px-5 py-2 bg-teal-600 text-white text-sm font-medium rounded-md disabled:opacity-50"
                >
                  {exporting ? t('storage.exporting') : t('storage.exportButtonShort')}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
