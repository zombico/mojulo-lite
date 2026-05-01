/**
 * RAG Locale Detection
 *
 * Detects which locale a body of text is written in via `franc-min` (trigram-
 * profile matching, deterministic, no model files). Used by:
 *  - generate-rag route → conditionally append synonym/romanization clause to
 *    the summary prompt for non-Latin locales.
 *  - DockerDeployer → set `rag.locale` in the emitted config.json so the
 *    container's keyword RAG picks the right tokenizer paradigm and the
 *    container-side query detector has a sensible doc-locale baseline.
 *
 * Currently returns one of: 'en' | 'fr' | 'es' | 'de' | 'ja' | 'zh' | 'ko' | 'th'.
 * Adding a language: register it in `ISO3_TO_ISO1` below and (if non-Latin)
 * add to `NON_LATIN_LOCALES`. Stopwords for the new language live container-
 * side in lite-template/helper/stopwords/<locale>.js.
 *
 * Sync API: franc-min is synchronous. Next.js handles ESM imports natively
 * so no dynamic-import bridge is needed here (unlike the CommonJS container).
 */

import { francAll } from 'franc-min';

// franc-min returns ISO 639-3 codes; the rest of the system uses 639-1.
// The `only` filter in francAll restricts candidates to this set so franc
// can't confidently mislabel a short string as Esperanto, Welsh, etc.
const ISO3_TO_ISO1 = {
  eng: 'en',
  fra: 'fr',
  spa: 'es',
  deu: 'de',
  jpn: 'ja',
  cmn: 'zh', // Mandarin
  kor: 'ko',
  tha: 'th',
};

const SUPPORTED_ISO3 = Object.keys(ISO3_TO_ISO1);

export const NON_LATIN_LOCALES = new Set(['ja', 'zh', 'ko', 'th']);

/**
 * @param {string} text
 * @returns {'en' | 'fr' | 'es' | 'de' | 'ja' | 'zh' | 'ko' | 'th'}
 */
export function detectLocale(text) {
  if (!text || typeof text !== 'string') return 'en';

  // Sample up to 4KB — enough trigram signal, cheap on huge docs.
  const sample = text.length > 4000 ? text.slice(0, 4000) : text;
  const results = francAll(sample, { minLength: 10, only: SUPPORTED_ISO3 });

  if (!results || results.length === 0) return 'en';

  const [topCode] = results[0];
  if (topCode === 'und') return 'en';

  return ISO3_TO_ISO1[topCode] || 'en';
}

/**
 * Pick a single locale across multiple texts (e.g., a multi-doc corpus).
 *
 * Priority rule: if any document is non-Latin, return the most common
 * non-Latin locale. The bot's tokenizer paradigm (Latin vs bigram) is set
 * once per deployment, and any non-Latin doc requires the bigram path to
 * be reachable at all. For all-Latin corpora, return the most common
 * detected locale (default 'en' on empty / tie).
 *
 * @param {string[]} texts
 * @returns {'en' | 'fr' | 'es' | 'de' | 'ja' | 'zh' | 'ko' | 'th'}
 */
export function detectCorpusLocale(texts) {
  if (!Array.isArray(texts) || texts.length === 0) return 'en';

  const tally = {};
  for (const t of texts) {
    const loc = detectLocale(t);
    tally[loc] = (tally[loc] || 0) + 1;
  }

  const nonLatin = Object.keys(tally).filter((l) => NON_LATIN_LOCALES.has(l));
  if (nonLatin.length > 0) {
    return nonLatin.sort((a, b) => tally[b] - tally[a])[0];
  }

  const ranked = Object.entries(tally).sort((a, b) => b[1] - a[1]);
  return ranked.length > 0 ? ranked[0][0] : 'en';
}
