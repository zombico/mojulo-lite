/**
 * Generate RAG Route
 *
 * POST /api/generate-rag
 * Process uploaded documents with custom parser and send to LLM for summarization
 */

import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/service';
import { downloadToBuffer } from '@/lib/storage';
import { parseDocument } from '@/lib/document-parser';
import { generateSummary } from '@/lib/llm-providers';
import { checkRateLimit, RateLimitPresets } from '@/lib/rate-limiter';

/**
 * Download and parse document content
 */
async function downloadAndParseDocument(storagePath, fileName) {
  try {
    const buffer = await downloadToBuffer(storagePath);

    if (!buffer) {
      throw new Error(`No data received for ${storagePath}`);
    }

    // Parse document content using custom parser
    const text = await parseDocument(buffer, fileName);

    return text;
  } catch (error) {
    console.error(`Error parsing document ${storagePath}:`, error);
    throw error;
  }
}

/**
 * POST /api/generate-rag
 * Generate RAG summary from uploaded documents using client-provided API key
 */
export async function POST(request) {
  // Rate limit RAG generation (expensive LLM operation)
  const rateLimit = checkRateLimit(request, {
    ...RateLimitPresets.expensive,
    keyPrefix: 'generate-rag',
  });
  if (!rateLimit.allowed) {
    return rateLimit.response;
  }

  try {
    // Authenticate user
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized. Please log in to generate RAG summaries.' }, { status: 401 });
    }

    const { documents, customPrompt, provider = 'gemini', model, apiKey } = await request.json();

    // Validate inputs
    if (!documents || !Array.isArray(documents) || documents.length === 0) {
      return NextResponse.json({ error: 'No documents provided' }, { status: 400 });
    }

    // Validate provider
    const validProviders = ['gemini', 'cohere', 'openai', 'anthropic', 'bedrock'];
    if (!validProviders.includes(provider)) {
      return NextResponse.json(
        { error: `Invalid provider: ${provider}. Must be one of: ${validProviders.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate API key/credentials based on provider
    if (provider === 'bedrock') {
      // Bedrock uses JSON credentials
      if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
        return NextResponse.json(
          { error: 'AWS credentials are required for Bedrock.' },
          { status: 400 }
        );
      }
      try {
        const creds = JSON.parse(apiKey);
        if (!creds.useIamRole && (!creds.accessKeyId || !creds.secretAccessKey)) {
          return NextResponse.json(
            { error: 'AWS Access Key ID and Secret Access Key are required (or enable IAM Role).' },
            { status: 400 }
          );
        }
      } catch {
        return NextResponse.json(
          { error: 'Invalid Bedrock credentials format.' },
          { status: 400 }
        );
      }
    } else {
      // Standard API key validation for other providers
      if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
        return NextResponse.json(
          { error: 'API key is required. Please provide your API key for the selected provider.' },
          { status: 400 }
        );
      }
    }

    // Step 1: Parse all documents and generate individual summaries
    const individualSummaries = {};
    const errors = [];
    const summaryPrompt = `Analyze this document and provide a comprehensive summary that:

1. Identifies key terms, concepts, and topics covered
2. Highlights the main themes and subject areas
3. Lists important entities, processes, or procedures mentioned
4. Notes any technical specifications, data, or metrics

IMPORTANT: Generate the summary in the SAME LANGUAGE as the original document. If the document is in French, write the summary in French. If in German, write in German. Match the source language exactly.

Synthesize the information into max 3 paragraphs 200 words.

Keep the summary high-level, factual, and cohesive.`;

    for (const doc of documents) {
      try {
        // Support both camelCase (from Drizzle) and snake_case (legacy) property names
        const storagePath = doc.storagePath || doc.storage_path;
        const fileName = doc.originalName || doc.file_name;

        if (!storagePath) {
          throw new Error('Document missing storage path');
        }

        const text = await downloadAndParseDocument(storagePath, fileName);

        console.log(`Generating summary for: ${fileName}`);
        const docSummary = await generateSummary(provider, text, apiKey, summaryPrompt, model);

        individualSummaries[fileName] = docSummary;
      } catch (error) {
        const displayName = doc.originalName || doc.file_name || 'unknown';
        console.error(`Failed to process ${displayName}:`, error);
        const errorMsg = `${displayName}: ${error.message}`;
        errors.push(errorMsg);
        individualSummaries[displayName] = `[Error processing document: ${error.message}]`;
      }
    }

    // Single document: use the individual summary directly (with custom prompt if provided)
    if (documents.length === 1) {
      const filename = Object.keys(individualSummaries)[0];
      let finalSummary = individualSummaries[filename];

      // If there's a custom prompt, apply it to the summary
      if (customPrompt && !finalSummary.startsWith('[Error')) {
        console.log('Applying custom prompt to single document summary...');
        try {
          const customizedPrompt = `${finalSummary}\n\nIMPORTANT: ${customPrompt}`;
          finalSummary = await generateSummary(provider, '', apiKey, customizedPrompt, model);
        } catch (customError) {
          console.error('Error applying custom prompt:', customError);
          errors.push(`Custom prompt application: ${customError.message}`);
        }
      }

      return NextResponse.json({
        success: true,
        summary: finalSummary,
        individualSummaries,
        documentsProcessed: 1,
        errors: errors.length > 0 ? errors : undefined,
        provider,
        model,
      });
    }

    // Multiple documents: Step 2 - Consolidate all summaries with user's custom prompt as weighting
    const consolidatedSummariesText = Object.entries(individualSummaries)
      .map(([filename, summary]) => `--- ${filename} ---\n${summary}`)
      .join('\n\n');

    const baseConsolidationPrompt = `You are consolidating multiple document summaries into a unified RAG (Retrieval-Augmented Generation) context.

Below are summaries from ${documents.length} different documents. Your task is to:

1. Synthesize these summaries into a coherent, unified knowledge base description
2. Identify cross-document themes and connections
3. Organize the information in a clear, structured way
4. Highlight what questions this combined knowledge base can answer

Here are the individual document summaries:

${consolidatedSummariesText}`;

    const consolidationPrompt = customPrompt
      ? `${baseConsolidationPrompt}\n\nIMPORTANT: ${customPrompt}`
      : baseConsolidationPrompt;

    console.log('Generating consolidated summary...');

    let finalSummary;
    try {
      finalSummary = await generateSummary(provider, '', apiKey, consolidationPrompt, model);
    } catch (consolidationError) {
      console.error('Error during consolidation:', consolidationError);
      errors.push(`Consolidation step: ${consolidationError.message}`);

      // If consolidation fails but we have individual summaries, use them as the summary
      if (Object.keys(individualSummaries).length > 0) {
        const fallbackSummary = Object.entries(individualSummaries)
          .filter(([_, summary]) => !summary.startsWith('[Error'))
          .map(([filename, summary]) => `## ${filename}\n\n${summary}`)
          .join('\n\n---\n\n');

        return NextResponse.json({
          success: true,
          summary: fallbackSummary || 'No summaries could be generated.',
          individualSummaries,
          documentsProcessed: documents.length,
          consolidationFailed: true,
          errors: errors,
          provider,
          model,
        });
      }

      throw consolidationError;
    }

    return NextResponse.json({
      success: true,
      summary: finalSummary,
      individualSummaries,
      documentsProcessed: documents.length,
      errors: errors.length > 0 ? errors : undefined,
      provider,
      model,
    });
  } catch (error) {
    console.error('Error generating RAG summary:', error);
    return NextResponse.json(
      {
        error: error.message || 'Failed to generate RAG summary',
        details: error.toString(),
      },
      { status: 500 }
    );
  }
}
