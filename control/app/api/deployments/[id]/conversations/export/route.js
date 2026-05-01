import { NextResponse } from 'next/server';
import { DeploymentRepository } from '@/lib/db/repositories/deployments';
import { fetchFromBot } from '@/lib/deployers/bot-proxy';

export async function GET(request, { params }) {
  const { id } = await params;
  const deployment = await DeploymentRepository.findById(id);
  if (!deployment) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!deployment.url) {
    return NextResponse.json({ error: 'Bot is not connected' }, { status: 409 });
  }

  const { searchParams } = new URL(request.url);
  const qs = searchParams.toString();
  const path = `/api/conversations/export${qs ? `?${qs}` : ''}`;

  let response;
  try {
    response = await fetchFromBot(deployment, path, { timeoutMs: 60000 });
  } catch (err) {
    return NextResponse.json(
      { error: `Could not reach bot: ${err.message || err.name}` },
      { status: 502 }
    );
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    return NextResponse.json(
      { error: 'Bot returned an error', status: response.status, body: text.slice(0, 500) },
      { status: 502 }
    );
  }

  await DeploymentRepository.touchLastSeen(id);

  const filename = `conversations-${deployment.botName}-${new Date().toISOString().split('T')[0]}.json`;
  const headers = new Headers();
  const contentType = response.headers.get('content-type') || 'application/json';
  headers.set('content-type', contentType);
  headers.set('content-disposition', `attachment; filename="${filename}"`);
  return new Response(response.body, { status: 200, headers });
}
