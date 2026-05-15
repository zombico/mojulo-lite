import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Read middleware.js as text and assert the matcher pattern. We deliberately
// do not import middleware.js — it pulls 'next/server' which requires the
// Next Edge runtime to resolve. The matcher is a static string literal; a
// text-level assertion is sufficient to catch the regression we care about:
// "we accidentally gated /api/health and broke probes."
const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(join(HERE, 'middleware.js'), 'utf8');

describe('middleware matcher — public-path exemption list', () => {
  it('exempts /api/health (uptime probes must reach the route unauthenticated)', () => {
    expect(SOURCE).toMatch(/api\/health/);
  });

  it('exempts the login route and its API endpoints', () => {
    expect(SOURCE).toMatch(/api\/auth\/login/);
    expect(SOURCE).toMatch(/api\/auth\/logout/);
    expect(SOURCE).toMatch(/\blogin\b/);
  });

  it('exempts Next static asset paths', () => {
    expect(SOURCE).toMatch(/_next\/static/);
    expect(SOURCE).toMatch(/_next\/image/);
  });

  it('exempts the favicon and icon assets', () => {
    expect(SOURCE).toMatch(/favicon\.ico/);
    expect(SOURCE).toMatch(/icon\.svg/);
  });

  it('matcher is a negative-lookahead pattern (not an inverse-of-allow-list)', () => {
    // Documents the matcher's shape so a refactor to a list-based matcher
    // surfaces deliberately. The current form is /((?!exemptions).*).
    expect(SOURCE).toMatch(/\/\(\(\?!/);
  });
});
