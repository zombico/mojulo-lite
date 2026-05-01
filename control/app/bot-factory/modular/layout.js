import { requireLLMKey } from '@/lib/auth/gate';

export default async function ModularWizardLayout({ children }) {
  await requireLLMKey();
  return children;
}
