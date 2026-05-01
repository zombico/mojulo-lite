/**
 * Serves the deployed bot's client assets (lite-template/client/*) into
 * the wizard's preview iframe. For index.html we inject a `<script>` tag
 * pointing at the preview-shim, which monkey-patches fetch and reads the
 * wizard's config via postMessage.
 *
 * Files come straight from `lite-template/client/`, the same source the
 * deployed container ships. Zero copy, zero drift.
 */

import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';

const LITE_CLIENT_PATH =
  process.env.LITE_TEMPLATE_PATH
    ? path.join(process.env.LITE_TEMPLATE_PATH, 'client')
    : path.resolve(process.cwd(), '..', 'lite-template', 'client');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function safeJoin(base, segments) {
  const joined = path.join(base, ...segments);
  const resolvedBase = path.resolve(base);
  const resolvedJoined = path.resolve(joined);
  if (!resolvedJoined.startsWith(resolvedBase + path.sep) && resolvedJoined !== resolvedBase) {
    return null;
  }
  return resolvedJoined;
}

function injectShim(html) {
  // Drop the shim tag in as the very first thing inside <head> so it runs
  // before the inline bootstrap script at the bottom of <body>.
  const tag = '<script src="preview-shim.js"></script>';
  if (html.includes('<head>')) {
    return html.replace('<head>', `<head>\n    ${tag}`);
  }
  // Fallback: prepend (shouldn't happen — index.html has <head>).
  return `${tag}\n${html}`;
}

export async function GET(_request, { params }) {
  const resolvedParams = await params;
  const segments = resolvedParams.path || [];
  const requested = segments.length === 0 ? ['index.html'] : segments;
  const fullPath = safeJoin(LITE_CLIENT_PATH, requested);

  if (!fullPath) {
    return NextResponse.json({ error: 'Bad path' }, { status: 400 });
  }

  let body;
  try {
    body = await fs.readFile(fullPath);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    console.error('[preview/bot] read failed:', err);
    return NextResponse.json({ error: 'Read failed' }, { status: 500 });
  }

  const ext = path.extname(fullPath).toLowerCase();
  const contentType = MIME[ext] || 'application/octet-stream';

  if (ext === '.html') {
    const html = injectShim(body.toString('utf-8'));
    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'no-store',
      },
    });
  }

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'no-store',
    },
  });
}
