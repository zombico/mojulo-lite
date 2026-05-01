// rag.js
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const crypto = require('crypto');
const officeParser = require('officeparser');
const { getStopwords } = require('./stopwords');

const NON_LATIN_LOCALES = new Set(['ja', 'zh', 'ko', 'th']);

// Stopwords now live in helper/stopwords/<locale>.js and are looked up per
// QUERY (not per doc) inside search(). The doc-side tokenizer choice
// (Latin vs bigram) is still keyed off the instance's `this.locale`, set at
// construction from config.rag.locale.

class SimpleRAG {
  constructor(documentsPath = '../documents', isTriageRoute = false, locale = 'en') {
    this.documentsPath = path.resolve(documentsPath); // Use absolute path
    this.documentChunks = [];
    this.isLoaded = false;
    this.loadedFiles = new Set();
    this.lastSearchResults = null; // Store last search results for retrieval
    this.isTriageRoute = isTriageRoute; // When true, extract deploymentId from filename and prepend to chunks
    this.locale = locale || 'en';
    this.isNonLatin = NON_LATIN_LOCALES.has(this.locale);
    this.mode = 'keyword';
  }

  // Locale-aware tokenization.
  //   Latin: whitespace + punctuation split.
  //   Non-Latin (ja/zh/ko/th): NFKC normalize then character bigrams.
  //
  // We deliberately don't use Intl.Segmenter here. ICU's Japanese word breaker
  // is dictionary-based: known terms tokenize cleanly, but loanwords like
  // アドオン, ライドシェア, ロードサービス get split into unpredictable fragments
  // (sometimes single characters). Worse, the same string can segment
  // differently in query vs. document context, so a query word like "ロード"
  // can fail to match a document chunk that contains the exact substring,
  // simply because the doc-side segmenter produced shorter pieces.
  //
  // Bigrams sidestep the dictionary entirely — both sides are tokenized
  // identically, so any shared 2-char window matches. Trade-off is lower
  // precision (more incidental hits) which we offset with the diversity
  // bonus and length-based scoring downstream.
  tokenize(text) {
    if (!text) return [];
    if (this.isNonLatin) {
      // NFKC canonicalizes fullwidth Latin/digits (Ｅｌｉｔｅ → Elite, ０ → 0)
      // and half-width katakana (ｱ → ア) so query and doc tokens match even
      // when source typography differs (common in Japanese PDFs).
      const stripped = text.normalize('NFKC').replace(/\s+/g, '').toLowerCase();
      if (stripped.length === 0) return [];
      // Single-character queries (e.g., "車") can't form a bigram — return
      // the char itself so they're still searchable.
      if (stripped.length === 1) return [stripped];
      const grams = [];
      for (let i = 0; i < stripped.length - 1; i++) {
        grams.push(stripped.slice(i, i + 2));
      }
      return grams;
    }
    // \p{L}\p{N} preserves Latin diacritics (é, à, ç, ñ, ü, ß) and digits
    // across all Unicode scripts. Using \w here would strip diacritics and
    // collapse "café" → "caf", "marché" → "march" — silent precision loss
    // for every non-English Latin language. Mirror of the chunker regex
    // below in splitIntoChunks().
    return text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter(Boolean);
  }

