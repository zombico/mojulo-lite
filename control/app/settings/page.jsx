'use client';

import { Suspense, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import useSWR, { mutate } from 'swr';
import { locales, localeNames } from '@/i18n/config';

const fetcher = (url) => fetch(url).then((r) => r.json());

const LLM_PROVIDER_IDS_LIST = ['anthropic', 'openai', 'gemini', 'cohere', 'bedrock'];
const INFRA_PROVIDER_IDS_LIST = ['fly'];

const LLM_PROVIDER_IDS = new Set(LLM_PROVIDER_IDS_LIST);
const INFRA_PROVIDER_IDS = new Set(INFRA_PROVIDER_IDS_LIST);

const TAB_IDS = ['llm', 'provider', 'language'];

function KeySection({ title, description, providers, keys, isLoading, defaultName, placeholderFor }) {
  const t = useTranslations('settings.mojulo');
  const [name, setName] = useState(defaultName);
  const [provider, setProvider] = useState(providers[0].id);
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
      setError(data.error || t('form.saveError'));
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
    <div className="space-y-4">
      <header>
        <h2 className="text-2xl font-semibold">{title}</h2>
        <p className="text-[color:var(--text-secondary)] mt-1 text-sm">{description}</p>
      </header>

      <section className="rounded-2xl border border-[color:var(--border-color)] bg-[color:var(--surface-primary)] p-6 space-y-4">
        <h3 className="text-lg font-semibold">{t('form.addKey')}</h3>
        <form onSubmit={save} className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[color:var(--text-muted)]">{t('form.name')}</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="rounded-lg bg-[color:var(--surface-elevated)] px-3 py-2 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[color:var(--text-muted)]">{t('form.provider')}</span>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                className="rounded-lg bg-[color:var(--surface-elevated)] px-3 py-2 text-sm"
              >
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[color:var(--text-muted)]">{t('form.apiKey')}</span>
            <input
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={placeholderFor(provider)}
              className="rounded-lg bg-[color:var(--surface-elevated)] px-3 py-2 text-sm font-mono"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={makeDefault}
              onChange={(e) => setMakeDefault(e.target.checked)}
            />
            {t('form.makeDefault')}
          </label>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={saving || !apiKey}
            className="rounded-lg px-4 py-2 bg-[color:var(--brand-teal)] text-[color:var(--brand-navy)] font-semibold disabled:opacity-50"
          >
            {saving ? t('form.saving') : t('form.save')}
          </button>
        </form>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold">{t('list.title')}</h3>
        {isLoading && <p className="text-sm text-[color:var(--text-muted)]">{t('list.loading')}</p>}
        {!isLoading && keys.length === 0 && (
          <p className="text-sm text-[color:var(--text-muted)]">{t('list.empty')}</p>
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
                      {t('list.defaultBadge')}
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
                    {t('list.makeDefault')}
                  </button>
                )}
                <button
                  onClick={() => remove(k.id)}
                  className="text-xs px-2 py-1 rounded border border-red-500/50 text-red-400"
                >
                  {t('list.delete')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function LanguageSection() {
  const t = useTranslations('settings.mojulo.language');
  const current = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const onChange = (event) => {
    const next = event.target.value;
    document.cookie = `NEXT_LOCALE=${next}; path=/; max-age=31536000; samesite=lax`;
    startTransition(() => {
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-2xl font-semibold">{t('title')}</h2>
        <p className="text-[color:var(--text-secondary)] mt-1 text-sm">{t('description')}</p>
      </header>

      <section className="rounded-2xl border border-[color:var(--border-color)] bg-[color:var(--surface-primary)] p-6 space-y-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[color:var(--text-muted)]">{t('label')}</span>
          <select
            value={current}
            onChange={onChange}
            disabled={isPending}
            className="rounded-lg bg-[color:var(--surface-elevated)] px-3 py-2 text-sm"
          >
            {locales.map((id) => (
              <option key={id} value={id}>
                {localeNames[id] || id}
              </option>
            ))}
          </select>
        </label>
      </section>
    </div>
  );
}

function SettingsPageInner() {
  const t = useTranslations('settings.mojulo');
  const searchParams = useSearchParams();
  const gate = searchParams.get('gate');
  const { data, isLoading } = useSWR('/api/settings/api-keys', fetcher);
  const allKeys = data?.keys || [];
  const llmKeys = allKeys.filter((k) => LLM_PROVIDER_IDS.has(k.provider));
  const infraKeys = allKeys.filter((k) => INFRA_PROVIDER_IDS.has(k.provider));
  const [activeTab, setActiveTab] = useState('llm');

  const llmProviders = LLM_PROVIDER_IDS_LIST.map((id) => ({
    id,
    label: t(`llm.providers.${id}`),
  }));
  const infraProviders = INFRA_PROVIDER_IDS_LIST.map((id) => ({
    id,
    label: t(`provider.providers.${id}`),
  }));

  function llmPlaceholder(provider) {
    if (provider === 'bedrock') return t('llm.bedrockPlaceholder');
    return t('llm.placeholder');
  }

  function infraPlaceholder(provider) {
    if (provider === 'fly') return t('provider.placeholder');
    return '';
  }

  return (
    <main className="min-h-[calc(100vh-33px)] p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <header>
          <h1 className="text-3xl font-semibold">{t('title')}</h1>
          <p className="text-[color:var(--text-secondary)] mt-2">{t('subtitle')}</p>
          {gate === 'no-key' && llmKeys.length === 0 && (
            <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
              {t('noKeyGate')}
            </div>
          )}
        </header>

        <div className="grid gap-8 md:grid-cols-[220px_1fr]">
          <nav className="space-y-1">
            {TAB_IDS.map((id) => {
              const isActive = activeTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveTab(id)}
                  className={`w-full text-left rounded-lg px-3 py-2 text-sm transition-colors ${
                    isActive
                      ? 'bg-[color:var(--surface-primary)] border border-[color:var(--border-color)] font-semibold'
                      : 'text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-primary)]'
                  }`}
                >
                  {t(`tabs.${id}`)}
                </button>
              );
            })}
          </nav>

          <div>
            {activeTab === 'llm' && (
              <KeySection
                title={t('llm.title')}
                description={t('llm.description')}
                providers={llmProviders}
                keys={llmKeys}
                isLoading={isLoading}
                defaultName={t('llm.defaultName')}
                placeholderFor={llmPlaceholder}
              />
            )}
            {activeTab === 'provider' && (
              <KeySection
                title={t('provider.title')}
                description={t('provider.description')}
                providers={infraProviders}
                keys={infraKeys}
                isLoading={isLoading}
                defaultName={t('provider.defaultName')}
                placeholderFor={infraPlaceholder}
              />
            )}
            {activeTab === 'language' && <LanguageSection />}
          </div>
        </div>
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
