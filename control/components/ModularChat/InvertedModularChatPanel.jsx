'use client';

/**
 * InvertedModularChatPanel
 *
 * Chat panel for the inverted modular flow ("Claude proposes, User disposes").
 * Uses streaming to show Claude's tool calls in real-time as it:
 * - Processes documents
 * - Infers intent
 * - Recommends protocols
 * - Generates configurations
 *
 * User can then confirm/adjust and deploy in 2 shots.
 */

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useModularStream, MESSAGE_TYPES, TOOL_STATUS, SESSION_STATUS } from '@/hooks/useModularStream';
import ModularChatInput from './ModularChatInput';
import { CollapsibleToolCalls } from './ToolCallCard';
import ProtocolConfirmCard from './ProtocolConfirmCard';
import { ModuloAvatar } from './ModuloAvatar';

export default function InvertedModularChatPanel({
  workspaceId,
  workspaceName,
  deploymentId,
  deploymentName,
  onClose,
  onDeployComplete,
}) {
  const t = useTranslations('chatBuilder.invertedPanel');
  const {
    sessionId,
    status,
    messages,
    isStreaming,
    isDeploying,
    error,
    inferredIntent,
    recommendedProtocols,
    generatedConfigs,
    generationComplete,
    moduloState,
    disableModuloAnimation,
    sendMessage,
    deploy,
    reset,
  } = useModularStream({ workspaceId, deploymentId });

  // Determine if we're in edit mode
  const isEditMode = !!deploymentId;

  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef(null);
  const router = useRouter();

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = (text, files = []) => {
    setInputValue('');
    sendMessage(text, files);
  };

  const handleDeploy = async (confirmedProtocols) => {
    const result = await deploy(confirmedProtocols);
    if (result?.success) {
      onDeployComplete?.(result);
    }
  };

  const handleAdjust = () => {
    sendMessage(t('adjustMessage'));
  };

  // Only show confirm card when generation is complete AND we have stable data
  const showConfirmCard = status === SESSION_STATUS.AWAITING_CONFIRM &&
    Object.keys(recommendedProtocols).length > 0 &&
    generationComplete;

  return (
    <div className="flex flex-col h-full bg-gray-900 rounded-xl shadow-xl border border-gray-700 overflow-hidden">
      {/* Header */}
      <div className={`flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-gradient-to-r ${isEditMode ? 'from-orange-500 to-amber-500' : 'from-indigo-600 to-purple-600'}`}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
            {isEditMode ? (
              <EditIcon className="w-5 h-5 text-white" />
            ) : (
              <SparklesIcon className="w-5 h-5 text-white" />
            )}
          </div>
          <div>
            <h2 className="font-semibold text-white">
              {isEditMode ? t('editBot', { name: deploymentName || t('fallbackBotName') }) : t('createABot')}
            </h2>
            <p className="text-xs text-white/60">
              {workspaceName ? `${workspaceName} ` : t('private')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {sessionId && (
            <span className="text-xs text-white/50 font-mono">
              {sessionId.slice(0, 12)}...
            </span>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition"
            >
              <XIcon className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Status indicator */}
      {status && status !== SESSION_STATUS.CREATED && (
        <div className="px-4 py-2 bg-gray-800 border-b border-gray-700 text-sm">
          <StatusBadge status={status} />
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Welcome message */}
        {messages.length === 0 && !isStreaming && (
          isEditMode ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-orange-900/30 flex items-center justify-center">
                <EditIcon className="w-8 h-8 text-orange-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-100 mb-2">
                {t('editTitle', { name: deploymentName || t('editFallbackName') })}
              </h3>
              <p className="text-gray-400 max-w-md mx-auto mb-4">
                {t('editDescription')}
              </p>
              <p className="text-sm text-gray-500">
                {t('editExamples')}
              </p>
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                <ModuloAvatar state="idle" size={64} disabled={disableModuloAnimation} />
              </div>
              <h3 className="text-lg font-medium text-gray-100 mb-2">
                {t('createTitle')}
              </h3>
              <p className="text-gray-400 max-w-md mx-auto">
                {t('createDescription')}
              </p>
              <button
                onClick={() => {
                  const url = workspaceId ? `/bot-factory/modular?botSpaceId=${workspaceId}` : '/bot-factory/modular';
                  router.push(url);
                }}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm text-gray-300 border border-gray-600 rounded-lg hover:bg-gray-800 hover:border-gray-500 transition"
              >
                <WizardIcon className="w-4 h-4" />
                {t('buildWithWizard')}
              </button>
            </div>
          )
        )}

        {/* Render messages - group consecutive tool calls */}
        {renderGroupedMessages(messages, status)}

        {/* Protocol confirmation card */}
        {showConfirmCard && (
          <ProtocolConfirmCard
            recommendedProtocols={recommendedProtocols}
            presetIdentity={generatedConfigs?.identity}
            generatedConfigs={generatedConfigs}
            onAdjust={handleAdjust}
            onDeploy={handleDeploy}
            isDeploying={isDeploying}
          />
        )}

        {/* Deployment success card */}
        {status === SESSION_STATUS.DEPLOYED && generatedConfigs?.deployment && (
          <DeploymentSuccessCard deployment={generatedConfigs.deployment} botSpaceId={workspaceId} />
        )}

        {/* Error display */}
        {error && (
          <div className="p-4 bg-red-900/30 border border-red-700 rounded-lg text-red-300 text-sm">
            <strong>{t('errorPrefix')}</strong> {error}
          </div>
        )}

        {/* Streaming indicator with Modulo */}
        {isStreaming && (
          <div className="flex items-center py-2">
            <ModuloAvatar state={moduloState} size={36} disabled={disableModuloAnimation} />
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <ModularChatInput
        value={inputValue}
        onChange={setInputValue}
        onSend={handleSend}
        disabled={isStreaming || isDeploying}
        placeholder={t('inputPlaceholder')}
        showAttachButton={true}
      />
    </div>
  );
}

/**
 * Group consecutive tool calls and render messages
 */
function renderGroupedMessages(messages, sessionStatus) {
  const groups = [];
  let currentToolCalls = [];

  const flushToolCalls = () => {
    if (currentToolCalls.length > 0) {
      groups.push({
        type: 'tool_group',
        toolCalls: [...currentToolCalls],
        key: `tools-${groups.length}`,
      });
      currentToolCalls = [];
    }
  };

  messages.forEach((msg, idx) => {
    if (msg.type === MESSAGE_TYPES.TOOL_CALL) {
      currentToolCalls.push(msg);
    } else {
      flushToolCalls();
      groups.push({ ...msg, key: `msg-${idx}` });
    }
  });
  flushToolCalls();

  // Collapse tool calls when we reach awaiting confirmation
  const shouldCollapse = sessionStatus === SESSION_STATUS.AWAITING_CONFIRM ||
                         sessionStatus === SESSION_STATUS.DEPLOYED;

  return groups.map((group) => {
    if (group.type === 'tool_group') {
      return (
        <CollapsibleToolCalls
          key={group.key}
          toolCalls={group.toolCalls}
          shouldCollapse={shouldCollapse}
        />
      );
    }
    return <MessageItem key={group.key} message={group} />;
  });
}

/**
 * Render a single message (non-tool-call)
 */
function MessageItem({ message }) {
  const { type, content } = message;

  // User message
  if (type === MESSAGE_TYPES.USER) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] bg-indigo-600 text-white rounded-2xl rounded-br-sm px-4 py-3">
          <div className="whitespace-pre-wrap break-words">{content}</div>
        </div>
      </div>
    );
  }

  // Assistant message
  if (type === MESSAGE_TYPES.ASSISTANT && content) {
    return (
      <div className="flex justify-start">
        <div className="max-w-[85%] bg-gradient-to-br from-gray-800 to-gray-700 text-gray-100 rounded-2xl rounded-bl-sm px-4 py-3 border border-gray-600/60 shadow-sm">
          <div className="whitespace-pre-wrap break-words">{content}</div>
        </div>
      </div>
    );
  }

  return null;
}

/**
 * Status badge component
 */
function StatusBadge({ status }) {
  const t = useTranslations('chatBuilder.status');
  const statusConfig = {
    [SESSION_STATUS.CREATED]: { label: t('ready'), color: 'bg-slate-700 text-slate-200 ring-1 ring-slate-500' },
    [SESSION_STATUS.PROCESSING]: { label: t('processing'), color: 'bg-sky-900/50 text-sky-300 ring-1 ring-sky-600 animate-pulse' },
    [SESSION_STATUS.AWAITING_CONFIRM]: { label: t('awaitingConfirmation'), color: 'bg-amber-900/50 text-amber-300 ring-1 ring-amber-600' },
    [SESSION_STATUS.DEPLOYING]: { label: t('deploying'), color: 'bg-violet-900/50 text-violet-300 ring-1 ring-violet-600 animate-pulse' },
    [SESSION_STATUS.DEPLOYED]: { label: t('deployed'), color: 'bg-emerald-900/50 text-emerald-300 ring-1 ring-emerald-600' },
    [SESSION_STATUS.EDITING]: { label: t('editing'), color: 'bg-orange-900/50 text-orange-300 ring-1 ring-orange-600' },
  };

  const config = statusConfig[status] || statusConfig[SESSION_STATUS.CREATED];

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold shadow-sm ${config.color}`}>
      {config.label}
    </span>
  );
}

/**
 * Deployment success card
 */
function DeploymentSuccessCard({ deployment, botSpaceId }) {
  const t = useTranslations('chatBuilder.success');
  const tCommon = useTranslations('common');
  const { deploymentId, botName, url, status, documentCount } = deployment;
  const [copied, setCopied] = useState(false);
  const embedCode = url ? `<script src="${url}/widget.js"></script>` : null;
  const artifactReady = status === 'ready';
  const downloadUrl = deploymentId ? `/api/deployments/${deploymentId}/download` : null;
  const downloadWithDocsUrl = deploymentId && documentCount > 0
    ? `/api/deployments/${deploymentId}/download?withDocs=1`
    : null;

  const handleCopy = async () => {
    if (!embedCode) return;
    try {
      await navigator.clipboard.writeText(embedCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="p-4 bg-gradient-to-br from-emerald-900/40 to-teal-900/40 border border-emerald-700 rounded-xl shadow-sm ring-1 ring-emerald-800">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-sm">
          <CheckIcon className="w-3.5 h-3.5 text-white" />
        </div>
        <span className="text-sm font-semibold text-emerald-300">
          {artifactReady ? t('botBuilt') : t('botSaved')}
        </span>
        <div className="flex-1" />
        <ModuloAvatar state="celebrating" size={40} />
      </div>

      {/* Status message */}
      <p className="text-sm text-gray-300 mb-3">
        {t.rich(artifactReady ? 'botBuiltMessage' : 'botSavedMessage', {
          name: botName,
          strong: (chunks) => <span className="font-semibold text-emerald-400">{chunks}</span>,
        })}
      </p>

      {/* Live URL */}
      {url && (
        <div className="mb-3">
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">{t('liveUrl')}</div>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-indigo-400 hover:text-indigo-300 underline break-all"
          >
            {url}
          </a>
        </div>
      )}

      {/* Embed code */}
      {embedCode && (
        <div className="mb-3">
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">{t('embedCode')}</div>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-gray-800 border border-gray-600 rounded px-2 py-1.5 font-mono text-gray-300 truncate">
              {embedCode}
            </code>
            <button
              onClick={handleCopy}
              className={`flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded border transition-colors ${
                copied
                  ? 'bg-green-900/50 border-green-600 text-green-300'
                  : 'bg-gray-800 border-gray-600 text-gray-300 hover:bg-gray-700'
              }`}
            >
              {copied ? (
                <>
                  <CheckIcon className="w-3 h-3" />
                  {tCommon('copied')}
                </>
              ) : (
                <>
                  <CopyIcon className="w-3 h-3" />
                  {tCommon('copy')}
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2 pt-3 border-t border-emerald-700/60">
        {artifactReady && downloadUrl && (
          <a
            href={downloadUrl}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-lg hover:from-emerald-700 hover:to-teal-700 transition shadow-sm"
          >
            <DownloadIcon className="w-3.5 h-3.5" />
            {t('downloadArtifact')}
          </a>
        )}
        {artifactReady && downloadWithDocsUrl && (
          <a
            href={downloadWithDocsUrl}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-gray-800 border border-emerald-700 text-emerald-300 rounded-lg hover:bg-gray-700 hover:border-emerald-600 transition shadow-sm"
          >
            <DownloadIcon className="w-3.5 h-3.5" />
            {t('downloadWithDocs')}
          </a>
        )}
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-gray-800 border border-emerald-700 text-emerald-300 rounded-lg hover:bg-gray-700 hover:border-emerald-600 transition shadow-sm"
          >
            <ExternalLinkIcon className="w-3.5 h-3.5" />
            {t('openBot')}
          </a>
        )}
        <a
          href={botSpaceId ? `/dashboard?botSpaceId=${botSpaceId}` : '/dashboard'}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-800 border border-emerald-700 text-emerald-400 rounded-lg hover:bg-gray-700 hover:border-emerald-600 transition shadow-sm"
        >
          <DashboardIcon className="w-3.5 h-3.5" />
          {t('viewInBotSpace')}
        </a>
      </div>
    </div>
  );
}

// Icons
function XIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function SparklesIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
    </svg>
  );
}

function CheckIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

function ExternalLinkIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
    </svg>
  );
}

function DashboardIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
    </svg>
  );
}

function DownloadIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4" />
    </svg>
  );
}

function CopyIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  );
}

function WizardIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
    </svg>
  );
}

function EditIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  );
}
