// Helper functions for analytics and search term extraction

/**
 * Extracts and counts terms from user prompts
 * @param {string[]} prompts - Array of user prompt strings
 * @param {Object} options - Configuration options
 * @param {number} options.ngramSize - Size of n-grams (1=unigrams, 2=bigrams, 3=trigrams)
 * @param {number} options.minLength - Minimum word length to include
 * @param {number} options.limit - Maximum number of terms to return
 * @returns {Array<{term: string, count: number}>} Sorted array of terms with counts
 */
function extractSearchTerms(prompts, options = {}) {
    const {
        ngramSize = 1,
        minLength = 3,
        limit = 50
    } = options;

    // Common stop words to exclude
    const stopWords = new Set([
        'the', 'is', 'are', 'was', 'were', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at',
        'to', 'for', 'of', 'with', 'by', 'from', 'as', 'into', 'like', 'through', 'after',
        'over', 'between', 'out', 'against', 'during', 'without', 'before', 'under', 'around',
        'among', 'it', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'we', 'they',
        'what', 'which', 'who', 'when', 'where', 'why', 'how', 'all', 'each', 'every', 'both',
        'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own',
        'same', 'so', 'than', 'too', 'very', 'can', 'will', 'just', 'should', 'now', 'my',
        'me', 'do', 'does', 'did', 'have', 'has', 'had', 'am', 'been', 'being', 'would',
        'could', 'there', 'their', 'if', 'then', 'else', 'get', 'got', 'about', 'also'
    ]);

    const termCounts = new Map();

    for (const prompt of prompts) {
        // Remove form submission tokens: {fieldname_filled} or {fieldname_skipped}
        let cleanedPrompt = prompt.replace(/\{[a-zA-Z0-9_]+(filled|skipped)\}/g, '');

        // Convert to lowercase and extract words
        cleanedPrompt = cleanedPrompt.toLowerCase();

        // Split into words (alphanumeric sequences)
        const words = cleanedPrompt.match(/\b[a-z0-9]+\b/g) || [];

        // Filter words
        const filteredWords = words.filter(word =>
            word.length >= minLength && !stopWords.has(word)
        );

        if (ngramSize === 1) {
            // Unigrams (single words)
            for (const word of filteredWords) {
                termCounts.set(word, (termCounts.get(word) || 0) + 1);
            }
        } else {
            // N-grams (phrases)
            for (let i = 0; i <= filteredWords.length - ngramSize; i++) {
                const ngram = filteredWords.slice(i, i + ngramSize).join(' ');
                termCounts.set(ngram, (termCounts.get(ngram) || 0) + 1);
            }
        }
    }

    // Convert to array and sort by count
    const sortedTerms = Array.from(termCounts.entries())
        .map(([term, count]) => ({ term, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);

    return sortedTerms;
}

module.exports = {
    extractSearchTerms
};
