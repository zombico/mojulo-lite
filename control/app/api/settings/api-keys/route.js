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

  // The default key powers the chat builder, whose agentic tool-use loop
  // relies on cloud-provider reliability and latency. Ollama keys can exist
  // (the wizard / bot artifact still uses them) but must never hold the
  // default flag — silently coerce instead of erroring so legacy clients
  // sending the old `makeDefault: true` payload still succeed.
  const effectiveMakeDefault = provider === 'ollama' ? false : makeDefault;

  // Ollama doesn't have a secret — the "credential" slot holds the endpoint
  // URL. We serialize it as JSON {"host": "..."} so the on-disk shape mirrors
  // Bedrock's encrypted-JSON pattern and resolveSavedApiKeyIntoConfig can
  // discriminate cleanly. Running a non-secret through encryptApiKey is
  // semantically odd but reuses the existing row contract (encryptedKey NOT
  // NULL) without a schema change.
  const storedSecret = provider === 'ollama'
    ? JSON.stringify({ host: apiKey.trim() })
    : apiKey;

  const created = await ApiKeyRepository.create({
    name,
    provider,
    encryptedKey: encryptApiKey(storedSecret),
    isDefault: effectiveMakeDefault,
  });

  return NextResponse.json({ key: redact(created) }, { status: 201 });
}
