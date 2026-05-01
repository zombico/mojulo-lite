import { NextResponse } from 'next/server';
import { DeploymentRepository, DEPLOYMENT_STATUS } from '@/lib/db/repositories/deployments';

/**
 * Registered bots — deployments the operator has connected to a running URL.
 * Powers the triage configurator's bot picker and the conversational builder's
 * registry context. Returns only `status=ready` rows with a non-null `url`.
 *
 * `botSummary` is read from `config.botSummary` (populated by the modular
 * generate_bot_summary tool); falls back to `null`.
 */
export async function GET() {
  const deployments = await DeploymentRepository.list();

  const bots = deployments
    .filter((d) => d.status === DEPLOYMENT_STATUS.READY && d.url)
    .map((d) => ({
      deploymentId: d.id,
      name: d.botName,
      url: d.url,
      botSummary: d.config?.botSummary || null,
      lastSeenAt: d.lastSeenAt,
    }));

  return NextResponse.json({ bots });
}
