'use client';

import { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useModularWizard } from './ModularWizardContext';
import { generateStepConfigs } from './config/ModularBotCreationSteps';
import Theatre from '../../Theatre';
import { parseModularDeploymentConfig, isModularDeployment } from '@/lib/config-builder';
import { useBreadcrumbs } from '@/contexts/BreadcrumbsContext';

// Step Components (modular replicas)
import CoreSetup from './steps/CoreSetup';
import Identity from './steps/Identity';
import KnowledgeConfig from './steps/KnowledgeConfig';
import FormGatheringConfig from './steps/FormGatheringConfig';
import AppointmentsConfig from './steps/AppointmentsConfig';
import TriageConfig from './steps/TriageConfig';
import OpticalReadConfig from './steps/OpticalReadConfig';
import Deploy from './steps/Deploy';
import ProtocolSelection from './steps/ProtocolSelection';

// Preview Components (modular replicas)
import CoreSetupPreview from './stepsPreview/CoreSetupPreview';
import ProtocolSelectionPreview from './stepsPreview/ProtocolSelectionPreview';
import IdentityPreview from './stepsPreview/IdentityPreview';
import KnowledgePreview from './stepsPreview/KnowledgePreview';
import FormGatheringPreview from './stepsPreview/FormGatheringPreview';
import AppointmentsPreview from './stepsPreview/AppointmentsPreview';
import TriagePreview from './stepsPreview/TriagePreview';
import OpticalReadPreview from './stepsPreview/OpticalReadPreview';

