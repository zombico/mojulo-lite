'use client';

/**
 * ProtocolConfirmCard Component
 *
 * Displays the protocol recommendations and bot preview for user confirmation.
 * This is the main interaction point where users can adjust protocols
 * and deploy their bot in the inverted modular flow.
 */

import { useState } from 'react';
import { ModuloAvatar } from './ModuloAvatar';

export default function ProtocolConfirmCard({
  recommendedProtocols,
  presetIdentity,
  generatedConfigs,
  onAdjust,
  onDeploy,
  isDeploying,
}) {
  const [protocols, setProtocols] = useState(recommendedProtocols || {});
  const [protocolsExpanded, setProtocolsExpanded] = useState(false);

  const toggleProtocol = (name) => {
    setProtocols((prev) => ({
      ...prev,
      [name]: {
        ...prev[name],
        enabled: !prev[name]?.enabled,
      },
    }));
  };

  const identity = presetIdentity || generatedConfigs?.identity || {};
  const formConfig = generatedConfigs?.forms;
  const triageConfig = generatedConfigs?.triage;

  // Count enabled protocols
  const enabledCount = Object.values(protocols).filter((p) => p?.enabled).length;
  const hasEnabledProtocol = enabledCount > 0;

  return (
    <div className="border border-gray-700 rounded-lg p-4 bg-gray-800 shadow-sm my-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium text-gray-100 flex items-center gap-2">
          <ConfigIcon className="w-5 h-5 text-indigo-400" />
          Recommended Configuration
        </h3>
        <ModuloAvatar state="thinking" size={36} />
      </div>

      {/* Protocol toggles - collapsible */}
      <div className="mb-4 border border-gray-600 rounded-lg overflow-hidden">
        {/* Collapsible header */}
        <button
          type="button"
          onClick={() => setProtocolsExpanded(!protocolsExpanded)}
          className={`w-full flex items-center justify-between p-3 text-left transition ${
            hasEnabledProtocol ? 'bg-green-900/30 hover:bg-green-900/50' : 'bg-amber-900/30 hover:bg-amber-900/50'
          }`}
        >
          <span className="flex items-center gap-2">
            {hasEnabledProtocol ? (
              <>
                <CheckCircleIcon className="w-5 h-5 text-green-400" />
                <span className="text-green-300 font-medium">
                  {enabledCount} protocol{enabledCount !== 1 ? 's' : ''} selected
                </span>
              </>
            ) : (
              <>
                <WarningIcon className="w-5 h-5 text-amber-400" />
                <span className="text-amber-300 font-medium">At least one protocol must be enabled</span>
              </>
            )}
          </span>
          <ChevronIcon className={`w-5 h-5 text-gray-400 transition-transform ${protocolsExpanded ? 'rotate-180' : ''}`} />
        </button>

        {/* Expandable content */}
        {protocolsExpanded && (
          <div className="p-2 space-y-1 bg-gray-800 border-t border-gray-600">
            <ProtocolToggle
              name="knowledge"
              label="Knowledge"
              config={protocols.knowledge}
              onChange={() => toggleProtocol('knowledge')}
              icon={<BookIcon className="w-4 h-4" />}
            />
            <ProtocolToggle
              name="forms"
              label="Forms"
              config={protocols.forms}
              onChange={() => toggleProtocol('forms')}
              icon={<FormIcon className="w-4 h-4" />}
            />
            <ProtocolToggle
              name="appointments"
              label="Appointments"
              config={protocols.appointments}
              onChange={() => toggleProtocol('appointments')}
              icon={<CalendarIcon className="w-4 h-4" />}
            />
            <ProtocolToggle
              name="triage"
              label="Triage"
              config={protocols.triage}
              onChange={() => toggleProtocol('triage')}
              icon={<SplitIcon className="w-4 h-4" />}
            />
          </div>
        )}
      </div>

      {/* Preview */}
      <div className="bg-gray-700 rounded-lg p-3 mb-4 text-sm">
        <h4 className="font-medium text-gray-200 mb-2">Preview</h4>
        <div className="space-y-1 text-gray-300">
          <div>
            <span className="font-medium">Bot name:</span> {identity.botName || 'unnamed-bot'}
          </div>
          <div>
            <span className="font-medium">First message:</span>{' '}
            <span className="text-gray-400">"{identity.firstMessage || 'Hello!'}"</span>
          </div>
          {protocols.forms?.enabled && formConfig?.formSchema && (
            <div>
              <span className="font-medium">Form:</span>{' '}
              {formConfig.fieldCount || 0} field(s)
            </div>
          )}
          {protocols.triage?.enabled && triageConfig?.routes && (
            <div>
              <span className="font-medium">Triage routes:</span>{' '}
              {triageConfig.routeCount || triageConfig.routes.length} destination(s)
            </div>
          )}
          {identity.suggestedPrompts && identity.suggestedPrompts.length > 0 && (
            <div>
              <span className="font-medium">Suggested prompts:</span>
              <ul className="mt-1 ml-4 list-disc text-gray-400">
                {identity.suggestedPrompts.slice(0, 3).map((prompt, idx) => (
                  <li key={idx}>{prompt}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 justify-end">
        <button
          onClick={onAdjust}
          disabled={isDeploying}
          className="px-4 py-2 border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-700 transition text-sm font-medium disabled:opacity-50"
        >
          Adjust
        </button>
        <button
          onClick={() => onDeploy(protocols)}
          disabled={isDeploying || !hasEnabledProtocol}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {isDeploying ? (
            <>
              <Spinner className="w-4 h-4" />
              Building...
            </>
          ) : (
            <>
              Build
              <ArrowIcon className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function ProtocolToggle({ name, label, config, onChange, icon }) {
  const isEnabled = config?.enabled || false;
  const reason = config?.reason || '';

  return (
    <label className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-700 cursor-pointer">
      <input
        type="checkbox"
        checked={isEnabled}
        onChange={onChange}
        className="rounded border-gray-500 bg-gray-700 text-indigo-500 focus:ring-indigo-500"
      />
      <span className="text-gray-400">{icon}</span>
      <span className="font-medium capitalize text-gray-200">{label}</span>
      <span className="text-gray-400 text-sm flex-1 truncate">{reason}</span>
    </label>
  );
}

// Icons
function ConfigIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function BookIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
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

function ArrowIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
    </svg>
  );
}

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

function CheckCircleIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function WarningIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  );
}

function ChevronIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function SplitIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
    </svg>
  );
}
