'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useModularWizard } from '../ModularWizardContext';
import WizardStep from '../WizardStep';
import { buildDeploymentConfig } from '@/lib/config-builder';
import { buildBedrockModelId } from '@/lib/llm-providers';
import PreviewBot from '../stepsPreview/PreviewBot';

/**
 * Mojulo-Lite is a config saver, not a deployer.
 *
 * The user-facing action is one click that chains:
 *   1. POST/PATCH /api/deployments    → write config row (status=saved)
 *   2. POST /api/deployments/{id}/build → produce ZIP (status=ready)
 *
 * If save succeeds but build fails, the row stays saved and a retry-build
 * button surfaces — no work is lost.
 *
 * The right-hand Theatre runs the deployed bot's actual client in an iframe
 * (puppeteered by the wizard config — see PreviewBot.jsx) so users can
 * validate the bot's UX without rebuilding between every tweak.
 */
export default function Deploy({ stepConfig, deploymentId = null, isEditMode = false, flowType = 'modular' }) {
  const router = useRouter();
  const { formData, previousStep, setTheatreContent, enabledProtocols, botSpaceId } = useModularWizard();
  const t = useTranslations('wizard.deployment');
  const tWizard = useTranslations('wizard');
  const tModular = useTranslations('wizard.modular');

  const [phase, setPhase] = useState('idle'); // idle | saving | building | done
  const [error, setError] = useState('');
  const [savedDeployment, setSavedDeployment] = useState(null);
  const [builtArtifact, setBuiltArtifact] = useState(null);

  const saving = phase === 'saving';
  const building = phase === 'building';
  const inFlight = saving || building;

  useEffect(() => {
    setTheatreContent(<PreviewBot />);
    return () => setTheatreContent(null);
  }, [setTheatreContent]);

  // Ensure embeddings cover whatever retrieval-bearing protocols are enabled.
  // - Knowledge: KnowledgePreview.jsx already calls /api/vectorize-rag with
  //   docs, so formData.embeddings is populated when we get here.
  // - Triage: routes are added in TriageConfig.jsx without embedding. We
  //   embed them here at deploy time so the artifact has a coherent index.
  // - Knowledge + triage: both contribute chunks to a single blob, keyed by
  //   the same wizardToken so re-runs replace cleanly.
  async function ensureEmbeddings() {
    const wantsVector = enabledProtocols.knowledge || enabledProtocols.triage;
    if (!wantsVector) return null;

    const docs = enabledProtocols.knowledge
      ? (formData.documents || []).map((doc) => ({
          id: doc.id,
          storagePath: doc.storagePath || doc.storage_path,
          originalName: doc.originalName || doc.file_name,
        }))
      : [];
    const routes = enabledProtocols.triage
      ? (formData.triageRoutes || []).map((r) => ({
          deploymentId: r.deploymentId,
          name: r.name,
          description: r.description,
        }))
      : [];

    if (docs.length === 0 && routes.length === 0) return null;

    // If knowledge-only and KnowledgePreview already produced embeddings, reuse.
    if (
      enabledProtocols.knowledge &&
      !enabledProtocols.triage &&
      formData.embeddings?.storageKey
    ) {
      return formData.embeddings;
    }

    const res = await fetch('/api/vectorize-rag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        documents: docs,
        routes,
        wizardToken: formData.embeddings?.wizardToken,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to generate embeddings');
    }
    return await res.json();
  }

  function buildPayload(embeddings) {
    const transformedFormData = {
      ...formData,
      formStructure: formData.generatedFormJson && formData.generatedFormJson.trim()
        ? {
            naturalLanguageInput: formData.formStructureInput || '',
            generatedJson: JSON.parse(formData.generatedFormJson),
          }
        : undefined,
      formSendHome: formData.formSendHome || false,
      formCompletionWebhook: formData.formCompletionWebhook || '',
      afterSubmitChatMessage: formData.afterSubmitChatMessage || '',
      termsAndConditions: formData.termsAndConditions || '',
      uiSettings: {
        chatDisplayName: formData.chatDisplayName || formData.uiSettings?.chatDisplayName || 'Bot',
        placeholder: formData.placeholder || formData.uiSettings?.placeholder || 'Type your message...',
      },
    };

    const apiKeyId = formData.apiKeyId || null;
    const deploymentConfig = buildDeploymentConfig(transformedFormData, flowType, { enabledProtocols, apiKeyId });

    return {
      botName: formData.botName,
      config: deploymentConfig,
      documentIds: formData.documents?.map((d) => d.id) || [],
      flowType,
      paradigm: 'modular',
      enabledProtocols,
      appointmentDestinations: enabledProtocols.appointments ? formData.appointmentDestinations : undefined,
      triageDestinations: enabledProtocols.triage ? formData.triageRoutes : undefined,
      botSpaceId: !isEditMode ? botSpaceId : undefined,
      embeddings: embeddings || null,
      apiKeyId,
    };
  }

  async function runBuild(saved) {
    setPhase('building');
    const response = await fetch(saved.buildUrl, { method: 'POST' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.error || t('buildFailed'));
    }
    setBuiltArtifact({
      downloadUrl: body.downloadUrl,
      cached: body.cached,
      status: body.status,
    });
  }

  async function handleSaveAndBuild() {
    let saved = null;
    try {
      setPhase('saving');
      setError('');
      setBuiltArtifact(null);

      const embeddings = await ensureEmbeddings();
      const payload = buildPayload(embeddings);

      const url = isEditMode && deploymentId
        ? `/api/deployments/${deploymentId}`
        : '/api/deployments';
      const method = isEditMode && deploymentId ? 'PATCH' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || t('saveFailed'));
      }

      saved = {
        deploymentId: body.deploymentId,
        botName: body.botName || formData.botName,
        status: body.status,
        buildUrl: body.buildUrl,
        downloadUrl: body.downloadUrl,
      };
      setSavedDeployment(saved);

      await runBuild(saved);
      setPhase('done');
    } catch (err) {
      console.error('Save/build error:', err);
      setError(err.message || (saved ? t('buildErrorFallback') : t('saveErrorFallback')));
      setPhase(saved ? 'idle' : 'idle');
    }
  }

  async function handleRetryBuild() {
    if (!savedDeployment?.deploymentId) return;
    try {
      setError('');
      await runBuild(savedDeployment);
      setPhase('done');
    } catch (err) {
      console.error('Build error:', err);
      setError(err.message || t('buildErrorFallback'));
      setPhase('idle');
    }
  }

  function getProtocolSummary() {
    const protocols = [];
    if (enabledProtocols.knowledge) protocols.push(tWizard('badges.knowledge'));
    if (enabledProtocols.formGathering) protocols.push(tWizard('badges.forms'));
    if (enabledProtocols.appointments) protocols.push(tWizard('badges.appointments'));
    if (enabledProtocols.triage) protocols.push(tWizard('badges.routing'));
    return protocols.join(' + ') || t('none');
  }

  return (
    <WizardStep
      stepNumber={stepConfig.number}
      title={stepConfig.section}
      description={stepConfig.description}
    >
      <div className="space-y-6">
        {/* Configuration Summary */}
        <div className="p-4 bg-gray-800 border border-gray-700 rounded-lg space-y-3">
          <h3 className="text-sm font-semibold text-gray-100">{t('configSummary')}</h3>
          <dl className="space-y-2 text-xs">
            <div className="flex justify-between">
              <dt className="text-gray-400">{t('botName')}</dt>
              <dd className="font-medium text-gray-100">{formData.botName}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-400">{t('provider')}</dt>
              <dd className="font-medium text-gray-100">{formData.provider}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-400">{t('model')}</dt>
              <dd className="font-medium text-gray-100">
                {formData.provider === 'bedrock' && formData.apiKey
                  ? (() => {
                      try {
                        const creds = JSON.parse(formData.apiKey);
                        return buildBedrockModelId(formData.model, creds.region);
                      } catch {
                        return formData.model;
                      }
                    })()
                  : formData.model}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-400">{tModular('protocols')}</dt>
              <dd className="font-medium text-gray-100">{getProtocolSummary()}</dd>
            </div>
            {enabledProtocols.knowledge && (
              <div className="flex justify-between">
                <dt className="text-gray-400">{t('documents')}</dt>
                <dd className="font-medium text-gray-100">
                  {formData.documents?.length || 0} {t('uploaded')}
                </dd>
              </div>
            )}
            {enabledProtocols.knowledge && (
              <div className="flex justify-between">
                <dt className="text-gray-400">Embeddings</dt>
                <dd className="font-medium text-gray-100">
                  <span className="text-teal-300">
                    {formData.embeddings?.chunkCount || 0} chunks
                  </span>
                </dd>
              </div>
            )}
            {enabledProtocols.formGathering && (
              <div className="flex justify-between">
                <dt className="text-gray-400">{t('formCollection')}</dt>
                <dd className="font-medium text-gray-100">{t('enabled')}</dd>
              </div>
            )}
            {enabledProtocols.appointments && (
              <div className="flex justify-between">
                <dt className="text-gray-400">{tModular('calendars')}</dt>
                <dd className="font-medium text-gray-100">
                  {tModular('configured', { count: formData.appointmentDestinations?.length || 0 })}
                </dd>
              </div>
            )}
            {enabledProtocols.triage && (
              <div className="flex justify-between">
                <dt className="text-gray-400">{tModular('triageRoutes')}</dt>
                <dd className="font-medium text-gray-100">
                  {tModular('configured', { count: formData.triageRoutes?.length || 0 })}
                </dd>
              </div>
            )}
          </dl>
          <button
            type="button"
            onClick={previousStep}
            className="text-xs text-teal-400 hover:text-teal-300 font-medium"
          >
            {t('editConfiguration')}
          </button>
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-800 text-red-400 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Save & Build — single primary action */}
        {!builtArtifact && (
          <button
            type="button"
            onClick={handleSaveAndBuild}
            disabled={inFlight}
            className={`w-full px-6 py-3 font-semibold rounded-md transition flex items-center justify-center gap-2 ${
              inFlight
                ? 'bg-gray-600 text-gray-300 cursor-not-allowed'
                : 'bg-teal-600 text-white hover:bg-teal-500'
            }`}
          >
            {inFlight ? (
              <>
                <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                {saving ? t('saving') : t('building')}
              </>
            ) : isEditMode ? (
              t('saveChanges')
            ) : (
              t('saveConfiguration')
            )}
          </button>
        )}

        {/* Save succeeded but build failed → retry build */}
        {savedDeployment && !builtArtifact && error && !inFlight && (
          <div className="p-4 bg-blue-900/30 border border-blue-800 rounded-lg space-y-3">
            <p className="text-xs text-blue-400">
              {t.rich('configurationSavedDesc', {
                name: savedDeployment.botName,
                mono: (chunks) => <span className="font-mono">{chunks}</span>,
              })}
            </p>
            <button
              type="button"
              onClick={handleRetryBuild}
              className="px-4 py-2 text-sm font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-500"
            >
              {t('buildArtifact')}
            </button>
          </div>
        )}

        {/* Build success → offer Download */}
        {builtArtifact && (
          <div className="p-4 bg-green-900/30 border border-green-800 rounded-lg space-y-3">
            <div className="flex items-start gap-3">
              <svg className="w-6 h-6 text-green-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-green-300 mb-1">
                  {builtArtifact.cached ? t('artifactReadyCached') : t('artifactBuilt')}
                </h4>
                <p className="text-xs text-green-400">
                  {t.rich('artifactReadyDesc', {
                    name: savedDeployment.botName,
                    mono: (chunks) => <span className="font-mono">{chunks}</span>,
                  })}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <a
                href={builtArtifact.downloadUrl}
                className="flex-1 min-w-[120px] px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-500 transition text-center"
              >
                {t('downloadArtifact')}
              </a>
              {formData.documents?.length > 0 && (
                <a
                  href={`${builtArtifact.downloadUrl}?withDocs=1`}
                  className="flex-1 min-w-[120px] px-4 py-2 bg-blue-700/40 border border-blue-600 text-blue-100 text-sm font-semibold rounded-md hover:bg-blue-700/60 transition text-center"
                >
                  {t('downloadArtifactWithDocs')}
                </a>
              )}
              <button
                type="button"
                onClick={() => router.push('/dashboard')}
                className="flex-1 min-w-[120px] px-4 py-2 bg-gray-700 text-gray-100 text-sm font-semibold rounded-md hover:bg-gray-600 transition"
              >
                {t('viewDeployments')}
              </button>
            </div>
          </div>
        )}

        <div className="p-4 bg-gray-800 border border-gray-700 rounded-lg">
          <p className="text-xs text-gray-400">
            {t('previewHelp')}
          </p>
        </div>
      </div>
    </WizardStep>
  );
}
