// Stopword registry. Adding a language = drop a file here, register it below.
//
// Stopwords are looked up by *query* locale (detected per turn in
// prompt-assembler.js), not by document locale. Doc-side tokenization paradigm
// (Latin vs bigram) is a separate concern handled in rag.js.
//
// Unknown / unsupported locales fall through to EMPTY_STOPWORDS — retrieval
// degrades gracefully (no filtering) rather than erroring.

const en = require('./en');
const fr = require('./fr');
const es = require('./es');
const de = require('./de');

const EMPTY_STOPWORDS = new Set();

const STOPWORDS = {
  en,
  fr,
  es,
  de,
};

function getStopwords(locale) {
  return STOPWORDS[locale] || EMPTY_STOPWORDS;
}

module.exports = { getStopwords, EMPTY_STOPWORDS, STOPWORDS };
