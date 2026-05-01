// RAG retrieval + LLM generate call. Pure function: all runtime state (llm
// client, rag instance, caches) is injected so the same logic runs inside the
// bot container and inside the control plane preview.
//
// Vector RAG (ragInstance.mode === 'vector'): cross-lingual semantics are
// handled by the multilingual embedding model itself, so we just embed the
// raw query and return the top-k. No rewrite ladder.
//
// Keyword RAG (ragInstance.mode === 'keyword'): BM25 cannot bridge languages
// or vocabulary gaps on its own, so we run a locale-aware rewrite ladder:
//   1. PROACTIVE — if the user query language differs from the document
//      language, rewrite into the doc language *before* the first search.
//   2. FALLBACK — on weak / zero results, rewrite via the ragSummary
//      glossary and keep whichever set scores higher.
//
// The rewrite prompt receives the ragSummary, which already contains
// per-document synonyms / romanizations / inflected forms (added at build
// time by generate-rag for non-Latin locales). That makes the rewrite act as
// a terminology bridge, not just a literal translation.

const { detectLocale, NON_LATIN_LOCALES } = require('./locale-detect');

const FORM_SUBMISSION_MARKER = /\{[a-zA-Z0-9_]+(filled|skipped)\}/;

// franc-min returns a normalized score in [0, 1]. At ≥0.9 we trust the
// detection enough to lock it for the rest of the conversation; below that
// we use it for the current turn but don't commit, in case turn 1 was a
// short ambiguous greeting that misled the detector.
const LOCK_THRESHOLD = 0.9;
const DEFAULT_LOCALE = 'en';

const LOCALE_NAMES = {
  ja: 'Japanese',
  zh: 'Chinese',
  ko: 'Korean',
  th: 'Thai',
  en: 'English',
};

function buildRewriteInstructions(targetLocale) {
  const targetName = LOCALE_NAMES[targetLocale] || targetLocale;
  return `You are rewriting a user's query so it can be matched against documents using keyword search.

Document language: ${targetName} (${targetLocale})

Rewrite the user's query so that:
1. It is written in ${targetName} — translate if the user wrote in another language.
2. It uses the EXACT terminology that appears in the document summary below
   (technical terms, synonyms, domain vocabulary, native-script forms of proper
   nouns). The summary contains the words the documents actually use; align the
   query to those words.
3. It is a single short declarative sentence or noun phrase, optimized for
   keyword retrieval — not a question, not conversational.

Output ONLY the rewritten query. No preamble, no explanation, no quotes, no
labels. A single line of plain ${targetName}.`;
}

async function rewriteQuery({ prompt, llmClient, ragSummary, targetLocale, expansionCache }) {
  const cacheKey = `${targetLocale}::${prompt.toLowerCase().trim()}`;
  if (expansionCache && expansionCache.has(cacheKey)) {
    return expansionCache.get(cacheKey);
  }
  const instructions = buildRewriteInstructions(targetLocale);
  const result = await llmClient.generate(instructions, prompt, ragSummary, []);
  const rewritten = (result.response || '').trim();
  if (expansionCache) {
    expansionCache.set(cacheKey, rewritten);
  }
  return rewritten;
}

// Resolve the query locale for this turn. If the conversation already has a
// locked locale (a prior turn detected with high confidence), reuse it.
// Otherwise run franc-min and lock if the score clears LOCK_THRESHOLD.
// Below the floor we use the detection for *this* turn only — no commit.
async function resolveQueryLocale({ userPrompt, conversationId, sessionLocales }) {
  if (conversationId && sessionLocales && sessionLocales.has(conversationId)) {
    return sessionLocales.get(conversationId);
  }
  const { locale, confidence } = await detectLocale(userPrompt, {
    defaultLocale: DEFAULT_LOCALE,
  });
  if (conversationId && sessionLocales && confidence >= LOCK_THRESHOLD) {
    sessionLocales.set(conversationId, locale);
    console.log(`🔒 Locked session locale: ${locale} (confidence ${confidence.toFixed(2)})`);
  } else {
    console.log(`🌍 Detected locale: ${locale} (confidence ${confidence.toFixed(2)}, not locked)`);
  }
  return locale;
}

