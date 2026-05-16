/**
 * MCP Phase 2 — long-running tools wrapped as jobs.
 *
 * `process_documents` and `save_modular_bot` from BUILDER_TOOLS can take 10s+
 * (document parsing + embedding + per-doc LLM summary; or build pipeline +
 * docker package + LLM identity composition). MCP clients don't all surface
 * progress notifications well, so we wrap them: return { jobId } immediately,
 * the model polls via `poll_job`.
 *
 * Also adds an in-protocol document upload path (`upload_document_from_url`)
 * since the web flow uses a separate form-data endpoint that MCP can't reach.
 */

import { BUILDER_TOOLS } from '@/lib/builder/tools';
import { executeBuilderTool } from '@/lib/builder/tool-executors';
import { BuilderSessionRepository } from '@/lib/db/repositories/builderSessions';
import { DocumentRepository } from '@/lib/db/repositories/documents';
import {
  getOrCreateBuilderSession,
} from '@/lib/mcp/session-binding';
import { registerTool } from '@/lib/mcp/server';
import { startJob, getJob } from '@/lib/mcp/jobs';
import { parseDocument } from '@/lib/document-parser';
import { uploadFile } from '@/lib/storage';

const JOB_TOOL_NAMES = ['process_documents', 'save_modular_bot'];

function findBuilderToolSchema(name) {
  const tool = BUILDER_TOOLS.find((t) => t.name === name);
  if (!tool) throw new Error(`BUILDER_TOOLS is missing ${name}`);
  return tool;
}

function makeJobHandler(toolName) {
  return async function handle(input, mcpContext) {
    const session = await getOrCreateBuilderSession(
      mcpContext.mcpSessionId,
      mcpContext.userId
    );

    return startJob({
      tool: toolName,
      mcpSessionId: mcpContext.mcpSessionId,
      builderSessionId: session.id,
      task: async () => {
        // Re-fetch session on the worker side — there could be writes from
        // other tools between job start and run.
        const fresh = await BuilderSessionRepository.findById(session.id);
        const ctx = { session: fresh, userId: mcpContext.userId };
        const result = await executeBuilderTool(toolName, input, ctx);
        if (!result.success) {
          throw new Error(result.error || `${toolName} failed`);
        }
        return result.result;
      },
    });
  };
}

const MIME_BY_EXT = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
  md: 'text/markdown',
  html: 'text/html',
  htm: 'text/html',
};

const MAX_DOC_BYTES = 25 * 1024 * 1024; // 25 MB — same ballpark as the web upload form.

