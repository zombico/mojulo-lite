// Lite runs locally for a single operator — no need to rate-limit ourselves.
// Keep the shape the copied stream route expects.

export const RateLimitPresets = {
  expensive: { windowMs: 60_000, max: 60 },
  default: { windowMs: 60_000, max: 300 },
};

export function checkRateLimit(_request, _options) {
  return { allowed: true };
}
