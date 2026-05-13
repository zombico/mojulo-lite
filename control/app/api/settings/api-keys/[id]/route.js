import { NextResponse } from 'next/server';
import { ApiKeyRepository } from '@/lib/db/repositories/apiKeys';

export async function DELETE(_request, { params }) {
  const { id } = await params;
  await ApiKeyRepository.delete(id);
  return NextResponse.json({ ok: true });
}

export async function PATCH(_request, { params }) {
  const { id } = await params;

  // The default key powers the chat builder's agentic tool-use loop, which
  // assumes cloud-provider reliability. Refuse to mark an Ollama key as
  // default — the wizard / bot artifact can still use the key, but it can't
  // become the builder's default.
  const existing = await ApiKeyRepository.findById(id);
  if (!existing) {
    return NextResponse.json({ error: 'Key not found' }, { status: 404 });
  }
  if (existing.provider === 'ollama') {
    return NextResponse.json(
      { error: 'Ollama keys cannot be the default — the chat builder requires a cloud provider.' },
      { status: 400 }
    );
  }

  const updated = await ApiKeyRepository.setDefault(id);
  return NextResponse.json({
    key: updated && {
      id: updated.id,
      name: updated.name,
      provider: updated.provider,
      isDefault: updated.isDefault,
    },
  });
}
