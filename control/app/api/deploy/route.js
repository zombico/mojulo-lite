/**
 * Legacy save endpoint, kept as a thin alias for `POST /api/deployments`.
 *
 * Mojulo-Lite no longer builds the artifact on save — this endpoint only
 * persists (or updates) the deployment row. To produce a downloadable ZIP,
 * call POST /api/deployments/[id]/build (or hit the download URL, which
 * lazy-builds on demand).
 */

import { POST as saveDeployment } from '../deployments/route.js';

export const POST = saveDeployment;
