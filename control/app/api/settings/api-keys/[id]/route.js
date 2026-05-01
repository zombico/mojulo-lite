import { NextResponse } from 'next/server';
import { ApiKeyRepository } from '@/lib/db/repositories/apiKeys';

export async function DELETE(_request, { params }) {
  const { id } = await params;
  await ApiKeyRepository.delete(id);
  return NextResponse.json({ ok: true });
}

export async function PATCH(_request, { params }) {
  const { id } = await params;
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
