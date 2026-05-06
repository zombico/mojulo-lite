import { NextResponse } from 'next/server';
import { DocumentRepository } from '@/lib/db/repositories/documents';
import { DeploymentRepository } from '@/lib/db/repositories/deployments';

export async function DELETE(_request, { params }) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const doc = await DocumentRepository.findById(id);
  if (!doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  // Refuse to delete a doc that's still referenced by a bot. The library page
  // gates this in the UI; the guard is defense-in-depth against API misuse and
  // stale clients.
  const deployments = await DeploymentRepository.list();
  const attachedTo = deployments
    .filter((d) => (d.documentIds || []).includes(id))
    .map((d) => ({ id: d.id, botName: d.botName }));
  if (attachedTo.length > 0) {
    return NextResponse.json(
      {
        error: 'Document is attached to one or more bots',
        deployments: attachedTo,
      },
      { status: 409 }
    );
  }

  await DocumentRepository.delete(id);
  return NextResponse.json({ success: true });
}
