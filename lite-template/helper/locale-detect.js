// Query-side language detection. Replaces the prior Unicode-range counter
// with `franc-min` (trigram-profile matching, deterministic, ~10KB, no model
// files). Used by prompt-assembler to pick stopwords per turn and to decide
// whether cross-lingual rewriting is needed.
//
// franc-min v6 is ESM-only; we lazy-load it via dynamic import() since the
// container is CommonJS. The first detectLocale() call awaits the import;
// subsequent calls reuse the cached module.
//
// Returns { locale, confidence } where confidence is franc's normalized
// trigram-distance score (0..1, higher = better match). Caller decides what
// to do with low-confidence results (see prompt-assembler's session-lock).

const { STOPWORDS } = require('./stopwords');

// franc-min returns ISO 639-3; the rest of our system uses 639-1.
// Restricted to languages we actually care about — keeping the `only` filter
// tight prevents franc from confidently picking Esperanto or Welsh from a
// short ambiguous string.
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

const NON_LATIN_LOCALES = new Set(['ja', 'zh', 'ko', 'th']);

let francAllPromise = null;
function loadFrancAll() {
  if (!francAllPromise) {
    francAllPromise = import('franc-min').then((m) => m.francAll);
  }
  return francAllPromise;
}

/**
 * Detect the language of `text`.
 *
 * @param {string} text
 * @param {object} [opts]
 * @param {string} [opts.defaultLocale='en']  Returned when input is missing,
 *   too short for franc to score, or detected as 'und'.
 * @returns {Promise<{ locale: string, confidence: number }>}
 */
async function detectLocale(text, { defaultLocale = 'en' } = {}) {
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return { locale: defaultLocale, confidence: 0 };
  }

  const francAll = await loadFrancAll();
  // minLength=10 mirrors franc's default — below it franc returns 'und'.
  // `only` restricts the candidate set to languages we explicitly support.
  const results = francAll(text, { minLength: 10, only: SUPPORTED_ISO3 });

  if (!results || results.length === 0) {
    return { locale: defaultLocale, confidence: 0 };
  }

  const [topCode, topScore] = results[0];
  if (topCode === 'und') {
    return { locale: defaultLocale, confidence: 0 };
  }

  return {
    locale: ISO3_TO_ISO1[topCode] || defaultLocale,
    confidence: topScore,
  };
}

/**
 * Whether we have first-class stopword support for a locale. Used by callers
 * that want to know whether a detected locale is "fully supported" vs just
 * "detected but degrades to empty stopwords."
 */
function isSupportedLocale(locale) {
  return Object.prototype.hasOwnProperty.call(STOPWORDS, locale);
}

module.exports = {
  detectLocale,
  isSupportedLocale,
  NON_LATIN_LOCALES,
};
