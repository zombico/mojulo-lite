import { uploadFile } from './index.js';

export async function persistRagSummary({ sessionId, content }) {
  const key = `sessions/${sessionId}/ragSummary.txt`;
  await uploadFile(key, Buffer.from(content, 'utf8'));
  return { storagePath: key };
}
