'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ModularWizardProvider } from '@/components/wizard/modular/ModularWizardContext';
import ModularBotCreationWizard from '@/components/wizard/modular/ModularBotCreationWizard';

function WizardContent() {
  const searchParams = useSearchParams();
  // editDeploymentId is the id of the deployment being edited — used by the
  // live-preview path to authorize a server-side credential lookup against
  // the deployment row when the wizard hasn't been given a fresh key.
  // Clones get a null id so they're forced to provide their own credential.
  const fromId = searchParams.get('from');
  const isClone = searchParams.get('clone') === 'true';
  const editDeploymentId = !isClone ? fromId : null;
  return (
    <ModularWizardProvider
      botSpaceId={searchParams.get('botSpaceId') || null}
      editDeploymentId={editDeploymentId}
    >
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
