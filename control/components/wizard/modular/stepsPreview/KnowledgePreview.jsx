'use client';

import { useState } from 'react';
import { useModularWizard } from '../ModularWizardContext';
import './preview.css';

export default function KnowledgePreview({ activeTab = 'documents', onTabSwitch, botSpaceId = null }) {
  const { formData, updateFormData, clearError } = useModularWizard();
  const [deleting, setDeleting] = useState(null);
  const [deleteError, setDeleteError] = useState('');

  // RAG summary generation state
  const [generatingRagSummary, setGeneratingRagSummary] = useState(false);
  const [ragSummaryError, setRagSummaryError] = useState('');
  const [ragSummaryStatus, setRagSummaryStatus] = useState('');
  const [showRagModal, setShowRagModal] = useState(false);
  const [modalRagText, setModalRagText] = useState('');

  // Vector embeddings generation state
  const [generatingEmbeddings, setGeneratingEmbeddings] = useState(false);
  const [embeddingsError, setEmbeddingsError] = useState('');
  const [embeddingsStatus, setEmbeddingsStatus] = useState('');

  const formatFileSize = (bytes) => {
    if (!bytes) return 'Unknown';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getFileIcon = (mimeType) => {
    if (!mimeType) return 'text-blue-400';
    if (mimeType.includes('pdf')) return 'text-red-400';
    if (mimeType.includes('word') || mimeType.includes('doc')) return 'text-blue-400';
    if (mimeType.includes('text')) return 'text-gray-400';
    return 'text-blue-400';
  };

  // Right-side affordances are locked to the active RAG mode.
  const ragMode = formData.ragMode || 'keyword';
  const isVectorMode = ragMode === 'vector';

  // Separate documents into uploaded (personal) vs linked (bot space shared)
  const isSharedDocument = (doc) => doc.isLinked || doc.bot_space_id;
  const uploadedDocuments = (formData.documents || []).filter(doc => !isSharedDocument(doc));
  const linkedDocuments = (formData.documents || []).filter(doc => isSharedDocument(doc));

  const handleDelete = async (doc) => {
    if (!confirm(`Are you sure you want to delete "${doc.file_name || doc.originalName}"? This will permanently remove the file and cannot be undone.`)) {
      return;
    }

    setDeleting(doc.id);
    setDeleteError('');

    try {
      const response = await fetch(`/api/documents/${doc.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete file');
      }

      const updatedDocs = formData.documents.filter((d) => d.id !== doc.id);
      updateFormData({ documents: updatedDocs });
      clearError('documents');
    } catch (err) {
      console.error('Delete error:', err);
      setDeleteError(err.message || 'Failed to delete file');
    } finally {
      setDeleting(null);
    }
  };

  const handleUnlink = (doc) => {
    const updatedDocs = formData.documents.filter((d) => d.id !== doc.id);
    updateFormData({ documents: updatedDocs });
    clearError('documents');
  };

  // Vector RAG: send the wizard's documents to /api/vectorize-rag, which
  // chunks + embeds locally via the bundled multilingual-e5-small ONNX
  // model and stashes the JSON blob on the factory's filesystem. The
  // returned storage key rides forward in formData and is copied onto the
  // deployment row at save time.
  const handleGenerateEmbeddings = async () => {
    if (!formData.documents || formData.documents.length === 0) {
      setEmbeddingsError('Please upload at least one document first');
      return;
    }

    try {
      setGeneratingEmbeddings(true);
      setEmbeddingsError('');
      setEmbeddingsStatus('Embedding documents…');

      const documents = formData.documents.map((doc) => ({
        id: doc.id,
        storagePath: doc.storagePath || doc.storage_path,
        originalName: doc.originalName || doc.file_name,
      }));

      const res = await fetch('/api/vectorize-rag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documents,
          // Reuse the wizard's existing token so re-runs overwrite the same
          // blob (single source of truth per wizard session).
          wizardToken: formData.embeddings?.wizardToken,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to generate embeddings');
      }

      const data = await res.json();
      updateFormData({
        embeddings: {
          storageKey: data.storageKey,
          wizardToken: data.wizardToken,
          model: data.model,
          chunkCount: data.chunkCount,
          generatedAt: new Date().toISOString(),
          sourceDocuments: data.summary?.sourceDocuments || [],
        },
      });
      clearError('embeddings');
      setEmbeddingsStatus(`Done! ${data.chunkCount} chunks embedded with ${data.model}.`);
    } catch (err) {
      console.error('Embeddings generation error:', err);
      setEmbeddingsError(err.message);
    } finally {
      setGeneratingEmbeddings(false);
      setTimeout(() => {
        setEmbeddingsStatus('');
        setEmbeddingsError('');
      }, 4000);
    }
  };

  const handleRagSummaryChange = (e) => {
    updateFormData({ ragSummary: e.target.value });
    clearError('ragSummary');
  };

  const handleOpenRagModal = () => {
    setModalRagText(formData.ragSummary || '');
    setShowRagModal(true);
  };

  const handleSaveRagModal = () => {
    updateFormData({ ragSummary: modalRagText });
    clearError('ragSummary');
    setShowRagModal(false);
  };

  const handleCancelRagModal = () => {
    setShowRagModal(false);
    setModalRagText('');
  };

  // Lite: keyword RAG. This asks the LLM to compose a ragSummary from the
  // uploaded documents. The summary ships in the bot zip as
  // config/ragSummary.txt and the container's keyword RAG scores against it
  // at runtime.
  const handleGenerateRagSummary = async () => {
    if (!formData.documents || formData.documents.length === 0) {
      setRagSummaryError('Please upload at least one document first');
      return;
    }

    if (!formData.provider || !formData.apiKey || !formData.model) {
      setRagSummaryError('Set your LLM provider + API key in the first step before generating the RAG summary.');
      return;
    }

    try {
      setGeneratingRagSummary(true);
      setRagSummaryError('');
      setRagSummaryStatus('Composing RAG summary…');

      const documents = formData.documents.map((doc) => ({
        storagePath: doc.storagePath || doc.storage_path,
        originalName: doc.originalName || doc.file_name,
      }));

      const response = await fetch('/api/generate-rag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documents,
          provider: formData.provider,
          apiKey: formData.apiKey,
          model: formData.model,
          customPrompt: formData.customRagPrompt || undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to generate RAG summary');
      }

      const data = await response.json();
      updateFormData({ ragSummary: data.summary || '' });
      clearError('ragSummary');

      setRagSummaryStatus(`Complete! ${data.documentsProcessed || documents.length} document(s) summarized.`);

      if (onTabSwitch) {
        setTimeout(() => onTabSwitch('ragSummary'), 500);
      }
    } catch (error) {
      console.error('Error generating RAG summary:', error);
      setRagSummaryError(error.message);
    } finally {
      setGeneratingRagSummary(false);
      setTimeout(() => {
        setRagSummaryStatus('');
        setRagSummaryError('');
      }, 3000);
    }
  };

  const renderDocumentRow = (doc, isLinked) => {
    const fileName = doc.originalName || doc.file_name || 'Untitled';
    const fileSize = doc.sizeBytes || doc.file_size;
    const mimeType = doc.mimeType || doc.mime_type;
    const createdAt = doc.createdAt || doc.created_at;

    return (
    <div key={doc.id} className="p-4 hover:bg-gray-700 transition-colors">
      <div className="flex items-start gap-3">
        <svg className={`w-6 h-6 ${getFileIcon(mimeType)} flex-shrink-0 mt-0.5`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-100 truncate" title={fileName}>
            {fileName}
          </p>
          <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
              </svg>
              {formatFileSize(fileSize)}
            </span>
            <span className="flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {formatDate(createdAt)}
            </span>
            {mimeType && (
              <span className="px-1.5 py-0.5 bg-gray-700 text-gray-400 rounded text-[10px] font-mono">
                {mimeType.split('/')[1]?.toUpperCase() || 'FILE'}
              </span>
            )}
          </div>
        </div>

        {isLinked ? (
          <button
            onClick={() => handleUnlink(doc)}
            className="flex-shrink-0 p-2 text-gray-500 hover:text-orange-400 hover:bg-orange-900/30 rounded transition-colors"
            title="Unlink from this bot (file remains in bot space)"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
          </button>
        ) : (
          <button
            onClick={() => handleDelete(doc)}
            disabled={deleting === doc.id}
            className="flex-shrink-0 p-2 text-gray-500 hover:text-red-400 hover:bg-red-900/30 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Delete document permanently"
          >
            {deleting === doc.id ? (
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            )}
          </button>
        )}
      </div>
    </div>
  );
  };

  if (activeTab === 'documents') {
    return (
      <div className="space-y-4">
        {deleteError && (
          <div className="bg-red-900/30 border border-red-800 text-red-400 px-4 py-3 rounded-lg text-sm">
            {deleteError}
          </div>
        )}

        {/* Uploaded Documents Section - hidden in bot space context since uploads sync there */}
        {!botSpaceId && (
          <div className="bg-gray-800 rounded-lg border border-gray-700">
            <div className="p-4 border-b border-gray-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                <h3 className="text-sm font-semibold text-gray-100">Uploaded Documents</h3>
              </div>
              {uploadedDocuments.length > 0 && (
                <span className="text-xs text-gray-400">{uploadedDocuments.length} file{uploadedDocuments.length !== 1 ? 's' : ''}</span>
              )}
            </div>

            {uploadedDocuments.length === 0 ? (
              <div className="text-center py-8 px-4 text-gray-400">
                <svg className="w-12 h-12 mx-auto mb-2 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                <p className="text-sm font-medium">No uploaded documents</p>
                <p className="text-xs text-gray-500 mt-1">Upload documents on the left</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-700">
                {uploadedDocuments.map((doc) => renderDocumentRow(doc, false))}
              </div>
            )}
          </div>
        )}

        {/* Linked Documents Section - Only show when in a bot space */}
        {botSpaceId && <div className="bg-gray-800 rounded-lg border border-purple-800">
          <div className="p-4 border-b border-purple-800 bg-purple-900/30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              <h3 className="text-sm font-semibold text-purple-300">Linked from Bot Space</h3>
              <div className="relative group">
                <svg className="w-4 h-4 text-purple-500 cursor-help" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 hidden group-hover:block w-52 px-3 py-2 text-xs text-white bg-gray-900 rounded-lg shadow-lg z-10">
                  Uploaded docs become part of this botspace by default
                  <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-gray-900"></div>
                </div>
              </div>
            </div>
            {linkedDocuments.length > 0 && (
              <span className="text-xs text-purple-400">{linkedDocuments.length} file{linkedDocuments.length !== 1 ? 's' : ''}</span>
            )}
          </div>

          {linkedDocuments.length === 0 ? (
            <div className="text-center py-8 px-4 text-gray-400">
              <svg className="w-12 h-12 mx-auto mb-2 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <p className="text-sm font-medium">No linked documents</p>
              <p className="text-xs text-gray-500 mt-1">Select shared files from the bot space</p>
            </div>
          ) : (
            <>
              <div className="divide-y divide-gray-700">
                {linkedDocuments.map((doc) => renderDocumentRow(doc, true))}
              </div>
              <div className="p-3 bg-purple-900/30 border-t border-purple-800">
                <p className="text-xs text-purple-400">
                  Linked documents remain in the bot space when unlinked from this bot.
                </p>
              </div>
            </>
          )}
        </div>}

        {/* RAG Summary Generation — keyword mode only; vector mode uses the
            Embeddings tab's generate UI instead. */}
        {!isVectorMode && formData.documents && formData.documents.length > 0 && (
          <div className="p-4 bg-purple-900/30 border border-purple-800 rounded-lg space-y-3">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span className="text-sm font-medium text-purple-300">AI-Powered RAG Summary</span>
            </div>
            <p className="text-xs text-purple-400">
              Generate a retrieval guide that maps user language to your document terminology, improving accuracy for ambiguous or fuzzy queries.
            </p>

            {ragSummaryError && (
              <div className="bg-red-900/30 border border-red-800 text-red-400 px-3 py-2 rounded text-xs">
                {ragSummaryError}
              </div>
            )}

            {ragSummaryStatus && !ragSummaryError && (
              <div className="bg-purple-900/50 border border-purple-700 text-purple-300 px-3 py-2 rounded text-xs">
                {ragSummaryStatus}
              </div>
            )}

            <button
              type="button"
              onClick={handleGenerateRagSummary}
              disabled={generatingRagSummary}
              className={`w-full py-2 px-4 rounded-md font-medium transition text-sm ${
                generatingRagSummary
                  ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  : 'bg-purple-600 text-white hover:bg-purple-500'
              }`}
            >
              {generatingRagSummary ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  {ragSummaryStatus || 'Generating...'}
                </span>
              ) : formData.ragSummary ? (
                'Regenerate RAG Summary'
              ) : (
                'Generate RAG Summary'
              )}
            </button>
          </div>
        )}

        <div className="p-4 bg-blue-900/30 border border-blue-800 rounded-lg">
          <div className="flex items-start gap-2">
            <svg className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            <div className="flex-1">
              <p className="text-xs text-blue-400">
                These documents will be processed and used to provide context for your bot's responses through RAG (Retrieval-Augmented Generation).
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (activeTab === 'ragSummary') {
    return (
      <div className="space-y-4">
        {/* RAG Modal */}
        {showRagModal && (
          <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 border border-gray-700 rounded-lg shadow-xl w-[95vw] h-[95vh] flex flex-col">
              <div className="p-4 border-b border-gray-700 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-100">Edit RAG Summary</h3>
                <button
                  onClick={handleCancelRagModal}
                  className="text-gray-500 hover:text-gray-300 transition"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="flex-1 p-6 overflow-auto">
                <textarea
                  value={modalRagText}
                  onChange={(e) => setModalRagText(e.target.value)}
                  placeholder="This chatbot has access to:&#10;- Company policies&#10;- Product documentation&#10;- FAQs&#10;&#10;It can help with:&#10;- Answering questions about...&#10;- Providing guidance on..."
                  className="w-full h-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-md text-sm text-gray-100 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 resize-none font-sans"
                  autoFocus
                />
              </div>

              <div className="p-4 border-t border-gray-700 flex items-center justify-end gap-3">
                <button
                  onClick={handleCancelRagModal}
                  className="px-4 py-2 text-gray-300 font-medium hover:text-gray-100 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveRagModal}
                  className="px-6 py-2 bg-teal-600 text-white font-medium rounded-md hover:bg-teal-500 transition"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="bg-gray-800 rounded-lg border border-gray-700">
          <div className="p-4 border-b border-gray-700 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-100">RAG Summary</h3>
              <p className="text-xs text-gray-400 mt-1">
                Describe what information your bot has access to and how it can help users
              </p>
            </div>
            <button
              onClick={handleOpenRagModal}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-teal-400 hover:text-teal-300 hover:bg-teal-900/30 rounded-md transition"
              title="Open in larger view"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
              Expand
            </button>
          </div>

          <div className="p-4">
            <textarea
              value={formData.ragSummary || ''}
              onChange={handleRagSummaryChange}
              rows={16}
              placeholder="This chatbot has access to:&#10;- Company policies&#10;- Product documentation&#10;- FAQs&#10;&#10;It can help with:&#10;- Answering questions about...&#10;- Providing guidance on..."
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-md text-sm text-gray-100 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 resize-none font-sans"
            />
          </div>
        </div>

        <div className="p-4 bg-purple-900/30 border border-purple-800 rounded-lg">
          <div className="flex items-start gap-2">
            <svg className="w-5 h-5 text-purple-400 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            <div className="flex-1">
              <h4 className="text-xs font-semibold text-purple-300 mb-1">About RAG Summary</h4>
              <p className="text-xs text-purple-400">
                The RAG summary helps guide the LLM on how to use the knowledge base effectively. You can manually edit this field or use the AI generation button in the Documents tab.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (activeTab === 'embeddings') {
    const hasEmbeddings = !!formData.embeddings?.storageKey;
    const docCount = formData.documents?.length || 0;
    const generatedAt = formData.embeddings?.generatedAt;

    return (
      <div className="space-y-4">
        {/* Status card */}
        <div className={`bg-gray-800 rounded-lg border ${hasEmbeddings ? 'border-teal-800' : 'border-gray-700'}`}>
          <div className={`p-4 border-b flex items-center justify-between ${
            hasEmbeddings ? 'border-teal-800 bg-teal-900/30' : 'border-gray-700'
          }`}>
            <div className="flex items-center gap-2">
              <svg className={`w-5 h-5 ${hasEmbeddings ? 'text-teal-400' : 'text-gray-500'}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
              </svg>
              <h3 className={`text-sm font-semibold ${hasEmbeddings ? 'text-teal-300' : 'text-gray-300'}`}>
                Vector Embeddings
              </h3>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                hasEmbeddings ? 'bg-teal-900/50 text-teal-400' : 'bg-gray-700 text-gray-400'
              }`}>
                {hasEmbeddings ? 'Ready' : 'Not generated'}
              </span>
            </div>
          </div>

          <div className="p-4 space-y-4">
            {hasEmbeddings ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-900 rounded-lg p-3">
                    <div className="text-xs text-gray-500 mb-1">Chunks</div>
                    <div className="text-2xl font-bold text-teal-400">
                      {formData.embeddings.chunkCount || 0}
                    </div>
                  </div>
                  <div className="bg-gray-900 rounded-lg p-3">
                    <div className="text-xs text-gray-500 mb-1">Model</div>
                    <div className="text-sm font-mono font-medium text-gray-300 truncate"
                      title={formData.embeddings.model}>
                      {formData.embeddings.model || '—'}
                    </div>
                  </div>
                  <div className="bg-gray-900 rounded-lg p-3">
                    <div className="text-xs text-gray-500 mb-1">Source Documents</div>
                    <div className="text-sm font-medium text-gray-300">
                      {formData.embeddings.sourceDocuments?.length || docCount}
                    </div>
                  </div>
                  <div className="bg-gray-900 rounded-lg p-3">
                    <div className="text-xs text-gray-500 mb-1">Generated</div>
                    <div className="text-sm font-medium text-gray-300">
                      {generatedAt ? formatDate(generatedAt) : '—'}
                    </div>
                  </div>
                </div>

                {formData.embeddings.sourceDocuments?.length > 0 && (
                  <div>
                    <div className="text-xs text-gray-500 mb-2">Embedded files</div>
                    <div className="flex flex-wrap gap-1.5">
                      {formData.embeddings.sourceDocuments.map((name) => (
                        <span key={name}
                          className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-teal-900/40 text-teal-300">
                          {name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <details className="text-xs">
                  <summary className="text-gray-500 cursor-pointer hover:text-gray-300">
                    Technical details
                  </summary>
                  <div className="mt-2 p-2 bg-gray-900 rounded font-mono text-[10px] text-gray-400 break-all space-y-1">
                    <div>storage_key: {formData.embeddings.storageKey}</div>
                    <div>wizard_token: {formData.embeddings.wizardToken || '—'}</div>
                  </div>
                </details>
              </>
            ) : (
              <div className="text-center py-8">
                <svg className="w-12 h-12 mx-auto mb-2 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                </svg>
                <p className="text-sm font-medium text-gray-400">No embeddings yet</p>
                <p className="text-xs text-gray-500 mt-1 max-w-xs mx-auto">
                  {docCount === 0
                    ? 'Upload documents in the Documents tab first.'
                    : 'Click below to chunk and embed your documents locally.'}
                </p>
              </div>
            )}

            {embeddingsError && (
              <div className="bg-red-900/30 border border-red-800 text-red-400 px-3 py-2 rounded text-xs">
                {embeddingsError}
              </div>
            )}

            {embeddingsStatus && !embeddingsError && (
              <div className="bg-teal-900/40 border border-teal-700 text-teal-300 px-3 py-2 rounded text-xs">
                {embeddingsStatus}
              </div>
            )}

            <button
              type="button"
              onClick={handleGenerateEmbeddings}
              disabled={generatingEmbeddings || docCount === 0}
              className={`w-full py-2 px-4 rounded-md font-medium transition text-sm ${
                generatingEmbeddings || docCount === 0
                  ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  : 'bg-teal-600 text-white hover:bg-teal-500'
              }`}
            >
              {generatingEmbeddings ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  {embeddingsStatus || 'Generating…'}
                </span>
              ) : hasEmbeddings ? (
                'Regenerate Embeddings'
              ) : (
                'Generate Vector Embeddings'
              )}
            </button>
          </div>
        </div>

        {hasEmbeddings && (
          <div className="p-4 bg-amber-900/20 border border-amber-800/60 rounded-lg">
            <div className="flex items-start gap-2">
              <svg className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <p className="text-xs text-amber-300">
                If you change the document set, regenerate to keep the artifact in sync.
              </p>
            </div>
          </div>
        )}

        <div className="p-4 bg-blue-900/20 border border-blue-800/60 rounded-lg">
          <div className="flex items-start gap-2">
            <svg className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            <p className="text-xs text-blue-400">
              In vector mode, the bot embeds queries in-process using the bundled
              multilingual-e5-small ONNX model and runs cosine similarity locally.
              No factory dependency at runtime.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
