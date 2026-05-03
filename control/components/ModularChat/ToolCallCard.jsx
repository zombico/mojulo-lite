'use client';

/**
 * ToolCallCard Component
 *
 * Displays Claude's tool execution in the chat log for the inverted modular flow.
 * Shows tool name, status (running/completed/failed), and results.
 */

import { useState, useEffect } from 'react';

/**
 * Tool status states
 */
export const TOOL_STATUS = {
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
};

/**
 * Tool icons mapping
 */
const TOOL_ICONS = {
  process_documents: DocumentIcon,
  infer_intent: TargetIcon,
  recommend_protocols: PuzzleIcon,
  generate_form_schema: FormIcon,
  generate_appointment_config: CalendarIcon,
  compose_identity: RobotIcon,
  save_modular_bot: RocketIcon,
  // Back-compat: legacy chat sessions persisted the old tool name
  deploy_modular_bot: RocketIcon,
};

/**
 * Tool display labels (short form for inline display)
 */
const TOOL_LABELS = {
  process_documents: 'Documents',
  infer_intent: 'Intent',
  recommend_protocols: 'Protocols',
  generate_form_schema: 'Form',
  generate_appointment_config: 'Appointments',
  compose_identity: 'Identity',
  save_modular_bot: 'Save',
  deploy_modular_bot: 'Save',
};

/**
 * CollapsibleToolCalls - Groups tool calls in a collapsible container
 * Automatically collapses when shouldCollapse prop becomes true
 */
