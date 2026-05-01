// English stopwords. Filtered out of query keyword extraction in
// SimpleRAG.search() to reduce noise from high-frequency function words.
//
// Note: the Latin-path tokenizer already drops tokens shorter than 3 chars
// before consulting this set, so very short entries (a, is, of) are
// effectively dead. Kept for clarity and in case the length filter changes.

module.exports = new Set([
  'what', 'the', 'is', 'at', 'which', 'on', 'and', 'a', 'to', 'are', 'as',
  'was', 'with', 'for', 'of', 'in', 'by', 'an', 'be', 'or', 'that',
  'this', 'will', 'you', 'have', 'it', 'not', 'can', 'from', 'they',
  'we', 'been', 'has', 'had', 'do', 'would', 'could', 'should',
]);
