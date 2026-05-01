/**
 * Document Parser Utility
 * Handles parsing of various document types
 * - PDFs: Uses pdf2json (Node.js native, no browser APIs)
 * - DOCX/PPTX/XLSX: Uses officeparser
 */

const PDFParser = require('pdf2json');
const officeParser = require('officeparser');
const { writeFile, unlink } = require('fs/promises');
const { join } = require('path');
const { tmpdir } = require('os');

/**
 * Parse PDF using pdf2json (Node.js native parser)
 * @param {Buffer} buffer - PDF file buffer
 * @returns {Promise<string>} Extracted text
 */
async function parsePDF(buffer) {
  return new Promise((resolve, reject) => {
    const pdfParser = new PDFParser();

    pdfParser.on('pdfParser_dataError', (errData) => {
      reject(new Error(errData.parserError));
    });

    pdfParser.on('pdfParser_dataReady', (pdfData) => {
      try {
        // Try getRawTextContent() first
        let text = pdfParser.getRawTextContent();

        console.log('PDF text length:', text ? text.length : 0);
        console.log('PDF text sample:', text ? text.substring(0, 200) : 'empty');

        // If getRawTextContent() returns empty, try alternative extraction
        if (!text || text.trim().length === 0) {
          console.log('Trying alternative text extraction from pdfData');
          // Extract text from pages manually
          const pages = pdfData?.Pages || [];
          const textParts = [];

          for (const page of pages) {
            const texts = page?.Texts || [];
            for (const textItem of texts) {
              try {
                const encodedText = textItem?.R?.[0]?.T || '';
                const decodedText = encodedText ? decodeURIComponent(encodedText) : '';
                if (decodedText) {
                  textParts.push(decodedText);
                }
              } catch (decodeError) {
                // If decoding fails, use the raw text
                const rawText = textItem?.R?.[0]?.T || '';
                if (rawText) {
                  textParts.push(rawText);
                }
              }
            }
          }

          text = textParts.join(' ');
          console.log('Alternative extraction length:', text.length);
        }

        resolve(text);
      } catch (error) {
        reject(error);
      }
    });

    // Parse the buffer
    pdfParser.parseBuffer(buffer);
  });
}

/**
 * Parse Office documents using officeparser (requires file path)
 * @param {Buffer} buffer - File buffer
 * @param {string} fileName - Original file name
 * @returns {Promise<string>} Extracted text
 */
async function parseOfficeDocument(buffer, fileName) {
  const tempFilePath = join(tmpdir(), `temp-${Date.now()}-${fileName}`);

  try {
    await writeFile(tempFilePath, buffer);
    const extractedText = await officeParser.parseOfficeAsync(tempFilePath);
    return extractedText;
  } finally {
    try {
      await unlink(tempFilePath);
    } catch (unlinkError) {
      console.warn(`Failed to delete temp file ${tempFilePath}:`, unlinkError);
    }
  }
}

/**
 * Repair PDFs whose text extraction produced character-positioned output
 * (every character separated by whitespace), turning "P l a n d ' a s s u r"
 * back into "Plan d'assurance". Common with PDFs exported from Google Docs
 * and other tools that embed custom font subsets pdf2json can't decode.
 *
 * Heuristic: if >50% of whitespace-split tokens in a 4KB sample are length
 * 1, the parse is broken. Threshold is conservative — healthy English/French
 * prose runs ~0-30% single-char tokens (only "I", "a", "à", "y") so the
 * normalizer is a no-op on well-parsed docs.
 *
 * Word-boundary rule: 3+ consecutive spaces (or any newline) marks a real
 * word break. 1-2 spaces inside a "word" are PDF-positioning artifacts and
 * get stripped. Edge cases like "A u t o  C  a r e" → "AutoCare" recover
 * because the intra-word gap stays under 3 spaces.
 *
 * Limitation: tight pseudo-ligatures with extra positioning around capitals
 * (e.g. "L   L   C" with 3-space gaps inside the acronym) reconstruct as
 * "L L C" — searchable but not pixel-perfect. Acceptable trade-off vs the
 * unsearchable status quo.
 */
function normalizeCharacterSpacing(text) {
  const sample = text.slice(0, 4000);
  const sampleTokens = sample.split(/\s+/).filter(Boolean);
  if (sampleTokens.length < 20) return text;

  const singleCharRatio =
    sampleTokens.filter((t) => t.length === 1).length / sampleTokens.length;
  if (singleCharRatio < 0.5) return text;

  console.log(
    `Detected character-positioned PDF text (${(singleCharRatio * 100).toFixed(0)}% single-char tokens) — normalizing.`
  );

  return text
    .split(/[ \t]{3,}|\r?\n+/)
    .map((w) => w.replace(/\s+/g, ''))
    .filter(Boolean)
    .join(' ');
}

/**
 * Parse document by writing to temp file first
 * @param {Buffer} buffer - File buffer
 * @param {string} fileName - Original file name
 * @returns {Promise<string>} Extracted text
 */
async function parseDocument(buffer, fileName) {
  try {
    const fileExtension = fileName.toLowerCase().split('.').pop();

    let extractedText;

    // Use pdf-parse for PDFs (no worker issues)
    if (fileExtension === 'pdf') {
      extractedText = await parsePDF(buffer);
    }
    // Use officeparser for other document types
    else {
      extractedText = await parseOfficeDocument(buffer, fileName);
    }

    if (!extractedText || extractedText.trim().length === 0) {
      throw new Error(`No text extracted from ${fileName}`);
    }

    return normalizeCharacterSpacing(extractedText);
  } catch (error) {
    console.error(`Error parsing ${fileName}:`, error);
    throw new Error(`Failed to parse ${fileName}: ${error.message}`);
  }
}

module.exports = { parseDocument };
