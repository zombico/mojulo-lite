import { NextResponse } from 'next/server';
import { DeploymentRepository } from '@/lib/db/repositories/deployments';
import { normalizeBotUrl, probeBotConnection } from '@/lib/deployers/bot-proxy';

export async function POST(request, { params }) {
  const { id } = await params;
  const deployment = await DeploymentRepository.findById(id);
  if (!deployment) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const url = normalizeBotUrl(body?.url);
  if (!url) {
    return NextResponse.json(
      { error: 'URL must be a valid http(s) address' },
      { status: 400 }
    );
  }

  const probe = await probeBotConnection(url, deployment.apiKey);
  if (!probe.ok) {
    const message =
      probe.reason === 'unauthorized'
        ? 'Bot rejected the API key. Make sure MOJULO_API_KEY in the bot matches its baked-in value.'
        : probe.reason === 'timeout'
          ? 'Probe timed out. Check the URL and that the bot is running.'
          : probe.reason === 'network'
            ? `Could not reach ${url} (${probe.message || 'network error'}).`
            : `Bot returned status ${probe.status}.`;
    return NextResponse.json({ error: message, reason: probe.reason }, { status: 502 });
  }

  const updated = await DeploymentRepository.setUrl(id, url);
  return NextResponse.json({
    id: updated.id,
    url: updated.url,
    lastSeenAt: updated.lastSeenAt,
  });
}

export async function DELETE(_request, { params }) {
  const { id } = await params;
  const deployment = await DeploymentRepository.findById(id);
  if (!deployment) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await DeploymentRepository.clearUrl(id);
  return NextResponse.json({ ok: true });
}
