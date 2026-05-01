'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';

export default function AddTriageDestinationWorkflow({ onClose, onAddDestination, onUpdateDestination, editingDestination = null }) {
  const t = useTranslations('wizard.modular');
  const isEditMode = !!editingDestination;
  const [availableBots, setAvailableBots] = useState([]);
  const [loadingBots, setLoadingBots] = useState(true);
  const [selectedBot, setSelectedBot] = useState(null);
  const [formData, setFormData] = useState({
    name: editingDestination?.name || '',
    description: editingDestination?.description || '',
    url: editingDestination?.url || '',
  });

  useEffect(() => {
    fetchAvailableBots();
  }, []);

  // Pre-select bot if editing
  useEffect(() => {
    if (editingDestination && availableBots.length > 0) {
      const matchingBot = availableBots.find(b => b.deploymentId === editingDestination.deploymentId);
      if (matchingBot) {
        setSelectedBot(matchingBot);
      }
    }
  }, [editingDestination, availableBots]);

  const fetchAvailableBots = async () => {
    setLoadingBots(true);
    try {
      const response = await fetch('/api/registry/bots');
      if (!response.ok) {
        console.error('Error fetching registered bots');
        return;
      }
      const data = await response.json();
      setAvailableBots(data.bots || []);
    } catch (err) {
      console.error('Error fetching bots:', err);
    } finally {
      setLoadingBots(false);
    }
  };

  const handleBotSelect = (bot) => {
    setSelectedBot(bot);
    if (!isEditMode) {
      // Cartridge contract: botSummary is captured at pick time and frozen into
      // the route description. The build step bakes it into the artifact; runtime
      // never re-resolves against the source bot.
      setFormData({
        name: bot.name,
        description: bot.botSummary || '',
        url: bot.url,
      });
    } else {
      setFormData(prev => ({
        ...prev,
        url: bot.url,
      }));
    }
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = () => {
    if (!selectedBot || !formData.name.trim() || !formData.description.trim()) return;

    const destination = {
      deploymentId: selectedBot.deploymentId,
      name: formData.name.trim(),
      description: formData.description.trim(),
      url: selectedBot.url,
    };

    if (isEditMode) {
      onUpdateDestination(destination);
    } else {
      onAddDestination(destination);
    }
  };

  const isFormValid = selectedBot && formData.name.trim() && formData.description.trim();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg w-full max-w-4xl shadow-xl border border-gray-700 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 shrink-0">
          <h3 className="text-lg font-medium text-gray-100">
            {isEditMode ? 'Edit Bot Destination' : t('redirectToBot')}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-200 transition"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 h-full">
            {/* Left: Bot Selection (3 cols) */}
            <div className="lg:col-span-3 flex flex-col">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Select Bot <span className="text-red-400">*</span>
              </label>

              {loadingBots ? (
                <div className="flex items-center justify-center py-12 text-gray-400 flex-1">
                  <svg className="w-5 h-5 animate-spin mr-2" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Loading bots...
                </div>
              ) : availableBots.length === 0 ? (
                <div className="p-6 bg-gray-700 rounded-lg text-sm text-gray-400 text-center flex-1 flex items-center justify-center">
                  No bots available. Create a bot first.
                </div>
              ) : (
                <div className="space-y-2 flex-1 overflow-y-auto border border-gray-600 rounded-lg p-3 bg-gray-900/50 min-h-[300px] max-h-[400px]">
                  {availableBots.map((bot) => (
                    <button
                      key={bot.deploymentId}
                      type="button"
                      onClick={() => handleBotSelect(bot)}
                      className={`w-full text-left p-4 rounded-lg border transition ${
                        selectedBot?.deploymentId === bot.deploymentId
                          ? 'border-indigo-500 bg-indigo-900/30'
                          : 'border-gray-600 hover:border-indigo-400 hover:bg-indigo-900/20'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="font-medium text-gray-100">{bot.name}</div>
                      </div>
                      <div className="text-xs text-gray-500 truncate">{bot.url}</div>
                      {bot.botSummary && (
                        <p className="text-sm text-gray-400 mt-2 line-clamp-2">{bot.botSummary}</p>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Right: Form Fields (2 cols) */}
            <div className="lg:col-span-2 space-y-5">
              {/* Display Name */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  {t('displayName')} <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  placeholder={t('displayNamePlaceholder')}
                  disabled={!selectedBot}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm text-gray-100 placeholder-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  {t('description')} <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => handleChange('description', e.target.value)}
                  placeholder={t('descriptionPlaceholder')}
                  rows={6}
                  disabled={!selectedBot}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none text-sm text-gray-100 placeholder-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Used for RAG matching to determine when to route users here
                </p>
              </div>

              {/* Selected Bot Info */}
              {selectedBot && (
                <div className="p-3 bg-gray-700 rounded-lg border border-gray-600">
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Selected Bot URL</p>
                  <p className="text-sm text-gray-300 break-all">{selectedBot.url}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-700 px-6 py-4 flex gap-3 shrink-0">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!isFormValid}
            className="flex-1 py-2.5 px-4 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed transition"
          >
            {isEditMode ? 'Update Destination' : t('addRoutingDestination')}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-700 transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