export function CollapsibleToolCalls({ toolCalls, shouldCollapse }) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Auto-collapse when shouldCollapse becomes true
  useEffect(() => {
    if (shouldCollapse) {
      setIsCollapsed(true);
    }
  }, [shouldCollapse]);

  if (!toolCalls || toolCalls.length === 0) return null;

  const completedCount = toolCalls.filter(t => t.status === TOOL_STATUS.COMPLETED).length;
  const failedCount = toolCalls.filter(t => t.status === TOOL_STATUS.FAILED).length;
  const runningCount = toolCalls.filter(t => t.status === TOOL_STATUS.RUNNING).length;

  return (
    <div className="border border-gray-600 rounded-lg bg-gray-800 overflow-hidden">
      {/* Collapsible header */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-300 hover:bg-gray-700 transition-colors"
      >
        <ChevronIcon className={`w-3 h-3 transition-transform ${isCollapsed ? '' : 'rotate-90'}`} />
        <ToolIcon className="w-3.5 h-3.5" />
        <span className="font-medium">Tool calls</span>
        <span className="text-gray-400">
          ({completedCount} completed{failedCount > 0 ? `, ${failedCount} failed` : ''}{runningCount > 0 ? `, ${runningCount} running` : ''})
        </span>
      </button>

      {/* Tool calls list */}
      {!isCollapsed && (
        <div className="px-3 pb-2 space-y-1">
          {toolCalls.map((tc, idx) => (
            <ToolCallItem
              key={idx}
              toolName={tc.tool}
              status={tc.status}
              result={tc.result}
              error={tc.error}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Compact inline tool call item - text and output on same line
 */
function ToolCallItem({ toolName, status, result, error }) {
  const [showDetails, setShowDetails] = useState(false);

  const Icon = TOOL_ICONS[toolName] || DefaultIcon;
  const label = TOOL_LABELS[toolName] || toolName;
  const resultSummary = renderToolResultSummary(toolName, result);

  const statusColors = {
    [TOOL_STATUS.RUNNING]: 'text-blue-400',
    [TOOL_STATUS.COMPLETED]: 'text-green-400',
    [TOOL_STATUS.FAILED]: 'text-red-400',
  };

  const statusIcons = {
    [TOOL_STATUS.RUNNING]: <Spinner className="w-3 h-3 text-blue-400" />,
    [TOOL_STATUS.COMPLETED]: <CheckIcon className="w-3 h-3 text-green-400" />,
    [TOOL_STATUS.FAILED]: <XIcon className="w-3 h-3 text-red-400" />,
  };

  const hasDetails = result && Object.keys(result).length > 0;

  return (
    <div className="text-xs">
      {/* Main line: icon + label + status + summary */}
      <div className="flex items-center gap-1.5 py-0.5">
        <Icon className="w-3 h-3 text-gray-400 flex-shrink-0" />
        <span className={`font-medium ${statusColors[status] || 'text-gray-300'}`}>{label}</span>
        {statusIcons[status]}
        {status === TOOL_STATUS.COMPLETED && resultSummary && (
          <>
            <span className="text-gray-500 mx-1">—</span>
            <span className="text-gray-300 truncate">{resultSummary}</span>
          </>
        )}
        {status === TOOL_STATUS.FAILED && error && (
          <>
            <span className="text-gray-500 mx-1">—</span>
            <span className="text-red-400 truncate">{error}</span>
          </>
        )}
      </div>

      {/* Details dropdown (next line) */}
      {hasDetails && (
        <>
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="ml-4 text-gray-500 hover:text-gray-300 flex items-center gap-0.5"
          >
            <ChevronIcon className={`w-2.5 h-2.5 transition-transform ${showDetails ? 'rotate-90' : ''}`} />
            <span>{showDetails ? 'hide' : 'details'}</span>
          </button>
          {showDetails && (
            <pre className="ml-4 mt-1 p-2 bg-gray-900 rounded text-xs text-gray-300 overflow-x-auto border border-gray-600 max-h-32">
              {JSON.stringify(result, null, 2)}
            </pre>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Original ToolCallCard - kept for backwards compatibility
 */
export default function ToolCallCard({ toolName, status, result, error }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const Icon = TOOL_ICONS[toolName] || DefaultIcon;
  const label = TOOL_LABELS[toolName] || toolName;

  const statusColors = {
    [TOOL_STATUS.RUNNING]: 'border-blue-700 bg-blue-900/30',
    [TOOL_STATUS.COMPLETED]: 'border-green-700 bg-green-900/30',
    [TOOL_STATUS.FAILED]: 'border-red-700 bg-red-900/30',
  };

  const statusIcons = {
    [TOOL_STATUS.RUNNING]: <Spinner className="w-4 h-4 text-blue-400" />,
    [TOOL_STATUS.COMPLETED]: <CheckIcon className="w-4 h-4 text-green-400" />,
    [TOOL_STATUS.FAILED]: <XIcon className="w-4 h-4 text-red-400" />,
  };

  const resultSummary = renderToolResultSummary(toolName, result);

  return (
    <div
      className={`border rounded-lg p-3 my-2 ${statusColors[status] || 'border-gray-600 bg-gray-800'}`}
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-gray-400" />
        <span className="font-medium text-sm text-gray-200">{label}</span>
        <div className="flex-1" />
        {statusIcons[status]}
      </div>

      {/* Result summary */}
      {status === TOOL_STATUS.COMPLETED && resultSummary && (
        <div className="mt-2 text-sm text-gray-300">
          {resultSummary}
        </div>
      )}

      {/* Error message */}
      {status === TOOL_STATUS.FAILED && error && (
        <div className="mt-2 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Expandable details */}
      {status === TOOL_STATUS.COMPLETED && result && Object.keys(result).length > 0 && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="mt-2 text-xs text-gray-400 hover:text-gray-200 flex items-center gap-1"
        >
          <ChevronIcon className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
          {isExpanded ? 'Hide details' : 'Show details'}
        </button>
      )}

      {isExpanded && result && (
        <pre className="mt-2 p-2 bg-gray-900 rounded text-xs text-gray-300 overflow-x-auto border border-gray-600">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}

/**
 * Render tool-specific result summary
 */
function renderToolResultSummary(toolName, result) {
  if (!result) return null;

  switch (toolName) {
    case 'process_documents':
      return `Embedded ${result.documentsProcessed || 0} document(s) into ${result.chunkCount || 0} chunks`;

    case 'infer_intent':
      const confidence = Math.round((result.confidence || 0) * 100);
      return `Intent: ${result.intent} (${confidence}% confidence)`;

    case 'recommend_protocols':
      if (result.protocols) {
        const enabled = Object.entries(result.protocols)
          .filter(([_, v]) => v.enabled)
          .map(([k]) => k);
        return enabled.length > 0
          ? `Recommended: ${enabled.join(', ')}`
          : 'No protocols recommended';
      }
      return result.summary;

    case 'generate_form_schema':
      return `Created form with ${result.fieldCount || 0} field(s)`;

    case 'generate_appointment_config':
      return result.message;

    case 'compose_identity':
      return result.identity
        ? `Bot: ${result.identity.botName}`
        : result.message;

    case 'save_modular_bot':
    case 'deploy_modular_bot':
      return result.deploymentId
        ? `Saved: ${result.botName}`
        : result.message;

    default:
      return result.message || 'Completed';
  }
}

// Icons
function Spinner({ className }) {
  return (
    <svg className={`animate-spin ${className}`} fill="none" viewBox="0 0 24 24">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
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

function XIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function ChevronIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

function DocumentIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

function TargetIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" strokeWidth={2} />
      <circle cx="12" cy="12" r="6" strokeWidth={2} />
      <circle cx="12" cy="12" r="2" strokeWidth={2} />
    </svg>
  );
}

function PuzzleIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />
    </svg>
  );
}

function FormIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
    </svg>
  );
}

function CalendarIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

function RobotIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  );
}

function RocketIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
    </svg>
  );
}

function DefaultIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
    </svg>
  );
}

function ToolIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}
