import Link from 'next/link';
import { ApiKeyRepository } from '@/lib/db/repositories/apiKeys';

async function getKeyState() {
  const keys = await ApiKeyRepository.findByUserId('local');
  return {
    hasKey: keys.length > 0,
    defaultProvider: keys.find((k) => k.isDefault)?.provider || keys[0]?.provider || null,
  };
}

export default async function HomePage() {
  const { hasKey, defaultProvider } = await getKeyState();

  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="max-w-3xl w-full space-y-10">
        <header className="space-y-4">
          <h1 className="text-5xl font-semibold tracking-tight">Mojulo-Lite</h1>
          <p className="text-lg text-[color:var(--text-secondary)]">
            Portable AI bot compiler. Build a bot via wizard or chat builder, download a
            zip, run{' '}
            <code className="bg-[color:var(--surface-elevated)] px-2 py-0.5 rounded">
              docker compose up
            </code>
            .
          </p>
        </header>

        {!hasKey && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
            <p className="font-medium text-amber-300">One-time setup required</p>
            <p className="mt-1 text-[color:var(--text-secondary)]">
              Add your LLM provider API key on{' '}
              <Link href="/settings" className="underline">Settings</Link> to
              unlock the builders. The same key powers the chat builder and gets
              baked into every bot you compile.
            </p>
          </div>
        )}
        {hasKey && (
          <p className="text-sm text-[color:var(--text-muted)]">
            Using{' '}
            <span className="text-[color:var(--brand-teal)] font-medium">
              {defaultProvider}
            </span>{' '}
            as your default provider.{' '}
            <Link href="/settings" className="underline">Change</Link>
          </p>
        )}

        <section className="grid sm:grid-cols-2 gap-4">
          <BuilderCard
            href="/chat-builder"
            title="Chat builder"
            description='Describe the bot you want. Claude proposes the protocols, you confirm, it compiles a zip.'
            disabled={!hasKey}
          />
          <BuilderCard
            href="/bot-factory/modular"
            title="Wizard"
            description="Classic step-by-step: pick your protocols, fill the forms, download the artifact."
            disabled={!hasKey}
          />
          <BuilderCard
            href="/dashboard"
            title="My bots"
            description="Every bot you've compiled, with a download link for its portable artifact."
            disabled={false}
          />
          <BuilderCard
            href="/settings"
            title="Settings"
            description="Your LLM provider API key. Powers the chat builder and gets baked into every bot you compile."
            disabled={false}
            highlight={!hasKey}
          />
        </section>
      </div>
    </main>
  );
}

function BuilderCard({ href, title, description, disabled, highlight }) {
  const className = [
    'block rounded-2xl border p-6 transition',
    disabled
      ? 'border-[color:var(--border-color)] bg-[color:var(--surface-primary)]/50 opacity-60 pointer-events-none'
      : 'border-[color:var(--border-color)] bg-[color:var(--surface-primary)] hover:bg-[color:var(--surface-elevated)]',
    highlight ? 'ring-2 ring-amber-400/60' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Link href={disabled ? '/settings?gate=no-key' : href} className={className}>
      <h2 className="text-xl font-semibold mb-2">{title}</h2>
      <p className="text-sm text-[color:var(--text-secondary)]">{description}</p>
      {disabled && (
        <p className="mt-3 text-xs text-amber-300">Add an API key first →</p>
      )}
    </Link>
  );
}
