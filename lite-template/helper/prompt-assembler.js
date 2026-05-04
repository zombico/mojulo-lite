// RAG retrieval + LLM generate call. Pure function: all runtime state (llm
// client, rag instance, caches) is injected so the same logic runs inside the
// bot container and inside the control plane preview.
//
// Vector RAG only: cross-lingual semantics are handled by the multilingual
// embedding model itself, so we just embed the raw query and return the
// top-k. No rewrite ladder, no locale detection, no glossary expansion.

const FORM_SUBMISSION_MARKER = /\{[a-zA-Z0-9_]+(filled|skipped)\}/;

async function assemblePrompt({
  userPrompt,
  instructions,
  ragInstance = null,
  llmClient,
  conversationHistory = null,
}) {
  const isFormSubmission = FORM_SUBMISSION_MARKER.test(userPrompt);

  let ragContext = '';
  let ragSources = null;

  if (ragInstance && ragInstance.isLoaded && !isFormSubmission) {
    const results = await ragInstance.search(userPrompt, 3);
    if (results) {
      ragContext = '\n\nRelevant information from documents:\n' + results;
      ragSources = ragInstance.getLastSearchResults();
    } else {
      ragContext = '\n\nNote: No matching information found in the available documents for this query.';
    }
  }

  const result = await llmClient.generate(instructions, userPrompt, ragContext, conversationHistory);
  return { result, ragSources, expandedQuery: null };
}

module.exports = { assemblePrompt };
