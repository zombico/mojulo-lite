import { NextResponse } from 'next/server';
import { DocumentRepository } from '@/lib/db/repositories/documents';
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

export async function GET() {
  const docs = await DocumentRepository.findByBotSpaceId(null);
  return NextResponse.json({
    documents: docs.map(serializeDocument),
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
