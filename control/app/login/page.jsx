'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

export default function LoginPage() {
  const t = useTranslations('login');
  const router = useRouter();
  const params = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        setError(t('invalid'));
        setBusy(false);
        return;
      }
      const next = params.get('next') || '/';
      router.replace(next);
    } catch {
      setError(t('invalid'));
      setBusy(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-3rem)] flex items-center justify-center px-4">
      <style>{`
        @keyframes mj-deal {
          from { opacity: 0; transform: translateY(28px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0)    scale(1); }
        }
        .mj-card { transform-box: fill-box; transform-origin: 50% 100%; opacity: 0; animation: mj-deal 0.7s ease-out forwards; }
        .mj-card-1 { animation-delay: 0ms;   }
        .mj-card-2 { animation-delay: 120ms; }
        .mj-card-3 { animation-delay: 240ms; }
        @keyframes mj-fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .mj-fade { opacity: 0; animation: mj-fade 0.5s 0.45s ease-out forwards; }
      `}</style>

      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8 select-none">
          <Logo />
          <h1 className="mt-5 text-xl font-semibold tracking-tight mj-fade">Mojulo-Lite</h1>
          <p className="mt-1 text-sm text-[color:var(--text-muted)] mj-fade">{t('subtitle')}</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-3 mj-fade" autoComplete="on">
          <input
            type="text"
            name="username"
            autoComplete="username"
            autoFocus
            required
            placeholder={t('username')}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full px-3 py-2 rounded-md bg-[color:var(--surface-primary)] border border-[color:var(--border-color)] focus:outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-400/40 transition-colors"
          />
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            required
            placeholder={t('password')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 rounded-md bg-[color:var(--surface-primary)] border border-[color:var(--border-color)] focus:outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-400/40 transition-colors"
          />
          {error ? (
            <p className="text-sm text-red-400" role="alert" aria-live="polite">{error}</p>
          ) : null}
          <button
            type="submit"
            disabled={busy}
            className="w-full px-3 py-2 rounded-md bg-teal-500 hover:bg-teal-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-medium transition-colors"
          >
            {busy ? t('signingIn') : t('signIn')}
          </button>
        </form>
      </div>
    </div>
  );
}

function Logo() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="160 115 70 70"
      className="w-24 h-24"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="login-back" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1d6f68" />
          <stop offset="0.55" stopColor="#134e4a" />
          <stop offset="1" stopColor="#0a2a28" />
        </linearGradient>
        <linearGradient id="login-mid" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7af0dc" />
          <stop offset="0.5" stopColor="#2dd4bf" />
          <stop offset="1" stopColor="#138a78" />
        </linearGradient>
        <linearGradient id="login-front" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b9f5e8" />
          <stop offset="0.5" stopColor="#5eead4" />
          <stop offset="1" stopColor="#26b8a0" />
        </linearGradient>
      </defs>
      <g className="mj-card mj-card-1">
        <rect
          x="-9.25" y="-19.55" width="11" height="40" rx="7.75"
          fill="url(#login-back)"
          transform="translate(183.8, 150) rotate(17)"
        />
      </g>
      <g className="mj-card mj-card-2">
        <rect
          x="-6.45" y="-21.55" width="11" height="40" rx="7.75"
          fill="url(#login-mid)"
          transform="translate(191, 150) rotate(340)"
        />
      </g>
      <g className="mj-card mj-card-3">
        <rect
          x="-6.00" y="-21.55" width="11" height="40" rx="7.75"
          fill="url(#login-front)"
          transform="translate(206.3, 150) rotate(340)"
        />
      </g>
    </svg>
  );
}
