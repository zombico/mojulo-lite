import { NextResponse } from 'next/server';
import { DocumentRepository } from '@/lib/db/repositories/documents';
import { deleteFile } from '@/lib/storage';

export async function DELETE(_request, { params }) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const doc = await DocumentRepository.findById(id);
  if (!doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  // Best-effort storage cleanup: don't fail the delete if the file is already
  // gone. The DB row is the source of truth for whether the doc "exists" in
  // the wizard, so dropping it should always succeed even if the underlying
  // blob was lost.
  if (doc.storagePath) {
    try {
      await deleteFile(doc.storagePath);
    } catch (err) {
      console.warn(`[documents/${id}] storage delete failed (continuing):`, err.message);
    }
  }

  await DocumentRepository.delete(id);
  return NextResponse.json({ success: true });
}
