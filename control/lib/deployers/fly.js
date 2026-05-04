/**
 * Fly.io Machines API deployer.
 *
 * Deploys the published GHCR bot image (ghcr.io/zombico/mojulo-bot) to a
 * user-owned Fly app using their API token. Per-bot config is injected via
 * the Machines API `files` field — the image stays bot-agnostic.
 *
 * Patterns enforced (see lite-template/integration/CLOUD_DEPLOY_GUIDE.md):
 *   - Pattern 1: One image, config injected per machine via base64 files[].
 *   - Pattern 2: Volume named "data", find-or-create idempotent, always
 *                re-attached on update.
 *   - Pattern 3: Deterministic app name = ${md5(userId).slice(0,8)}-${botName}.
 *   - Pattern 4: Lifecycle ops are thin platform mappings.
 *   - Pattern 5: deploy() accepts an onProgress callback for audit-trail
 *                events; the lifecycle wrapper persists them.
 *
 * Credentials are passed by constructor parameter — never read globally —
 * so future per-user token storage drops in without changing this file.
 */

import crypto from 'crypto';

const FLY_API_BASE = 'https://api.machines.dev/v1';

const DEFAULT_GUEST = { cpu_kind: 'shared', cpus: 1, memory_mb: 1024 };
const DEFAULT_REGION = 'iad';
const DEFAULT_VOLUME_GB = 1;

export class FlyDeployer {
  constructor({
    apiToken,
    orgSlug = 'personal',
    image,
    defaultRegion = DEFAULT_REGION,
    defaultGuest = DEFAULT_GUEST,
    defaultVolumeGb = DEFAULT_VOLUME_GB,
  } = {}) {
    if (!apiToken) {
      throw new Error('FlyDeployer requires apiToken');
    }
    this.apiToken = apiToken;
    this.orgSlug = orgSlug;
    // Cloud image is independent of BOT_IMAGE (which docker.js uses for the
    // local docker-compose path and is often set to a laptop tag like
    // `mojulo/bot:latest`). Cloud always wants a public registry pin —
    // override via MOJULO_CLOUD_IMAGE if you need a different tag.
    // Pin matches the tag actually published on GHCR. Bump after Phase 6 of
    // GHCR_container_plan.md (cut bot-v0.1.0 → CI publishes :0.1.0 + :latest).
    this.image =
      image ||
      process.env.MOJULO_CLOUD_IMAGE ||
      'ghcr.io/zombico/mojulo-bot:0.0.1-test';
    if (!/[:/]/.test(this.image) || !this.image.includes('/')) {
      throw new Error(
        `Cloud image "${this.image}" has no registry prefix; Fly will route it through Docker Hub. ` +
          `Use a fully-qualified image like ghcr.io/owner/name:tag.`
      );
    }
    this.defaultRegion = defaultRegion;
    this.defaultGuest = defaultGuest;
    this.defaultVolumeGb = defaultVolumeGb;
  }

