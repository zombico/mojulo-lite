# Security Policy

mojulo-lite is a small, solo-maintained, self-hosted project. This document describes how to report security issues and what falls inside or outside the project's threat model.

## Supported versions

Only the latest `0.x.y` release receives security fixes. Older `0.x` minors are not patched.

When the project reaches `1.0`, this policy will be updated with a longer support window.

## Reporting a vulnerability

Please use **GitHub's private vulnerability reporting** on this repository (Security tab → "Report a vulnerability"). This keeps the report private until a fix is available.

If you cannot use GitHub's private reporting, email the maintainer at `hello@mojulo.ai` with `[mojulo-lite security]` in the subject.

**Please do not open public GitHub issues for security reports.**

### What to include

- A description of the issue and where it lives (file path, route, or component)
- Steps to reproduce, ideally with a minimal proof-of-concept
- Your assessment of impact
- Whether you intend to disclose publicly, and on what timeline

### Response expectations

This is a solo-maintained project. Expect best-effort acknowledgement within a few days, not hours. Fix timelines depend on severity and complexity. You will be credited in the release notes for the fix unless you ask not to be.

## Threat model

mojulo-lite has two components with different security postures:

- **Control plane** ([control/](control/)) — single-user, self-hosted, **no built-in authentication**. Intended to run on `localhost` or behind a network boundary the operator controls.
- **Bot runtime** ([lite-template/](lite-template/)) — designed to be exposed to end users. Conversation data stays in the bot's local SQLite and never leaves it.

These two postures shape what's in and out of scope below.

### In scope

Reports about the following are welcome and treated as security issues:

- **Tamper-evident chain bypass.** Any way to insert, modify, or delete turn rows in a bot's SQLite without the `content_hash` / `chain_hash` chain detecting it. Includes attacks on the `/verify/:id` walker and on cross-bot triage handoffs (the URL-carried tip-of-chain + `handoff` event row mechanism).
- **API key extraction.** Any way to read decrypted LLM provider keys out of the control plane's `api_keys` table without filesystem access to the host.
- **Bot proxy auth bypass.** Any way to read or write through `/api/deployments/[id]/conversations*` or `/api/deployments/[id]/submissions*` without holding the deployment's `MOJULO_API_KEY`.
- **Cross-document RAG leakage.** Any prompt or input that causes a bot to surface chunks from documents the operator did not include in that bot's knowledge set.
- **Conversation data leaving the bot.** Any code path that copies conversation rows from a bot's SQLite back into the control plane's database, or to any third party other than the configured LLM provider.
- **Artifact tampering.** Any way to inject malicious config or code into a generated zip that the operator did not explicitly add through the builder UI.
- **Dependency vulnerabilities** with a clear exploit path against either component.

### Out of scope

These are known design constraints, not vulnerabilities:

- **Control plane exposed to the public internet.** The control plane has no authentication by design. It is meant to run locally or behind operator-controlled access (VPN, SSH tunnel, Tailscale, reverse proxy with auth, etc.). Reachability of port 3001 from the internet is the operator's responsibility, not a project bug.
- **Local filesystem attacks.** Issues that require an attacker to already have read or write access to the host's filesystem (e.g. reading `control/data/mojulo-lite.db` directly, reading `.env` files) are out of scope. The threat model assumes the host is trusted.
- **Denial of service against a single self-hosted instance.** Resource-exhaustion attacks against the control plane or a single bot are not treated as security issues.
- **Issues in third-party LLM providers.** Bugs or policy issues in Anthropic, OpenAI, Gemini, Cohere, or Bedrock APIs should be reported to those vendors.
- **LLM hallucination, jailbreak, or prompt-injection content quality** that does not cross a security boundary (e.g. does not exfiltrate other documents, does not bypass the chain). These are product-quality issues — open a regular GitHub issue.
- **Lack of rate limiting** at the control plane, since it is single-user.
- **Missing security headers** on the control plane UI, for the same reason.

### Sensitive areas — extra care appreciated

If you are reviewing or fuzzing these areas, your reports are especially welcome:

- Turn-hashing helpers and the `/verify/:id` walker — see [docs/turn-hashing.md](docs/turn-hashing.md).
- Federated routing and the cross-bot handoff flow — see [docs/federated-routing.md](docs/federated-routing.md).
- The bot proxy in [control/lib/deployers/bot-proxy.js](control/lib/deployers/bot-proxy.js) and the routes that forward through it.
- API key encryption and decryption paths in the control plane.
- The artifact build pipeline in [control/lib/deployers/docker.js](control/lib/deployers/docker.js).

## Disclosure

After a fix ships, the maintainer will publish a release note describing the issue, affected versions, and the fix. Reporters are credited by name or handle unless they request otherwise.

There is no bug bounty.
