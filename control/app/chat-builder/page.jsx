'use client';

import { useRouter } from 'next/navigation';
import InvertedModularChatPanel from '@/components/ModularChat/InvertedModularChatPanel';

export default function ChatBuilderPage() {
  const router = useRouter();

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 33px)' }}>
      <div className="flex-1 overflow-hidden">
        <InvertedModularChatPanel
          workspaceId={null}
          workspaceName="Mojulo-Lite"
          onDeployComplete={(deploymentId) => {
            router.push(`/dashboard?built=${deploymentId}`);
          }}
          onClose={() => router.push('/dashboard')}
        />
      </div>
    </div>
  );
}