async function uploadDocumentFromUrlHandler(input, _mcpContext) {
  const { url, base64, text, fileName } = input || {};

  const providedCount = [url, base64, text].filter(Boolean).length;
  if (providedCount === 0) {
    throw new Error('Provide one of `url`, `base64` (with `fileName`), or `text` (with `fileName`).');
  }
  if (providedCount > 1) {
    throw new Error('Provide only one of `url`, `base64`, or `text` — they are mutually exclusive.');
  }

  let buffer;
  let resolvedName = fileName;
  let resolvedMime;
  // When the caller hands us already-extracted text (e.g. piped from another
  // MCP server like Google Docs), skip the parser — the text IS the parsed
  // form. Set this so we don't burn cycles re-parsing a .txt blob that
  // officeparser doesn't even understand.
  let prextractedText = null;

  if (url) {
    if (!/^https?:\/\//i.test(url)) {
      throw new Error('url must be http(s)://');
    }
    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(`Fetch failed: ${resp.status} ${resp.statusText}`);
    }
    const ab = await resp.arrayBuffer();
    if (ab.byteLength > MAX_DOC_BYTES) {
      throw new Error(`Document too large: ${ab.byteLength} bytes (max ${MAX_DOC_BYTES})`);
    }
    buffer = Buffer.from(ab);
    resolvedMime = resp.headers.get('content-type')?.split(';')[0]?.trim() || undefined;
    if (!resolvedName) {
      const path = new URL(url).pathname;
      resolvedName = path.split('/').pop() || 'document';
    }
  } else if (base64) {
    if (!fileName) {
      throw new Error('fileName is required when uploading via base64.');
    }
    buffer = Buffer.from(base64, 'base64');
    if (buffer.length === 0) {
      throw new Error('base64 decoded to zero bytes.');
    }
    if (buffer.length > MAX_DOC_BYTES) {
      throw new Error(`Document too large: ${buffer.length} bytes (max ${MAX_DOC_BYTES})`);
    }
  } else {
    if (!fileName) {
      throw new Error('fileName is required when uploading via text.');
    }
    if (typeof text !== 'string' || text.trim().length === 0) {
      throw new Error('text must be a non-empty string.');
    }
    buffer = Buffer.from(text, 'utf8');
    if (buffer.length > MAX_DOC_BYTES) {
      throw new Error(`Document too large: ${buffer.length} bytes (max ${MAX_DOC_BYTES})`);
    }
    prextractedText = text;
    resolvedMime = 'text/plain';
  }

  if (!resolvedMime) {
    const ext = (resolvedName || '').split('.').pop()?.toLowerCase();
    resolvedMime = MIME_BY_EXT[ext] || 'application/octet-stream';
  }

  let parsedText;
  if (prextractedText !== null) {
    parsedText = prextractedText;
  } else {
    // Parse the document up front; if it's unparseable, surface the failure now
    // rather than have process_documents skip it silently.
    try {
      parsedText = await parseDocument(buffer, resolvedName);
    } catch (err) {
      throw new Error(`Failed to parse document: ${err.message}`);
    }
  }

  const storagePath = `documents/${Date.now()}-${resolvedName}`;
  await uploadFile(storagePath, buffer, null, { contentType: resolvedMime });

  const document = await DocumentRepository.create({
    storagePath,
    originalName: resolvedName,
    mimeType: resolvedMime,
    sizeBytes: buffer.length,
    parsedText,
  });

  return {
    documentId: document.id,
    originalName: document.originalName,
    mimeType: document.mimeType,
    sizeBytes: document.sizeBytes,
    message: `Uploaded ${document.originalName}. Pass its id to process_documents.`,
  };
}

async function pollJobHandler(input, _mcpContext) {
  const { jobId } = input || {};
  if (!jobId) throw new Error('jobId is required');
  const job = await getJob(jobId);
  if (!job) throw new Error(`Job not found: ${jobId}`);
  return {
    jobId: job.id,
    tool: job.tool,
    status: job.status,
    progress: job.progress,
    result: job.result,
    error: job.error,
  };
}

export function registerJobsTools() {
  for (const name of JOB_TOOL_NAMES) {
    const schema = findBuilderToolSchema(name);
    registerTool({
      name: schema.name,
      description: `${schema.description}\n\n(This tool runs as a background job. It returns { jobId } immediately; call \`poll_job\` until status is "done" or "error".)`,
      inputSchema: schema.input_schema,
      handler: makeJobHandler(name),
    });
  }

  registerTool({
    name: 'upload_document_from_url',
    description:
      'Upload a document (PDF / DOCX / TXT / MD / HTML) to the control plane for the bot under construction. Provide exactly one of: `url` to fetch from, `base64` binary content with `fileName`, or `text` plain-text content with `fileName` (use this when piping already-extracted text from another MCP server like Google Docs — skips the binary round-trip). Returns a `documentId` you can pass to `process_documents`.',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'http(s) URL to fetch the document from. Mutually exclusive with `base64` and `text`.',
        },
        base64: {
          type: 'string',
          description: 'Base64-encoded document content. Requires `fileName`. Mutually exclusive with `url` and `text`.',
        },
        text: {
          type: 'string',
          description: 'Already-extracted plain-text content (skips the parser). Requires `fileName`. Mutually exclusive with `url` and `base64`. Use this when the source MCP server already returned text content — avoids needlessly base64-encoding through the model.',
        },
        fileName: {
          type: 'string',
          description: 'Original filename (used for display). Required with `base64` and `text`; optional with `url` (inferred from path).',
        },
      },
    },
    handler: uploadDocumentFromUrlHandler,
  });

  registerTool({
    name: 'poll_job',
    description:
      'Check the status of a background job started by `process_documents`, `save_modular_bot`, or other job-based tools. Returns { status: "pending" | "running" | "done" | "error", progress, result, error }.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'The jobId returned from the original tool call.' },
      },
      required: ['jobId'],
    },
    handler: pollJobHandler,
  });
}
