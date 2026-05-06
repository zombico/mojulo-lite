import { NextResponse } from 'next/server';
import { ApiKeyRepository } from '@/lib/db/repositories/apiKeys';
import { encryptApiKey } from '@/lib/deployment-auth';

function redact(key) {
  if (!key) return null;
  return {
    id: key.id,
    name: key.name,
    provider: key.provider,
    isDefault: key.isDefault,
    createdAt: key.createdAt,
  };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const provider = searchParams.get('provider');
  let keys = await ApiKeyRepository.findByUserId('local');
  if (provider) {
    keys = keys.filter((k) => k.provider === provider);
  }
  return NextResponse.json({ keys: keys.map(redact) });
}

export async function POST(request) {
  const body = await request.json();
  const { name, provider, apiKey, makeDefault = true } = body;

  if (!name || !provider || !apiKey) {
    return NextResponse.json(
      { error: 'name, provider, and apiKey are required' },
      { status: 400 }
    );
  }

  const created = await ApiKeyRepository.create({
    name,
    provider,
    encryptedKey: encryptApiKey(apiKey),
    isDefault: makeDefault,
  });

  return NextResponse.json({ key: redact(created) }, { status: 201 });
}
