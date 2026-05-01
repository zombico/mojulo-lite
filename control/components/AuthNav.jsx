'use client';

// Lite is single-user — there's no sign-in/out flow. This is a minimal top
// bar so the copied wizard's layout doesn't collapse; it just links home and
// to settings.

import Link from 'next/link';

export default function AuthNav() {
  return (
    <nav className="w-full border-b border-[color:var(--border-color)] bg-[color:var(--surface-primary)] px-4 py-2 flex items-center justify-between text-sm">
      <Link href="/" className="font-semibold tracking-tight">
        Mojulo-Lite
      </Link>
      <div className="flex items-center gap-4 text-[color:var(--text-muted)]">
        <Link href="/dashboard" className="hover:text-white">
          My bots
        </Link>
        <Link href="/settings" className="hover:text-white">
          Settings
        </Link>
      </div>
    </nav>
  );
}
