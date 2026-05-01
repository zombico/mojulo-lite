import { requireLLMKey } from '@/lib/auth/gate';

export default async function ChatBuilderLayout({ children }) {
  await requireLLMKey();
  return children;
}
