'use client';

import { useRouter } from 'next/navigation';
import InvertedModularChatPanel from '@/components/ModularChat/InvertedModularChatPanel';

export default function ChatBuilderPage() {
  const router = useRouter();

  return (
    <div className="h-screen flex flex-col">
      <header className="px-4 py-2 flex items-center justify-between border-b border-[color:var(--border-color)] text-sm">
        <span className="font-semibold">Mojulo-Lite · Chat builder</span>
        <a href="/dashboard" className="text-[color:var(--text-muted)] hover:text-white">
          Back to dashboard
        </a>
      </header>

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
