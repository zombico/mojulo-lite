import crypto from 'crypto';

// Lite encrypts the stored LLM API key with a key derived from the host.
// In production deployments users set API_KEY_ENCRYPTION_KEY; otherwise a
// stable machine-derived key keeps round-trips working for local dev.
function getEncryptionKey() {
  const envKey = process.env.API_KEY_ENCRYPTION_KEY;
  if (envKey) {
    return crypto.createHash('sha256').update(envKey).digest();
  }
  return crypto.createHash('sha256').update('mojulo-lite-local-dev').digest();
}

const ALGO = 'aes-256-gcm';

export function encryptApiKey(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

export function decryptApiKey(encrypted) {
  const data = Buffer.from(encrypted, 'base64');
  const iv = data.subarray(0, 12);
  const tag = data.subarray(12, 28);
  const ciphertext = data.subarray(28);
  const decipher = crypto.createDecipheriv(ALGO, getEncryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

export function generateApiKey() {
  return `bot_${crypto.randomBytes(24).toString('hex')}`;
}
