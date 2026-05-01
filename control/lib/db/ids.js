import { randomBytes, randomUUID } from 'crypto';

export function newId(prefix) {
  const id = randomUUID();
  return prefix ? `${prefix}_${id}` : id;
}

export function newApiKey() {
  return `lite_${randomBytes(24).toString('hex')}`;
}
