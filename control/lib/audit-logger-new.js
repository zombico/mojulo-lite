// Lite writes audit events to stdout for transparency during local ops.
// Fleet-wide audit trails live in the Full product.

export async function auditLog(event, _request) {
  if (process.env.MOJULO_LITE_AUDIT_QUIET === '1') return;
  try {
    console.log('[audit]', JSON.stringify({ ts: Date.now(), ...event }));
  } catch {
    // ignore
  }
}
