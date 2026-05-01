'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useModularWizard } from '../ModularWizardContext';
import WizardStep from '../WizardStep';
import DocumentUploader from '../../../DocumentUploader';

export default function KnowledgeConfig({ stepConfig, onTabSwitch, botSpaceId = null }) {
  const { formData, updateFormData, errors, clearError } = useModularWizard();
  const t = useTranslations('wizard.knowledge');
  const [botSpaceDocuments, setBotSpaceDocuments] = useState([]);
  const [loadingBotSpaceDocs, setLoadingBotSpaceDocs] = useState(false);
  const [showBotSpaceSelector, setShowBotSpaceSelector] = useState(false);

  // The bundled multilingual-e5-small ONNX model is always available —
  // weights ship with the artifact. Fetch the model name once for display.
  const [embeddingsModel, setEmbeddingsModel] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/settings/embeddings-status');
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setEmbeddingsModel(data.model || null);
      } catch {
        /* non-fatal — vector mode stays available */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const ragMode = formData.ragMode || 'keyword';

  function handleRagModeChange(nextMode) {
    if (nextMode === ragMode) return;
    // Flipping mode invalidates any prior vector artifact — embeddings must be
    // re-generated against the new corpus / mode pair.
    updateFormData({ ragMode: nextMode, embeddings: null });
    clearError('embeddings');
    clearError('documents');
  }

  // Fetch bot space documents when selector is opened
  useEffect(() => {
    if (showBotSpaceSelector && botSpaceId && botSpaceDocuments.length === 0) {
      fetchBotSpaceDocuments();
    }
  }, [showBotSpaceSelector, botSpaceId]);

  async function fetchBotSpaceDocuments() {
    setLoadingBotSpaceDocs(true);
    try {
      // Lite has no bot-spaces — the /api/documents list is the single pool.
      const response = await fetch('/api/documents');
      if (response.ok) {
        const { documents } = await response.json();
        setBotSpaceDocuments(
          (documents || []).map((d) => ({
            id: d.id,
            file_name: d.originalName,
            storage_path: null,
            mime_type: d.mimeType,
          }))
        );
      }
    } catch (err) {
      console.error('Error fetching documents:', err);
    } finally {
      setLoadingBotSpaceDocs(false);
    }
  }

  const handleDocumentsChange = (docs) => {
    const previousCount = formData.documents?.length || 0;
    updateFormData({ documents: docs });
    clearError('documents');

    // Switch to documents tab when new documents are uploaded
    if (onTabSwitch && docs.length > previousCount) {
      onTabSwitch('documents');
    }
  };

  const handleSelectBotSpaceDocument = (doc) => {
    // Check if document is already selected
    const isAlreadySelected = formData.documents?.some(d => d.id === doc.id);
    if (isAlreadySelected) return;

    // Mark as linked (not uploaded directly) so we can show "Unlink" instead of "Delete"
    const linkedDoc = { ...doc, isLinked: true };
    const updatedDocs = [...(formData.documents || []), linkedDoc];
    updateFormData({ documents: updatedDocs });
    clearError('documents');

    // Switch to documents tab
    if (onTabSwitch) {
      onTabSwitch('documents');
    }
  };

  const isDocumentSelected = (docId) => {
    return formData.documents?.some(d => d.id === docId);
  };

  function formatFileSize(bytes) {
    if (!bytes) return '-';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  return (
    <WizardStep
      stepNumber={stepConfig.number}
      title={stepConfig.section}
      description={stepConfig.description}
    >
      <div className="space-y-6">
        {/* RAG Strategy toggle (keyword vs vector). The chat builder has the
            equivalent set_rag_mode tool; this is the wizard mirror. */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-100">RAG Strategy</h3>
              <p className="text-xs text-gray-400 mt-1">
                Locked at build time. Switching after embedding will invalidate the existing artifact.
              </p>
            </div>
            {ragMode === 'vector' && formData.embeddings?.storageKey && onTabSwitch && (
              <button
                type="button"
                onClick={() => onTabSwitch('embeddings')}
                className="text-xs text-teal-400 hover:text-teal-300 font-medium whitespace-nowrap"
              >
                Review embeddings →
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => handleRagModeChange('keyword')}
              className={`text-left p-3 rounded-lg border transition ${
                ragMode === 'keyword'
                  ? 'border-teal-500 bg-teal-900/30 text-teal-200'
                  : 'border-gray-700 bg-gray-900 text-gray-300 hover:border-gray-600'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-semibold">Keyword search</span>
                <span className="px-1.5 py-0.5 bg-gray-800 text-gray-400 rounded text-[10px] font-medium">
                  Default
                </span>
              </div>
              <p className="text-[11px] text-gray-500 leading-snug">
                Local TF-IDF over document text. No factory dependency at runtime.
              </p>
            </button>

            <button
              type="button"
              onClick={() => handleRagModeChange('vector')}
              className={`text-left p-3 rounded-lg border transition ${
                ragMode === 'vector'
                  ? 'border-teal-500 bg-teal-900/30 text-teal-200'
                  : 'border-gray-700 bg-gray-900 text-gray-300 hover:border-gray-600'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-semibold">Vector embeddings</span>
                <span className="px-1.5 py-0.5 bg-teal-900/50 text-teal-400 rounded text-[10px] font-medium">
                  {embeddingsModel ? embeddingsModel.split('-').slice(-2).join('-') : 'local'}
                </span>
              </div>
              <p className="text-[11px] text-gray-500 leading-snug">
                Semantic recall via the bundled multilingual ONNX model. Embeds in-process — no factory dependency at runtime.
              </p>
            </button>
          </div>

          {errors.embeddings && (
            <p className="text-xs text-red-400">{errors.embeddings}</p>
          )}
        </div>

        {/* Document Uploader */}
            <div>
              <DocumentUploader
                documents={formData.documents}
                onUpload={handleDocumentsChange}
                hideFileList={true}
                botSpaceId={botSpaceId}
              />
              {errors.documents && (
                <p className="mt-2 text-sm text-red-400">{errors.documents}</p>
              )}
            </div>

            {/* Bot Space Document Selector - Only show when in a bot space */}
            {botSpaceId && (
              <div className="border border-gray-700 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowBotSpaceSelector(!showBotSpaceSelector)}
                  className="w-full px-4 py-3 bg-gray-700 hover:bg-gray-600 transition flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                    <span className="font-medium text-gray-300">{t('selectFromBotSpace')}</span>
                  </div>
                  <svg
                    className={`w-5 h-5 text-gray-500 transition-transform ${showBotSpaceSelector ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {showBotSpaceSelector && (
                  <div className="p-4 border-t border-gray-700">
                    {loadingBotSpaceDocs ? (
                      <div className="text-center py-4">
                        <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-purple-400"></div>
                        <p className="mt-2 text-sm text-gray-500">{t('loadingDocuments')}</p>
                      </div>
                    ) : botSpaceDocuments.length === 0 ? (
                      <p className="text-sm text-gray-500 text-center py-4">
                        {t('noDocumentsInSpace')}
                      </p>
                    ) : (
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {botSpaceDocuments.map((doc) => {
                          const selected = isDocumentSelected(doc.id);
                          return (
                            <div
                              key={doc.id}
                              className={`flex items-center justify-between p-3 rounded-lg border transition ${selected
                                  ? 'border-purple-500 bg-purple-900/30'
                                  : 'border-gray-600 hover:border-gray-500 hover:bg-gray-700'
                                }`}
                            >
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                <svg className="w-5 h-5 text-gray-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                                </svg>
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-gray-100 truncate">{doc.file_name}</p>
                                  <p className="text-xs text-gray-500">{formatFileSize(doc.file_size)}</p>
                                </div>
                              </div>
                              {selected ? (
                                <span className="px-2 py-1 text-xs font-medium text-purple-300 bg-purple-900/50 rounded">
                                  {t('selected')}
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleSelectBotSpaceDocument(doc)}
                                  className="px-3 py-1.5 text-sm bg-purple-600 text-white rounded-md hover:bg-purple-500 transition"
                                >
                                  {t('select')}
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

{/* Upload confirmation section removed - documents shown in preview panel */}
      </div>
    </WizardStep>
  );
}
