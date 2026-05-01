'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ModularWizardProvider } from '@/components/wizard/modular/ModularWizardContext';
import ModularBotCreationWizard from '@/components/wizard/modular/ModularBotCreationWizard';

function WizardContent() {
  const searchParams = useSearchParams();
  return (
    <ModularWizardProvider botSpaceId={searchParams.get('botSpaceId') || null}>
      <ModularBotCreationWizard />
    </ModularWizardProvider>
  );
}

export default function ModularBotPage() {
  return (
    <Suspense fallback={<div className="p-8">Loading wizard…</div>}>
      <WizardContent />
    </Suspense>
  );
}
