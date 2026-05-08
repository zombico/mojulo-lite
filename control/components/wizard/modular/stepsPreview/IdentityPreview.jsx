'use client';

import { useTranslations } from 'next-intl';
import { useModularWizard } from '../ModularWizardContext';
import './preview.css';

export default function IdentityPreview({ activeTab = 'desktop' }) {
  const t = useTranslations('wizard.previews.identity');
  const { formData } = useModularWizard();

  const chatDisplayName = formData.uiSettings?.chatDisplayName || t('fallbackBotName');
  const placeholder = formData.uiSettings?.placeholder || t('fallbackPlaceholder');
  const firstMessage = formData.firstMessage || t('fallbackFirstMessage');
  const suggestedPrompts = formData.suggestedPrompts || [];

  if (activeTab === 'desktop') {
    return (
      <div className="h-full flex flex-col justify-end">
      <div className="preview-container">
        {/* Chat Header */}
        <header className="preview-chat-header" id="header-container">
          <h1 className="preview-header-title" aria-live="polite">{chatDisplayName}</h1>
          <button className="preview-close-widget-btn" aria-label={t('minimizeChat')} title={t('minimize')}>
            <span className="close-icon">−</span>
          </button>
        </header>

        {/* Messages Area */}
        <div className="preview-messages" role="log" aria-live="polite" aria-relevant="additions" aria-atomic="false">
          {/* First Message (Bot) */}
          <div className="preview-message bot" role="article" aria-label={t('botMessage')}>
            <div className="preview-message-content">
              {firstMessage}
            </div>
            {/* Suggested Prompts */}
            {suggestedPrompts.length > 0 && (
              <div className="preview-suggested-prompts-container" aria-label={t('suggestedPrompts')}>
                {suggestedPrompts.map((prompt, index) => {
                  const promptText = typeof prompt === 'object' ? prompt.suggestedPrompt : prompt;
                  if (!promptText) return null;

                  return (
                    <div key={index} className="preview-suggested-prompt-card" role="button" tabIndex="0">
                      <span className="preview-suggested-prompt">
                        {promptText}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Input Section */}
        <div className="preview-input-section">
          <div className="preview-input-wrapper">
            <label htmlFor="preview-userInput" className="visually-hidden">{t('chatMessage')}</label>
            <input
              type="text"
              id="preview-userInput"
              placeholder={placeholder}
              disabled
              aria-label={t('typeYourMessageAria')}
            />
            <button
              type="button"
              className="preview-main-btn"
              disabled
              aria-label={t('sendMessage')}
            >
              ➢
            </button>
          </div>
        </div>
      </div>
      </div>
    );
  }

  return null;
}
