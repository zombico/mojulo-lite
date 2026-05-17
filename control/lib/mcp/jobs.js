/**
 * In-process job runner for long-running MCP tool calls.
 *
 * MCP clients don't all implement progress notifications, and many tool
 * libraries enforce a "tools must return in N seconds" pattern. We wrap
 * anything >2s as a job: returns { jobId } immediately, the model polls
 * with `poll_job`.
 *
 * Storage: `mcp_jobs` table (see lib/db/index.js). On control-plane restart,
 * pending / running jobs are reaped to `error` state — that's all the
 * recovery the single-user posture needs.
 */

import { McpJobRepository, JOB_STATUS } from '@/lib/db/repositories/mcpJobs';

/**
 * Start a job. Returns immediately with { jobId, status: 'pending' }.
 * The provided `task(jobId)` runs in the background; its return value becomes
 * the job result, its thrown error becomes the job error.
 *
 * `task` can optionally call McpJobRepository.setProgress(jobId, pct) to
 * report progress for clients that poll.
 */
export async function startJob({
  tool,
  mcpSessionId = null,
  builderSessionId = null,
  task,
}) {
  if (typeof task !== 'function') {
    throw new Error('startJob requires a task function');
  }

  const job = await McpJobRepository.create({ tool, mcpSessionId, builderSessionId });

  // Don't await — fire and forget; the caller returns the jobId to the client.
  runJobInBackground(job.id, task);

  return { jobId: job.id, status: job.status };
}

function runJobInBackground(jobId, task) {
  // setImmediate so the create() write commits and the HTTP response goes out
  // before we start the heavy work. queueMicrotask wouldn't be enough — the
  // task can be CPU-bound on the embedder.
  setImmediate(async () => {
    try {
      await McpJobRepository.setRunning(jobId);
      const result = await task(jobId);
      await McpJobRepository.setDone(jobId, result);
    } catch (err) {
      console.error(`[mcp:job ${jobId}] failed:`, err);
      await McpJobRepository.setError(jobId, err).catch((dbErr) => {
        console.error(`[mcp:job ${jobId}] failed to persist error:`, dbErr);
      });
    }
  });
}

export async function getJob(jobId) {
  return McpJobRepository.findById(jobId);
}

export { JOB_STATUS };