  /**
   * Deterministic app name from user identity + bot name. Same inputs always
   * yield the same name, which makes deploys self-healing: lose the
   * control-plane row, redeploy, and you find the existing app + volume.
   */
  static computeAppName({ userId = 'local', botName }) {
    if (!botName) throw new Error('computeAppName requires botName');
    const userHash = crypto
      .createHash('md5')
      .update(String(userId))
      .digest('hex')
      .substring(0, 8);
    return `${userHash}-${botName}`
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 63);
  }

  async _request(pathSuffix, options = {}) {
    const res = await fetch(`${FLY_API_BASE}${pathSuffix}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
    const text = await res.text();
    if (!res.ok) {
      const err = new Error(`Fly API ${res.status} ${pathSuffix}: ${text}`);
      err.status = res.status;
      err.body = text;
      throw err;
    }
    return text ? JSON.parse(text) : null;
  }

  /**
   * Provision (or update) a bot. Idempotent against an existing app + volume
   * keyed by `appName`.
   *
   * @param {Object} params
   * @param {string} params.appName       Deterministic app name (use computeAppName)
   * @param {Array}  params.configFiles   [{ guestPath, contents }] — written into the container at machine create
   * @param {Object} params.env           Env vars for the bot process (LLM key, MOJULO_API_KEY, DOCKER_RUN, etc.)
   * @param {string} [params.region]
   * @param {Object} [params.guest]       cpu_kind, cpus, memory_mb
   * @param {number} [params.volumeGb]
   * @param {Function} [params.onProgress] called with { step, message } per lifecycle event
   */
  async deploy(params) {
    const {
      appName,
      configFiles = [],
      env = {},
      region = this.defaultRegion,
      guest = this.defaultGuest,
      volumeGb = this.defaultVolumeGb,
      onProgress = () => {},
    } = params;

    if (!appName) throw new Error('deploy requires appName');

    onProgress({ step: 'app', message: `Ensuring Fly app ${appName} exists` });
    await this._ensureApp(appName);

    onProgress({ step: 'ips', message: `Ensuring public IPs for ${appName}` });
    await this._ensureIps(appName);

    onProgress({ step: 'volume', message: `Ensuring data volume in ${region}` });
    const volumeId = await this._ensureVolume(appName, region, volumeGb);

    onProgress({ step: 'machine_config', message: 'Building machine config' });
    const machineConfig = this._buildMachineConfig({
      env,
      configFiles,
      volumeId,
      guest,
    });

    onProgress({ step: 'machine', message: 'Creating or updating machine' });
    const machine = await this._ensureMachine(appName, region, machineConfig);

    onProgress({ step: 'wait', message: 'Waiting for machine to start' });
    await this._waitForStart(appName, machine.id).catch((err) => {
      // Healthcheck/start timeout is informational, not fatal — the machine
      // may still come healthy moments later. Surface as a progress event
      // and let the caller poll status.
      onProgress({ step: 'wait_timeout', message: err.message });
    });

    const url = `https://${appName}.fly.dev`;
    onProgress({ step: 'complete', message: `Deployed at ${url}` });

    return { appName, url, machineId: machine.id, volumeId };
  }

  async _ensureApp(appName) {
    try {
      await this._request('/apps', {
        method: 'POST',
        body: JSON.stringify({ app_name: appName, org_slug: this.orgSlug }),
      });
    } catch (err) {
      const body = err.body || err.message || '';
      if (
        err.status === 422 ||
        /already (exists|been taken|taken)/i.test(body) ||
        /name has already/i.test(body)
      ) {
        // App from a prior deploy — fall through and reuse.
        return;
      }
      throw err;
    }
  }

  /**
   * Allocate shared_v4 + v6 IPs if missing. Without this, the *.fly.dev
   * hostname has no DNS records and external requests can never reach the
   * app — the machine starts fine, health checks pass on Fly's internal
   * network, but autostart-on-request never fires because nothing routes in.
   *
   * The Machines REST API can list IPs, but allocation has historically
   * required GraphQL (see CLOUD_DEPLOY_GUIDE.md "GraphQL IP allocation").
   * Same Bearer token works for both endpoints.
   */
  async _ensureIps(appName) {
    let existing = [];
    try {
      existing = (await this._request(`/apps/${appName}/ips`)) || [];
    } catch (err) {
      if (err.status !== 404) throw err;
    }
    const hasV4 = existing.some((ip) =>
      ['shared_v4', 'v4'].includes(ip.type)
    );
    const hasV6 = existing.some((ip) => ip.type === 'v6');

    if (!hasV4) await this._allocateIp(appName, 'shared_v4');
    if (!hasV6) await this._allocateIp(appName, 'v6');
  }

  async _allocateIp(appName, type) {
    const query = `
      mutation($input: AllocateIPAddressInput!) {
        allocateIpAddress(input: $input) {
          ipAddress { address type }
        }
      }
    `;
    const res = await fetch('https://api.fly.io/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: { input: { appId: appName, type } },
      }),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(
        `Fly GraphQL ${res.status} allocateIpAddress(${type}): ${text}`
      );
    }
    const data = JSON.parse(text);
    if (data.errors && data.errors.length) {
      const msg = data.errors[0].message || '';
      // Race: another deploy raced us and already allocated this type.
      if (/already/i.test(msg)) return;
      throw new Error(`Fly GraphQL allocateIpAddress(${type}): ${msg}`);
    }
  }

  async _ensureVolume(appName, region, sizeGb) {
    // The Fly Machines API does NOT enforce volume-name uniqueness — POSTing
    // a second volume with name "data" silently creates a second volume,
    // which orphans the first. List-first is the only correct approach.
    const volumes = await this._request(`/apps/${appName}/volumes`).catch(
      (err) => {
        if (err.status === 404) return [];
        throw err;
      }
    );
    const existing = (volumes || []).find(
      (v) => v.name === 'data' && v.state !== 'destroyed'
    );
    if (existing) return existing.id;

    const vol = await this._request(`/apps/${appName}/volumes`, {
      method: 'POST',
      body: JSON.stringify({ name: 'data', size_gb: sizeGb, region }),
    });
    return vol.id;
  }

  _buildMachineConfig({ env, configFiles, volumeId, guest }) {
    const files = configFiles.map((f) => ({
      guest_path: f.guestPath,
      raw_value: Buffer.from(f.contents).toString('base64'),
    }));

    const config = {
      image: this.image,
      env: { DOCKER_RUN: 'true', ...env },
      files,
      services: [
        {
          ports: [
            { port: 80, handlers: ['http'], force_https: true },
            { port: 443, handlers: ['tls', 'http'] },
          ],
          protocol: 'tcp',
          internal_port: 3000,
          autostart: true,
          autostop: 'stop',
        },
      ],
      checks: {
        httpget: {
          type: 'http',
          port: 3000,
          path: '/health',
          interval: '15s',
          timeout: '5s',
          grace_period: '20s',
        },
      },
      guest,
      restart: { policy: 'on-failure', max_retries: 3 },
    };

    // Always include mounts last so that any future merge operations on this
    // object don't clobber the volume attach (failure mode #5 in the
    // cloud-deploy guide).
    if (volumeId) {
      config.mounts = [{ volume: volumeId, path: '/data' }];
    }

    return config;
  }

  async _ensureMachine(appName, region, machineConfig) {
    let existing = [];
    try {
      existing = (await this._request(`/apps/${appName}/machines`)) || [];
    } catch (err) {
      if (err.status !== 404) throw err;
    }

    if (existing.length > 0) {
      const machine = existing[0];
      // Update path: re-send the full config including the mounts array.
      // Fly's machines API does not merge mounts — omitting them detaches
      // the volume.
      await this._request(`/apps/${appName}/machines/${machine.id}`, {
        method: 'POST',
        body: JSON.stringify({ region, config: machineConfig }),
      });
      return machine;
    }

    return this._request(`/apps/${appName}/machines`, {
      method: 'POST',
      body: JSON.stringify({ region, config: machineConfig }),
    });
  }

  async _waitForStart(appName, machineId, timeoutSeconds = 60) {
    return this._request(
      `/apps/${appName}/machines/${machineId}/wait?state=started&timeout=${timeoutSeconds}`
    );
  }

  /**
   * Stop all machines but keep volume + app. Reversible via resume().
   */
  async pause(appName) {
    const machines = await this._listMachines(appName);
    for (const m of machines) {
      if (m.state !== 'stopped') {
        await this._request(`/apps/${appName}/machines/${m.id}/stop`, {
          method: 'POST',
        }).catch(() => {});
      }
    }
    return { ok: true, paused: machines.length };
  }

  async resume(appName) {
    const machines = await this._listMachines(appName);
    for (const m of machines) {
      if (m.state === 'stopped') {
        await this._request(`/apps/${appName}/machines/${m.id}/start`, {
          method: 'POST',
        }).catch(() => {});
      }
    }
    return { ok: true, resumed: machines.length };
  }

  /**
   * Stop + delete every machine, then delete the app. App deletion cascades
   * to volume + IPs on Fly. Use `force=true` on machine delete to avoid
   * hangs when a machine is in a transitional state.
   */
  async destroy(appName) {
    const machines = await this._listMachines(appName);
    for (const m of machines) {
      await this._request(`/apps/${appName}/machines/${m.id}/stop`, {
        method: 'POST',
      }).catch(() => {});
      await this._request(`/apps/${appName}/machines/${m.id}?force=true`, {
        method: 'DELETE',
      }).catch(() => {});
    }
    await this._request(`/apps/${appName}`, { method: 'DELETE' }).catch(
      (err) => {
        if (err.status !== 404) throw err;
      }
    );
    return { ok: true };
  }

  async getStatus(appName) {
    let machines;
    try {
      machines = await this._listMachines(appName);
    } catch (err) {
      if (err.status === 404) return { status: 'not_found' };
      throw err;
    }
    if (!machines.length) return { status: 'not_found' };

    const states = machines.map((m) => m.state);
    const allStarted = states.every((s) => s === 'started');
    const allStopped = states.every((s) => s === 'stopped');
    const status = allStarted ? 'running' : allStopped ? 'stopped' : 'mixed';
    return {
      status,
      url: `https://${appName}.fly.dev`,
      machines: machines.length,
      states,
    };
  }

  async _listMachines(appName) {
    try {
      const machines = await this._request(`/apps/${appName}/machines`);
      return machines || [];
    } catch (err) {
      if (err.status === 404) return [];
      throw err;
    }
  }
}
