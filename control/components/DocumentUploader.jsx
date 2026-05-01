'use client';

import { useState } from 'react';

export default function DocumentUploader({ documents, onUpload, hideFileList = false, botSpaceId = null }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  const processFiles = async (files) => {
    if (!files.length) return;

    // Lite is single-user — no login check. Any file the operator drops here
    // is considered authorized.

    setUploading(true);
    setError('');

    try {
      const uploadedDocs = [];

      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        if (botSpaceId) {
          formData.append('botSpaceId', botSpaceId);
        }

        const response = await fetch('/api/documents', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Upload failed');
        }

        const { document } = await response.json();
        uploadedDocs.push(document);
      }

      // Update parent component with all uploaded documents
      onUpload([...documents, ...uploadedDocs]);
    } catch (err) {
      console.error('Upload error:', err);
      setError(err.message || 'Failed to upload files');
    } finally {
      setUploading(false);
    }
  };

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    await processFiles(files);
    // Clear file input
    e.target.value = '';
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === e.target) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    const acceptedTypes = ['.pdf', '.txt', '.md', '.doc', '.docx'];
    const filteredFiles = files.filter((file) => {
      const extension = '.' + file.name.split('.').pop().toLowerCase();
      return acceptedTypes.includes(extension);
    });

    if (filteredFiles.length < files.length) {
      setError('Some files were skipped. Only PDF, TXT, MD, DOC, DOCX files are supported.');
    }

    if (filteredFiles.length > 0) {
      await processFiles(filteredFiles);
    }
  };

  const handleDelete = async (documentId) => {
    if (!confirm('Are you sure you want to delete this file?')) return;

    try {
      const response = await fetch(`/api/documents/${documentId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Delete failed');
      }

      // Update parent component
      onUpload(documents.filter((doc) => doc.id !== documentId));
    } catch (err) {
      console.error('Delete error:', err);
      setError(err.message || 'Failed to delete file');
    }
  };

  const formatFileSize = (bytes) => {
    const size = Number(bytes) || 0;
    if (size < 1024) return size + ' B';
    if (size < 1024 * 1024) return (size / 1024).toFixed(1) + ' KB';
    return (size / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-l font-semibold mb-2 text-gray-100">Upload Documents <span className="text-red-400">*</span></h2>
        <p className="text-sm text-gray-400 mb-4">
          Upload documents that your chatbot will use for RAG (Retrieval-Augmented Generation)
        </p>

        {error && (
          <div className="bg-red-900/30 border border-red-800 text-red-400 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {/* Drag and Drop Zone */}
        <div
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            isDragging
              ? 'border-teal-500 bg-teal-900/20'
              : 'border-gray-600 bg-gray-700 hover:border-gray-500'
          } ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
        >
          <svg
            className={`mx-auto h-12 w-12 ${isDragging ? 'text-teal-400' : 'text-gray-500'}`}
            stroke="currentColor"
            fill="none"
            viewBox="0 0 48 48"
            aria-hidden="true"
          >
            <path
              d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <div className="mt-4">
            <label
              htmlFor="file-upload"
              className="cursor-pointer inline-flex items-center px-4 py-2 bg-teal-600 text-white rounded-md hover:bg-teal-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500"
            >
              <span>{uploading ? 'Uploading...' : 'Choose Files'}</span>
            </label>
            <input
              id="file-upload"
              type="file"
              multiple
              onChange={handleFileUpload}
              disabled={uploading}
              className="hidden"
              accept=".pdf,.txt,.md,.doc,.docx"
            />
          </div>
          <p className="mt-2 text-sm text-gray-400">
            {isDragging ? 'Drop files here' : 'or drag and drop files here'}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            PDF, TXT, MD, DOC, DOCX
          </p>
        </div>
      </div>

      {/* Uploaded Files List */}
      {!hideFileList && documents.length > 0 && (
        <div className="border border-gray-700 rounded-lg overflow-hidden">
          <div className="bg-gray-700 px-4 py-2 border-b border-gray-600">
            <h3 className="font-medium text-gray-100">
              Uploaded Documents ({documents.length})
            </h3>
          </div>
          <ul className="divide-y divide-gray-700">
            {documents.map((doc) => (
              <li
                key={doc.id}
                className="px-4 py-3 flex items-center justify-between hover:bg-gray-700"
              >
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-100">
                    {doc.originalName || doc.original_name || doc.file_name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatFileSize(doc.sizeBytes || doc.size_bytes || doc.file_size)} • {doc.mimeType || doc.mime_type}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(doc.id)}
                  className="ml-4 px-3 py-1 text-sm text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {documents.length === 0 && !uploading && (
        <div className="text-center py-8 border-2 border-dashed border-gray-600 rounded-lg">
          <p className="text-gray-400">No documents uploaded yet</p>
          <p className="text-sm text-gray-500 mt-1">Click "Choose Files" to get started</p>
        </div>
      )}
    </div>
  );
}
