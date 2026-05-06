import { NextResponse } from 'next/server';
import { DocumentRepository } from '@/lib/db/repositories/documents';
import { DeploymentRepository } from '@/lib/db/repositories/deployments';
import { parseDocument } from '@/lib/document-parser';
import { uploadFile } from '@/lib/storage';

// Shape returned to the wizard. storagePath is required downstream by
// /api/generate-rag and /api/preview/chat (they download the blob and parse
// it). Without it, those routes 400 with "Document missing storage path".
function serializeDocument(d) {
  return {
    id: d.id,
    originalName: d.originalName,
    mimeType: d.mimeType,
    sizeBytes: d.sizeBytes,
    storagePath: d.storagePath,
    createdAt: d.createdAt,
  };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const includeDeployments = searchParams.get('include') === 'deployments';

  const docs = await DocumentRepository.findByBotSpaceId(null);

  if (!includeDeployments) {
    return NextResponse.json({
      documents: docs.map(serializeDocument),
    });
  }

  // Augmented response for the library page: attach a reverse-map of the bots
  // referencing each doc, plus a `hasParsedText` flag so the page can flag
  // parse failures without shipping multi-MB parsed_text bodies over the wire.
  const deployments = await DeploymentRepository.list();
  const refsByDocId = new Map();
  for (const dep of deployments) {
    for (const docId of dep.documentIds || []) {
      if (!refsByDocId.has(docId)) refsByDocId.set(docId, []);
      refsByDocId.get(docId).push({ id: dep.id, botName: dep.botName });
    }
  }

  return NextResponse.json({
    documents: docs.map((d) => ({
      ...serializeDocument(d),
      hasParsedText: !!(d.parsedText && d.parsedText.length > 0),
      deployments: refsByDocId.get(d.id) || [],
    })),
  });
}

export async function POST(request) {
  const formData = await request.formData();
  const file = formData.get('file');
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'file is required' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const storagePath = `documents/${Date.now()}-${file.name}`;
  await uploadFile(storagePath, buffer);

  let parsedText = null;
  try {
    parsedText = await parseDocument(buffer, file.name);
  } catch (err) {
    console.warn('[documents] parse failed:', err.message);
  }

  const doc = await DocumentRepository.create({
    originalName: file.name,
    mimeType: file.type || 'application/octet-stream',
    sizeBytes: buffer.length,
    storagePath,
    parsedText,
  });

  return NextResponse.json({ document: serializeDocument(doc) }, { status: 201 });
}