  // Initialize and load all documents
  async initialize() {
    if (this.isLoaded) {
      console.log('📚 RAG already initialized');
      return;
    }
    
    try {
      console.log(`📚 Initializing RAG system from: ${this.documentsPath}`);
      
      // Check if documents directory exists
      if (!fsSync.existsSync(this.documentsPath)) {
        throw new Error(`Documents directory does not exist: ${this.documentsPath}`);
      }
      
      // Clear existing chunks
      this.documentChunks = [];
      this.loadedFiles.clear();
      
      const files = await fs.readdir(this.documentsPath);

      // Supported file extensions
      const supportedExtensions = ['.pdf', '.docx', '.pptx', '.xlsx', '.odt', '.odp', '.ods', '.txt', '.md'];
      const documentFiles = files.filter(file => {
        const ext = path.extname(file).toLowerCase();
        return supportedExtensions.includes(ext);
      });

      if (documentFiles.length === 0) {
        console.log('📄 No supported document files found in documents directory');
        console.log(`   Supported formats: ${supportedExtensions.join(', ')}`);
        this.isLoaded = true;
        return;
      }

      console.log(`📄 Found ${documentFiles.length} document files: ${documentFiles.join(', ')}`);

      const loadPromises = documentFiles.map(file => this.loadDocument(file));
      const results = await Promise.allSettled(loadPromises);
      
      // Log results
      let successCount = 0;
      let failCount = 0;
      
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          successCount++;
        } else {
          failCount++;
          console.error(`❌ Failed to load ${documentFiles[index]}: ${result.reason.message}`);
        }
      });
      
      console.log(`✅ RAG initialized: ${successCount} successful, ${failCount} failed`);
      console.log(`📊 Total chunks: ${this.documentChunks.length}`);
      
      this.isLoaded = true;
      
    } catch (error) {
      console.error('❌ RAG initialization failed:', error.message);
      this.isLoaded = false;
      throw error;
    }
  }

  // Load a single document (now async)
  async loadDocument(filename) {
    try {
      const filePath = path.join(this.documentsPath, filename);

      console.log(`🔄 Processing ${filename}...`);

      // Check if file exists
      const stats = await fs.stat(filePath);
      if (!stats.isFile()) {
        throw new Error(`${filename} is not a file`);
      }

      // Check file size (warn if very large)
      const fileSizeMB = stats.size / (1024 * 1024);
      if (fileSizeMB > 50) {
        console.log(`⚠️ Large file detected: ${filename} (${fileSizeMB.toFixed(2)}MB)`);
      }

      // Parse document - use fs for .txt files, officeParser for others
      const ext = path.extname(filename).toLowerCase();
      let extractedText;

      if (ext === '.txt' || ext === '.md') {
        extractedText = await fs.readFile(filePath, 'utf-8');
      } else {
        extractedText = await officeParser.parseOfficeAsync(filePath);
      }

      if (!extractedText || extractedText.trim().length === 0) {
        throw new Error(`No text extracted from ${filename}`);
      }

      const added = this._ingestText(filename, extractedText);
      if (added === 0) {
        console.log(`⚠️ No usable chunks created from ${filename}`);
        return;
      }
      console.log(`  ✓ Added ${added} chunks from ${filename} (${extractedText.length} chars)`);

    } catch (error) {
      console.error(`❌ Error loading ${filename}:`, error.message);
      throw error; // Re-throw to be handled by caller
    }
  }

  // Build chunks from already-extracted text. Used by loadDocument (after parsing)
  // and loadFromTexts (for the control-plane preview path that has parsed text in DB).
  _ingestText(filename, extractedText) {
    const chunks = this.splitIntoChunks(extractedText, 500);
    if (chunks.length === 0) return 0;

    let deploymentIdPrefix = '';
    if (this.isTriageRoute) {
      const filenameWithoutExt = path.basename(filename, path.extname(filename));
      const underscoreIndex = filenameWithoutExt.indexOf('_');
      if (underscoreIndex > 0) {
        const deploymentId = filenameWithoutExt.substring(0, underscoreIndex);
        deploymentIdPrefix = `deploymentId: ${deploymentId}\n`;
      }
    }

    const totalChunks = chunks.length;
    chunks.forEach((chunk, index) => {
      const content = deploymentIdPrefix + chunk.text.trim();
      const tokens = this.tokenize(content);
      const contentHash = crypto.createHash('sha1').update(content).digest('hex').slice(0, 8);
      this.documentChunks.push({
        id: `${filename}-${index}`,
        filename,
        content,
        chunkIndex: index,
        chunkCount: totalChunks,
        charStart: chunk.charStart ?? null,
        charEnd: chunk.charEnd ?? null,
        contentHash,
        // For non-Latin, "words" don't exist in the whitespace sense — use the
        // tokenizer's count so density bonuses/penalties stay meaningful.
        wordCount: this.isNonLatin ? tokens.length : chunk.text.split(/\s+/).length,
        tokens,
        tokenSet: new Set(tokens),
        createdAt: new Date().toISOString(),
      });
    });

    this.loadedFiles.add(filename);
    return chunks.length;
  }

  // Hydrate from in-memory texts (no filesystem). Mirrors initialize() but skips
  // the directory scan + parser. Returns total chunks added.
  loadFromTexts(items) {
    this.documentChunks = [];
    this.loadedFiles.clear();
    let total = 0;
    for (const { filename, text } of items || []) {
      if (!text || !text.trim()) continue;
      total += this._ingestText(filename, text);
    }
    this.isLoaded = true;
    return total;
  }

  // Improved text chunking with better sentence handling.
  // Latin path: whitespace-based with min-word filter.
  // Non-Latin path: chunks by character count at sentence boundaries that
  //   include full-width punctuation (。！？), and quality-filters by char
  //   length rather than word count (a 500-char Japanese chunk has plenty
  //   of content but few whitespace-delimited "words").
  splitIntoChunks(text, maxChunkSize = 500, overlap = 50) {
    if (this.isNonLatin) {
      return this._splitNonLatin(text, maxChunkSize, overlap);
    }

    // Latin clean-up: strip control chars but keep printable Unicode.
    // \p{L}/\p{N} preserve any letter/number across scripts (defensive — the
    // detector should have routed non-Latin to _splitNonLatin already).
    const cleanText = text
      .replace(/\s+/g, ' ')
      .replace(/[^\p{L}\p{N}\s.,!?;:()"'-]/gu, ' ')
      .trim();

    if (cleanText.length < 50) return [];

    // Sentence tokens with positions in cleanText. Offsets are anchored to
    // cleanText (post-cleanup), so a verifier needs to apply the same
    // normalization to reproduce the slice. The contentHash on each chunk
    // gives a stronger tamper-evident pointer for cross-checking.
    const sentenceRegex = /([^.!?]+)([.!?]+|$)/g;
    const sentences = [];
    let m;
    while ((m = sentenceRegex.exec(cleanText)) !== null) {
      const raw = m[1];
      if (!raw) continue;
      const trimmed = raw.trim();
      if (trimmed.length <= 10) continue;
      const leading = raw.length - raw.trimStart().length;
      const start = m.index + leading;
      sentences.push({ text: trimmed, start, end: start + trimmed.length });
    }

    const chunks = [];
    let currentChunk = '';
    let chunkStart = -1;
    let chunkEnd = -1;

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];
      const potentialChunk = currentChunk + (currentChunk ? '. ' : '') + sentence.text;

      if (potentialChunk.length > maxChunkSize && currentChunk.length > 0) {
        chunks.push({
          text: currentChunk.trim() + '.',
          charStart: chunkStart,
          charEnd: chunkEnd,
        });
        const words = currentChunk.split(/\s+/);
        const overlapWords = words.slice(-Math.min(overlap / 5, words.length / 2));
        currentChunk = overlapWords.join(' ') + (overlapWords.length > 0 ? '. ' : '') + sentence.text;
        // After overlap, the next chunk's anchor is the new sentence — overlap
        // text is duplicated context, not a new source position.
        chunkStart = sentence.start;
        chunkEnd = sentence.end;
      } else {
        if (chunkStart < 0) chunkStart = sentence.start;
        currentChunk = potentialChunk;
        chunkEnd = sentence.end;
      }
    }

    if (currentChunk.trim()) {
      chunks.push({
        text: currentChunk.trim() + (currentChunk.endsWith('.') ? '' : '.'),
        charStart: chunkStart,
        charEnd: chunkEnd,
      });
    }

    return chunks.filter(chunk => {
      const wordCount = chunk.text.split(/\s+/).length;
      return wordCount >= 5 && chunk.text.length >= 30;
    });
  }

  _splitNonLatin(text, maxChunkSize = 500, overlap = 50) {
    // Normalize whitespace only — DO NOT strip non-ASCII; that wipes the doc.
    const cleanText = text.replace(/\s+/g, ' ').trim();
    if (cleanText.length < 30) return [];

    // Sentence delimiters: ASCII + full-width CJK forms. Thai has no
    // sentence punctuation in common use — splits will fall back to the
    // hard char-length cut below, which is fine.
    const SENT_DELIM = /[.!?。！？]+/g;
    const sentences = [];
    let cursor = 0;
    let dm;
    while ((dm = SENT_DELIM.exec(cleanText)) !== null) {
      const raw = cleanText.slice(cursor, dm.index);
      const trimmed = raw.trim();
      if (trimmed.length > 5) {
        const leading = raw.length - raw.trimStart().length;
        const start = cursor + leading;
        sentences.push({ text: trimmed, start, end: start + trimmed.length });
      }
      cursor = dm.index + dm[0].length;
    }
    if (cursor < cleanText.length) {
      const raw = cleanText.slice(cursor);
      const trimmed = raw.trim();
      if (trimmed.length > 5) {
        const leading = raw.length - raw.trimStart().length;
        const start = cursor + leading;
        sentences.push({ text: trimmed, start, end: start + trimmed.length });
      }
    }

    const chunks = [];
    let current = '';
    let chunkStart = -1;
    let chunkEnd = -1;

    for (const sentence of sentences) {
      // Hard-split sentences longer than maxChunkSize (common in Thai docs
      // with no sentence punctuation at all).
      if (sentence.text.length > maxChunkSize) {
        if (current) {
          chunks.push({ text: current.trim(), charStart: chunkStart, charEnd: chunkEnd });
          current = '';
          chunkStart = -1;
          chunkEnd = -1;
        }
        for (let i = 0; i < sentence.text.length; i += maxChunkSize - overlap) {
          const piece = sentence.text.slice(i, i + maxChunkSize).trim();
          chunks.push({
            text: piece,
            charStart: sentence.start + i,
            charEnd: sentence.start + i + piece.length,
          });
        }
        continue;
      }
      const candidate = current + (current ? ' ' : '') + sentence.text;
      if (candidate.length > maxChunkSize && current.length > 0) {
        chunks.push({ text: current.trim(), charStart: chunkStart, charEnd: chunkEnd });
        const tail = current.slice(-overlap);
        current = tail + ' ' + sentence.text;
        chunkStart = sentence.start;
        chunkEnd = sentence.end;
      } else {
        if (chunkStart < 0) chunkStart = sentence.start;
        current = candidate;
        chunkEnd = sentence.end;
      }
    }
    if (current.trim()) {
      chunks.push({ text: current.trim(), charStart: chunkStart, charEnd: chunkEnd });
    }

    // Quality filter: chunks must be substantial. Char threshold, not word
    // count — word count from whitespace splitting is meaningless here.
    return chunks.filter(chunk => chunk.text.length >= 30);
  }

  // Enhanced search with better scoring.
  // queryLocale (optional): locale of the *query* — drives stopword selection
  // for keyword extraction. Defaults to the doc-side locale (this.locale)
  // when not provided, preserving prior behavior for callers that haven't
  // been updated. Per-query lookup so one bot can serve queries in multiple
  // languages without changing instance state.
  search(query, maxResults = 3, minScore = 1, queryLocale = null) {
    if (!this.isLoaded || this.documentChunks.length === 0) {
      console.log('📭 RAG not loaded or no documents available');
      return '';
    }

    const cleanQuery = query.trim();
    if (cleanQuery.length < 3) {
      console.log('🔍 Query too short for RAG search');
      return '';
    }

    const effectiveQueryLocale = queryLocale || this.locale;
    const stopWords = getStopwords(effectiveQueryLocale);

    console.log(`🔍 RAG search: "${cleanQuery}" (${this.documentChunks.length} chunks, doc locale: ${this.locale}, query locale: ${effectiveQueryLocale})`);

    // Locale-aware keyword extraction. Latin: drop short noise like "is",
    // "a". Non-Latin: tokenize() returns bigrams (length 2) plus the rare
    // single-char query case, so accept length ≥ 1.
    // Take more bigrams for non-Latin since each "word" typically expands
    // to 2-4 bigrams (e.g., "ロード" → [ロー, ード]).
    const minTokenLen = this.isNonLatin ? 1 : 3;
    const maxKeywords = this.isNonLatin ? 30 : 10;
    const queryWords = this.tokenize(cleanQuery)
      .filter(w => w.length >= minTokenLen && !stopWords.has(w))
      .slice(0, maxKeywords);

    if (queryWords.length === 0) {
      console.log('🤷 No meaningful keywords extracted from query');
      return '';
    }

    console.log(`🔑 Keywords: [${queryWords.join(', ')}]`);

    const scoredChunks = [];

    this.documentChunks.forEach(chunk => {
      let score = 0;
      const chunkText = chunk.content.toLowerCase();
      const tokens = chunk.tokens || this.tokenize(chunk.content);
      const tokenSet = chunk.tokenSet || new Set(tokens);
      const tokenCount = tokens.length;

      queryWords.forEach(word => {
        let exactMatches;
        let partialMatches;
        if (this.isNonLatin) {
          // Bigram-equality match. With uniform-length tokens on both sides,
          // substring partial-match degenerates to exact-match, so we skip
          // it. Tokens are precomputed at chunk creation time.
          exactMatches = 0;
          for (const t of tokens) if (t === word) exactMatches++;
          partialMatches = 0;
        } else {
          exactMatches = (chunkText.match(new RegExp(`\\b${this.escapeRegex(word)}\\b`, 'g')) || []).length;
          partialMatches = (chunkText.match(new RegExp(this.escapeRegex(word), 'g')) || []).length - exactMatches;
        }

        if (exactMatches === 1) {
          score += 3;
        } else if (exactMatches === 2) {
          score += 5;
        } else if (exactMatches >= 3) {
          score += 6;
        }

        score += partialMatches * 1;

        if (exactMatches > 0 && tokenCount < 100) {
          score += 0.5;
        }
      });

      // Diversity bonus — rewards chunks that touch more distinct query
      // words. With bigrams, a multi-character compound naturally produces
      // multiple distinct bigrams, so this also implicitly weights longer
      // semantic terms higher.
      const uniqueMatches = queryWords.filter(word => tokenSet.has(word)).length;
      score += uniqueMatches * 0.5;

      // Large-chunk penalty: keep for Latin (long English chunks dilute
      // relevance) but skip for non-Latin where _splitNonLatin intentionally
      // produces big chunks to preserve context (no whitespace boundaries to
      // chunk on). Penalizing them double-punishes the only chunks likely to
      // contain answers in CJK/Thai docs.
      if (!this.isNonLatin && tokenCount > 200) {
        score *= 0.8;
      }

      if (score >= minScore) {
        scoredChunks.push({
          ...chunk,
          score: Math.round(score * 100) / 100,
          matchedWords: queryWords.filter(word => tokenSet.has(word)),
        });
      }
    });
    
    // Sort by score
    scoredChunks.sort((a, b) => b.score - a.score);

    // Deduplicate similar chunks (addresses cross-document repetition)
    const uniqueChunks = [];
    const similarityThreshold = 0.7; // 70% word overlap = duplicate

    for (const chunk of scoredChunks) {
      const isDuplicate = uniqueChunks.some(existing =>
        this.chunksSimilar(existing.content, chunk.content, similarityThreshold)
      );

      if (!isDuplicate) {
        uniqueChunks.push(chunk);
      }

      // Stop once we have enough unique results
      if (uniqueChunks.length >= maxResults) {
        break;
      }
    }

    const topChunks = uniqueChunks;
    
    if (topChunks.length > 0) {
      console.log(`📋 Found ${topChunks.length} relevant chunks:`);
      topChunks.forEach((chunk, i) => {
        console.log(`   ${i + 1}. ${chunk.filename} (score: ${chunk.score}, words: [${chunk.matchedWords.join(', ')}])`);
      });

      // Store results for retrieval
      this.lastSearchResults = topChunks.map(chunk => ({
        filename: chunk.filename,
        content: chunk.content,
        score: chunk.score,
        chunkIndex: chunk.chunkIndex,
        chunkCount: chunk.chunkCount,
        charStart: chunk.charStart,
        charEnd: chunk.charEnd,
        contentHash: chunk.contentHash,
      }));

      // Format results for LLM
      const formattedResults = topChunks.map((chunk, index) => {
        const prefix = topChunks.length > 1 ? `[${index + 1}] ` : '';
        return `${prefix}[From ${chunk.filename}]:\n${chunk.content}`;
      }).join('\n\n---\n\n');

      return formattedResults;
    }

    console.log('🤷 No relevant chunks found above minimum score threshold');
    this.lastSearchResults = null;
    return '';
  }

  // Helper method to escape regex special characters
  escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Check if two chunks are similar (for deduplication).
  // Jaccard over token sets — uses the locale-aware tokenizer so non-Latin
  // chunks don't all collapse to identical empty sets.
  chunksSimilar(content1, content2, threshold = 0.7) {
    if (content1 === content2) return true;
    const words1 = new Set(this.tokenize(content1));
    const words2 = new Set(this.tokenize(content2));
    if (words1.size === 0 && words2.size === 0) return false;

    const intersection = new Set([...words1].filter(word => words2.has(word)));
    const union = new Set([...words1, ...words2]);
    const similarity = intersection.size / union.size;
    return similarity >= threshold;
  }

  // Get last search results (for client display)
  getLastSearchResults() {
    return this.lastSearchResults;
  }

  // Get comprehensive statistics
  getStats() {
    const fileStats = {};
    let totalWords = 0;
    
    this.documentChunks.forEach(chunk => {
      fileStats[chunk.filename] = (fileStats[chunk.filename] || 0) + 1;
      totalWords += chunk.wordCount || 0;
    });
    
    return {
      isLoaded: this.isLoaded,
      documentsPath: this.documentsPath,
      totalChunks: this.documentChunks.length,
      totalWords: totalWords,
      averageWordsPerChunk: this.documentChunks.length > 0 ? Math.round(totalWords / this.documentChunks.length) : 0,
      loadedFiles: Array.from(this.loadedFiles),
      chunksPerFile: fileStats,
      memoryUsage: this.estimateMemoryUsage()
    };
  }

  // Estimate memory usage
  estimateMemoryUsage() {
    let totalSize = 0;
    this.documentChunks.forEach(chunk => {
      totalSize += JSON.stringify(chunk).length * 2; // Rough estimate (UTF-16)
    });
    return {
      estimatedBytes: totalSize,
      estimatedMB: Math.round(totalSize / (1024 * 1024) * 100) / 100
    };
  }

  // Add a new document at runtime
  async addDocument(filename) {
    try {
      await this.loadDocument(filename);
      console.log(`📝 Successfully added document: ${filename}`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to add document ${filename}:`, error.message);
      return false;
    }
  }

  // Remove a document's chunks
  removeDocument(filename) {
    const initialCount = this.documentChunks.length;
    this.documentChunks = this.documentChunks.filter(chunk => chunk.filename !== filename);
    this.loadedFiles.delete(filename);
    
    const removedCount = initialCount - this.documentChunks.length;
    if (removedCount > 0) {
      console.log(`🗑️ Removed ${removedCount} chunks from ${filename}`);
      return true;
    } else {
      console.log(`⚠️ No chunks found for ${filename}`);
      return false;
    }
  }

  // Clear all loaded documents
  clear() {
    const count = this.documentChunks.length;
    this.documentChunks = [];
    this.loadedFiles.clear();
    this.isLoaded = false;
    console.log(`🧹 Cleared ${count} chunks from RAG system`);
  }

  // Search for chunks from a specific document
  searchInDocument(query, filename, maxResults = 3) {
    const documentChunks = this.documentChunks.filter(chunk => 
      chunk.filename === filename
    );
    
    if (documentChunks.length === 0) {
      console.log(`📭 No chunks found for document: ${filename}`);
      return '';
    }
    
    // Temporarily filter to single document and search
    const originalChunks = this.documentChunks;
    this.documentChunks = documentChunks;
    
    const result = this.search(query, maxResults);
    
    // Restore original chunks
    this.documentChunks = originalChunks;
    
    return result;
  }

  // Get chunks for debugging/inspection
  getChunks(filename = null, limit = 10) {
    let chunks = this.documentChunks;
    
    if (filename) {
      chunks = chunks.filter(chunk => chunk.filename === filename);
    }
    
    return chunks.slice(0, limit).map(chunk => ({
      id: chunk.id,
      filename: chunk.filename,
      preview: chunk.content.substring(0, 100) + '...',
      wordCount: chunk.wordCount,
      chunkIndex: chunk.chunkIndex
    }));
  }
}

module.exports = SimpleRAG;