async function assemblePrompt({
  userPrompt,
  instructions,
  ragSummary = '',
  ragInstance = null,
  llmClient,
  conversationHistory = null,
  expansionCache = null,
  sessionLocales = null,
  conversationId = null,
}) {
  const isFormSubmission = FORM_SUBMISSION_MARKER.test(userPrompt);

  let ragContext = '';
  let ragSources = null;
  let expandedQuery = null;

  if (ragInstance && ragInstance.isLoaded && !isFormSubmission && ragInstance.mode === 'vector') {
    // Vector retrieval handles cross-lingual semantics natively via the
    // multilingual embedding model — no rewrite needed. Skip the entire
    // locale/rewrite ladder and use the raw query.
    const results = await ragInstance.search(userPrompt, 3);
    if (results) {
      ragContext = '\n\nRelevant information from documents:\n' + results;
      ragSources = ragInstance.getLastSearchResults();
    } else {
      ragContext = '\n\nNote: No matching information found in the available documents for this query.';
    }
  } else if (ragInstance && ragInstance.isLoaded && !isFormSubmission) {
    const docLocale = ragInstance.locale || 'en';
    const queryLocale = await resolveQueryLocale({
      userPrompt,
      conversationId,
      sessionLocales,
    });

    // 1. Proactive rewrite for cross-lingual retrieval. BM25 over a
    //    Japanese corpus has no chance of matching an English query, no
    //    matter how good the stopword list is.
    let firstQuery = userPrompt;
    const crossLingual =
      NON_LATIN_LOCALES.has(docLocale) && queryLocale !== docLocale;
    if (crossLingual) {
      try {
        expandedQuery = await rewriteQuery({
          prompt: userPrompt,
          llmClient,
          ragSummary,
          targetLocale: docLocale,
          expansionCache,
        });
        if (expandedQuery) {
          console.log(`🌐 Cross-lingual rewrite (${queryLocale}→${docLocale}): "${expandedQuery}"`);
          firstQuery = expandedQuery;
        }
      } catch (error) {
        console.error('Cross-lingual rewrite failed, falling back to raw query:', error.message);
      }
    }

    // 2. First search — with rewritten query if cross-lingual, else raw.
    //    When cross-lingual rewrite already ran, firstQuery is in docLocale
    //    so use docLocale's stopwords; otherwise the raw query is in
    //    queryLocale.
    const firstSearchLocale = crossLingual ? docLocale : queryLocale;
    // VectorRAG.search is async; SimpleRAG.search is sync. `await` works for both.
    const firstSearchResults = await ragInstance.search(firstQuery, 3, 1, firstSearchLocale);
    const firstSources = firstSearchResults ? ragInstance.getLastSearchResults() : null;
    const firstTopScore = firstSources?.[0]?.score ?? 0;

    // Non-Latin uses bigram tokenization, so scores are denser than Latin.
    // A single bigram exact-match scores 3, which is often coincidental
    // (any 2-char sequence has high collision probability across chunks).
    // Floor of 5 means "at least 2 distinct bigrams landed" — a real signal
    // of overlap, not a single accidental match. Below that, fire the
    // summary-driven rewrite as a second opinion.
    const WEAK_SCORE_FLOOR = 5;
    const isWeakNonLatin =
      firstSearchResults &&
      !crossLingual &&
      NON_LATIN_LOCALES.has(docLocale) &&
      firstTopScore < WEAK_SCORE_FLOOR;

    if (firstSearchResults && !isWeakNonLatin) {
      ragContext = '\n\nRelevant information from documents:\n' + firstSearchResults;
      ragSources = firstSources;
    } else if (firstSearchResults && isWeakNonLatin) {
      // 3a. Lower-the-bar fallback: weak first hit on non-Latin. Rewrite via
      //     summary glossary, then keep whichever set scores higher. We don't
      //     blindly replace — if the rewrite scores worse, the original
      //     (weak-but-real) match wins.
      try {
        expandedQuery = await rewriteQuery({
          prompt: userPrompt,
          llmClient,
          ragSummary,
          targetLocale: docLocale,
          expansionCache,
        });
        if (expandedQuery) {
          console.log(`📝 Weak-result rewrite (${docLocale}, top=${firstTopScore}): "${expandedQuery}"`);
          // Rewrite stays in docLocale, so stopwords match docLocale.
          const rewriteResults = await ragInstance.search(expandedQuery, 3, 1, docLocale);
          const rewriteSources = rewriteResults ? ragInstance.getLastSearchResults() : null;
          const rewriteTopScore = rewriteSources?.[0]?.score ?? 0;
          if (rewriteResults && rewriteTopScore > firstTopScore) {
            ragContext = '\n\nRelevant information from documents:\n' + rewriteResults;
            ragSources = rewriteSources;
          } else {
            ragContext = '\n\nRelevant information from documents:\n' + firstSearchResults;
            ragSources = firstSources;
          }
        } else {
          ragContext = '\n\nRelevant information from documents:\n' + firstSearchResults;
          ragSources = firstSources;
        }
      } catch (error) {
        console.error('Weak-result rewrite failed, keeping first results:', error.message);
        ragContext = '\n\nRelevant information from documents:\n' + firstSearchResults;
        ragSources = firstSources;
      }
    } else if (!crossLingual) {
      // 3b. Zero-result fallback for same-language vocabulary mismatch.
      //     User said 衝突補償 but docs use 対物賠償 — same language,
      //     different terminology. Rewrite uses the summary as a glossary.
      try {
        expandedQuery = await rewriteQuery({
          prompt: userPrompt,
          llmClient,
          ragSummary,
          targetLocale: docLocale,
          expansionCache,
        });
        if (expandedQuery) {
          console.log(`📝 Terminology rewrite (${docLocale}): "${expandedQuery}"`);
          // Rewrite stays in docLocale, so stopwords match docLocale.
          const extendedResults = await ragInstance.search(expandedQuery, 3, 1, docLocale);
          if (extendedResults) {
            ragContext = '\n\nRelevant information from documents:\n' + extendedResults;
            ragSources = ragInstance.getLastSearchResults();
          } else {
            console.log('No results found after terminology rewrite');
            ragContext = '\n\nNote: No matching information found in the available documents for this query.';
          }
        }
      } catch (error) {
        console.error('Terminology rewrite failed:', error.message);
        ragContext = '\n\nNote: No matching information found in the available documents for this query.';
      }
    } else {
      // Cross-lingual rewrite already happened and still found nothing.
      ragContext = '\n\nNote: No matching information found in the available documents for this query.';
    }
  }

  const result = await llmClient.generate(instructions, userPrompt, ragContext, conversationHistory);
  return { result, ragSources, expandedQuery };
}

module.exports = { assemblePrompt };
