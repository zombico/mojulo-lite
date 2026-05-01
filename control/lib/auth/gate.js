import { redirect } from 'next/navigation';
import { ApiKeyRepository } from '@/lib/db/repositories/apiKeys';

/**
 * requireLLMKey
 *
 * Gate for pages that depend on an LLM provider key being configured.
 * Mojulo-Lite's builders (wizard + chat builder) all call out to the user's LLM
 * (to compose RAG summaries, generate forms, infer intent, etc.), so they
 * are unusable until a key has been saved on /settings.
 *
 * Use from any server component:
 *
 *   export default async function Page() {
 *     await requireLLMKey();
 *     // ...render
 *   }
 */
export async function requireLLMKey() {
  const keys = await ApiKeyRepository.findByUserId('local');
  if (!keys || keys.length === 0) {
    redirect('/settings?gate=no-key');
  }
  return keys;
}
