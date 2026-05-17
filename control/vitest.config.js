import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Mirrors the @/* alias defined in jsconfig.json so vitest can follow imports
// through modules that use the Next.js-style alias (notably lib/mcp/*).
const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(here, '.'),
    },
  },
});