export default function ModularBotCreationWizard() {
  const searchParams = useSearchParams();
  const deploymentId = searchParams.get('from');
  const isClone = searchParams.get('clone') === 'true';
  const t = useTranslations('wizard');
  const tCommon = useTranslations('common');

  const {
    currentStep,
    nextStep,
    previousStep,
    validateStep,
    theatreContent,
    formData,
    updateFormData,
    enabledProtocols,
    steps,
    maxSteps,
    getStepId,
    getStepById,
    botSpaceId,
    hydrateFromConfig,
  } = useModularWizard();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isEditMode, setIsEditMode] = useState(false);
  const [step2ActiveTab, setStep2ActiveTab] = useState('desktop');
  const [step3ActiveTab, setStep3ActiveTab] = useState('documents');
  const [formGatheringActiveTab, setFormGatheringActiveTab] = useState('fields');
  const [opticalReadActiveTab, setOpticalReadActiveTab] = useState('fields');
  const { setBreadcrumbs } = useBreadcrumbs();

  // Generate step configs based on enabled protocols
  const stepConfigs = useMemo(() =>
    generateStepConfigs(enabledProtocols),
    [enabledProtocols]
  );

  // Get current step config with translated section and title
  const currentStepConfig = useMemo(() => {
    const config = stepConfigs.find(s => s.number === currentStep) || stepConfigs[0];
    return {
      ...config,
      section: config.sectionKey ? t(`steps.${config.sectionKey}`) : config.section,
      title: config.titleKey ? t(`titles.${config.titleKey}`) : config.title,
    };
  }, [stepConfigs, currentStep, t]);

  // Hide body scrollbar when wizard is mounted
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  // Load deployment config if 'from' parameter is present
  useEffect(() => {
    if (deploymentId) {
      loadDeploymentConfig(deploymentId);
      setIsEditMode(!isClone);
    }
  }, [deploymentId, isClone]);

  // Set breadcrumbs
  useEffect(() => {
    const crumbs = [
      { label: 'Dashboard', href: '/dashboard' },
    ];

    if (formData.botName) {
      crumbs.push({ label: formData.botName });
    } else {
      crumbs.push({ label: isEditMode ? 'Edit Bot' : isClone ? 'Clone Bot' : 'New Bot' });
    }

    setBreadcrumbs(crumbs);

    return () => setBreadcrumbs([]);
  }, [formData.botName, isEditMode, isClone, setBreadcrumbs]);

  async function loadDeploymentConfig(id) {
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`/api/deployments/${id}`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to load deployment');
      }

      const { deployment, documents: existingDocuments } = await response.json();

      // Prevent editing/cloning preview deployments
      if (deployment.is_preview) {
        throw new Error('Preview deployments cannot be edited or cloned');
      }

      // Parse and hydrate the modular wizard state from stored config
      const storedConfig = deployment.config;
      if (storedConfig) {
        // Use parseModularDeploymentConfig to reconstruct wizard state.
        // The GET endpoint redacts credentials but flags hasStoredApiKey so
        // the wizard can show "existing key configured" without the value.
        // Clones don't inherit the flag — the cloned bot has no row yet so
        // the preview can't reuse a server-side credential, and the user
        // must supply a fresh one.
        const parsedState = parseModularDeploymentConfig(storedConfig, {
          hasStoredApiKey: !isClone && !!deployment.hasStoredApiKey,
        });

        // Hydrate the wizard with the parsed state and existing documents
        hydrateFromConfig(parsedState, existingDocuments || []);

        console.log('[ModularWizard] Loaded deployment config:', {
          isModular: isModularDeployment(storedConfig),
          enabledProtocols: parsedState.enabledProtocols,
          botName: parsedState.core?.botName,
          documentsCount: existingDocuments?.length || 0,
        });
      }

    } catch (err) {
      console.error('Error loading deployment:', err);
      setError(`Failed to load deployment: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  const renderCurrentStep = () => {
    const stepId = getStepId(currentStep);
    const stepConfig = currentStepConfig;

    switch (stepId) {
      case 'core':
        return <CoreSetup stepConfig={stepConfig} isEditMode={isEditMode} />;
      case 'protocols':
        return <ProtocolSelection stepConfig={stepConfig} />;
      case 'identity':
        return <Identity stepConfig={stepConfig} isEditMode={isEditMode} />;
      case 'knowledge':
        return <KnowledgeConfig stepConfig={stepConfig} onTabSwitch={setStep3ActiveTab} botSpaceId={botSpaceId} />;
      case 'form-gathering':
        return <FormGatheringConfig stepConfig={stepConfig} />;
      case 'appointments':
        return <AppointmentsConfig stepConfig={stepConfig} />;
      case 'triage':
        return <TriageConfig stepConfig={stepConfig} />;
      case 'optical-read':
        return <OpticalReadConfig stepConfig={stepConfig} isEditMode={isEditMode} />;
      case 'deploy':
        return <Deploy
          stepConfig={stepConfig}
          deploymentId={deploymentId}
          isEditMode={isEditMode}
          flowType="modular"
        />;
      default:
        return null;
    }
  };

  const getTheatreContent = () => {
    if (theatreContent) {
      return theatreContent;
    }

    const stepId = getStepId(currentStep);

    switch (stepId) {
      case 'core':
        return <CoreSetupPreview />;
      case 'protocols':
        return <ProtocolSelectionPreview />;
      case 'identity':
        return <IdentityPreview activeTab={step2ActiveTab} />;
      case 'knowledge':
        if (formData.skipRag) return null;
        return <KnowledgePreview activeTab={step3ActiveTab} onTabSwitch={setStep3ActiveTab} botSpaceId={botSpaceId} />;
      case 'form-gathering':
        return <FormGatheringPreview activeTab={formGatheringActiveTab} />;
      case 'appointments':
        return <AppointmentsPreview />;
      case 'triage':
        return <TriagePreview />;
      case 'optical-read':
        return <OpticalReadPreview activeTab={opticalReadActiveTab} />;
      default:
        return (
          <div className="flex items-center justify-center h-full text-gray-400">
            <div className="text-center">
              <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              <p className="text-sm">{t('previewAfterDeployment')}</p>
            </div>
          </div>
        );
    }
  };

  const getTheatreTitle = () => {
    const stepId = getStepId(currentStep);

    switch (stepId) {
      case 'core':
        return t('theatre.modelConfiguration');
      case 'protocols':
        return t('theatre.protocolPreview');
      case 'identity':
        return t('theatre.botPreview');
      case 'knowledge':
        return t('theatre.knowledgeBase');
      case 'form-gathering':
        return t('theatre.formPreview');
      case 'appointments':
        return t('theatre.appointmentPreview');
      case 'triage':
        return t('theatre.triagePreview');
      case 'optical-read':
        return t('theatre.opticalReadPreview');
      case 'deploy':
        return t('theatre.preview');
      default:
        return t('theatre.preview');
    }
  };

  const getTheatreTabs = () => {
    const stepId = getStepId(currentStep);

    switch (stepId) {
      case 'identity':
        return [{ id: 'desktop', label: t('tabs.desktop') }];
      case 'knowledge':
        const docCount = formData.documents ? formData.documents.length : 0;
        const hasEmbeddings = !!formData.embeddings?.storageKey;
        return [
          { id: 'documents', label: t('tabs.documents'), badge: docCount > 0 ? docCount : null },
          {
            id: 'embeddings',
            label: 'Embeddings',
            badge: hasEmbeddings ? formData.embeddings.chunkCount || '✓' : '!',
          },
        ];
      case 'form-gathering':
        // Get field count for badge
        let fieldCount = 0;
        if (formData.generatedFormJson) {
          try {
            const formStructure = JSON.parse(formData.generatedFormJson);
            if (formStructure.sections) {
              formStructure.sections.forEach(section => {
                if (section.fields) {
                  fieldCount += section.fields.length;
                }
              });
            }
          } catch (e) {
            // Invalid JSON
          }
        }

        // Get branch count for badge
        let branchCount = 0;
        if (formData.generatedFormJson) {
          try {
            const formStructure = JSON.parse(formData.generatedFormJson);
            if (formStructure.branches) {
              branchCount = formStructure.branches.length;
            }
          } catch (e) {
            // Invalid JSON
          }
        }

        return [
          { id: 'fields', label: t('tabs.fieldsDisplay'), badge: fieldCount > 0 ? fieldCount : null },
          { id: 'flow', label: t('tabs.flow'), badge: branchCount > 0 ? branchCount : null },
          { id: 'json', label: t('tabs.jsonView') }
        ];
      case 'optical-read':
        const opticalReadFieldCount = (formData.opticalReadFields || []).length;
        return [
          { id: 'fields', label: t('tabs.fields'), badge: opticalReadFieldCount > 0 ? opticalReadFieldCount : null },
          { id: 'preview', label: t('tabs.preview') }
        ];
      default:
        return null;
    }
  };

  const getActiveTab = () => {
    const stepId = getStepId(currentStep);

    switch (stepId) {
      case 'identity':
        return step2ActiveTab;
      case 'knowledge':
        return step3ActiveTab;
      case 'form-gathering':
        return formGatheringActiveTab;
      case 'optical-read':
        return opticalReadActiveTab;
      default:
        return null;
    }
  };

  const handleTabChange = (tabId) => {
    const stepId = getStepId(currentStep);

    switch (stepId) {
      case 'identity':
        setStep2ActiveTab(tabId);
        break;
      case 'knowledge':
        setStep3ActiveTab(tabId);
        break;
      case 'form-gathering':
        setFormGatheringActiveTab(tabId);
        break;
      case 'optical-read':
        setOpticalReadActiveTab(tabId);
        break;
    }
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      nextStep();
    }
  };

  const isStepAccessible = (step) => {
    if (isEditMode) return true;
    return step <= currentStep + 1;
  };

  const handleStepClick = (step) => {
    if (isStepAccessible(step) && step !== currentStep) {
      if (step > currentStep) {
        if (validateStep(currentStep)) {
          const diff = step - currentStep;
          for (let i = 0; i < diff; i++) {
            nextStep();
          }
        }
      } else {
        const diff = currentStep - step;
        for (let i = 0; i < diff; i++) {
          previousStep();
        }
      }
    }
  };

  const canGoBack = currentStep > 1;
  const canGoNext = currentStep < maxSteps;
  const isLastStep = currentStep === maxSteps;

  const getStatusBadge = () => {
    if (isEditMode) return t('badges.modifying');
    if (isClone) return t('badges.clone');
    return t('badges.new');
  };

  // Translate step section and title from config keys
  const getStepSection = (stepConfig) => {
    return stepConfig.sectionKey ? t(`steps.${stepConfig.sectionKey}`) : stepConfig.section;
  };

  const getStepTitle = (stepConfig) => {
    return stepConfig.titleKey ? t(`titles.${stepConfig.titleKey}`) : stepConfig.title;
  };

  if (loading && deploymentId) {
    return (
      <div className="flex flex-col items-center justify-center bg-gray-900" style={{ height: 'calc(100vh - 33px)' }}>
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-teal-500 mb-4"></div>
          <p className="text-gray-400">{t('loadingDeployment')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col bg-gray-900" style={{ height: 'calc(100vh - 33px)' }}>

      <div className="border-b border-gray-700 bg-gray-900 px-8 py-2">

        {/* Badges and Stepper */}
        <div className="flex items-center gap-4 justify-between mb-2">
          <div className="flex gap-2 items-center">
            <span className={`px-3 py-1 text-xs font-medium rounded-full whitespace-nowrap ${isEditMode
              ? 'bg-blue-900/50 text-blue-400'
              : isClone
                ? 'bg-purple-900/50 text-purple-400'
                : 'bg-teal-900/50 text-teal-400'
              }`}>
              {getStatusBadge()}
            </span>
          </div>
          {/* Stepper */}
          <div className="flex gap-3">
            {stepConfigs.map((stepConfig) => {
              const step = stepConfig.number;
              const isAccessible = isStepAccessible(step);
              const isActive = step === currentStep;
              const isCompleted = step < currentStep;
              const isFilled = deploymentId ? true : (isCompleted || isActive);

              return (
                <div key={step} className="min-w-[100px]">
                  <button
                    type="button"
                    onClick={() => handleStepClick(step)}
                    disabled={!isAccessible}
                    title={getStepSection(stepConfig)}
                    className={`w-full text-center transition ${isAccessible ? 'cursor-pointer' : 'cursor-not-allowed'
                      }`}
                  >
                    {/* Icon and step name */}
                    <div className={`flex justify-center items-center gap-1.5 text-xs transition mb-2 ${
                      isActive ? 'font-semibold text-teal-400' : isAccessible ? 'text-gray-400' : 'text-gray-600'
                      }`}>
                      <span className="flex-shrink-0">{stepConfig.icon}</span>
                      <span>{getStepSection(stepConfig)}</span>
                    </div>

                    {/* Progress bar */}
                    <div>
                      <div
                        className={`h-1.5 rounded-full transition ${isActive ? 'bg-teal-500' : isFilled ? 'bg-gray-600' : 'bg-gray-700'
                          } ${isAccessible && !isActive ? 'hover:bg-gray-500' : ''}`}
                      />
                    </div>

                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Content Area - Left and Right Panels */}
      <div className="flex-1 overflow-hidden pb-16">
        {/* Centered wrapper for both panels */}
        <div className="flex w-full max-w-[1800px] mx-auto h-full">
          {/* Left Panel: Step Content (golden ratio: φ ≈ 38.2%) */}
          <div className="w-[38.2%] min-w-[600px] flex flex-col bg-gray-800 border-r border-gray-700">
            {/* Content wrapper: max-width + align right */}
            <div className="flex-1 flex flex-col w-full max-w-[720px] m-auto overflow-hidden">
              {/* Error Messages */}
              {error && (
                <div className="px-8 py-3 bg-red-900/30 border-b border-red-800 text-red-400 text-sm">
                  {error}
                </div>
              )}

              {/* Step Content */}
              <div className="flex-1 overflow-auto px-8 py-6">
                {renderCurrentStep()}
              </div>
            </div>
          </div>

          {/* Right Panel: Theatre (golden ratio: 1/φ ≈ 61.8%) */}
          <div className="w-[61.8%] bg-gray-900 max-w-[990px]">
            <Theatre
              title={getTheatreTitle()}
              tabs={getTheatreTabs()}
              activeTab={getActiveTab()}
              onTabChange={handleTabChange}
            >
              {getTheatreContent()}
            </Theatre>
          </div>
        </div>
      </div>

      {/* Bottom Navigation */}
      {!isLastStep && (
        <div className="absolute bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-700 px-8 py-4">
          <div className="flex items-center justify-between max-w-4xl mx-auto">
            <button
              type="button"
              onClick={previousStep}
              disabled={!canGoBack}
              className="px-4 py-2 text-gray-300 font-medium hover:text-gray-100 disabled:text-gray-600 disabled:cursor-not-allowed transition"
            >
              {tCommon('back')}
            </button>
            <button
              type="button"
              onClick={handleNext}
              disabled={!canGoNext}
              className="px-6 py-2 bg-teal-600 text-white font-medium rounded-md hover:bg-teal-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed transition"
            >
              {tCommon('next')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
