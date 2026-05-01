'use client';

export default function GenerationPanel({
  title = 'AI-Powered Generation',
  description = 'Use AI to automatically generate content',
  onGenerate,
  isGenerating = false,
  status = '',
  needsRegeneration = false,
  bgColor = 'blue',
  children
}) {
  const colorClasses = {
    blue: {
      container: 'bg-blue-50 border-blue-200',
      text: 'text-blue-900',
      icon: 'text-blue-600',
      button: 'bg-blue-600 hover:bg-blue-700 text-white',
      warning: 'text-orange-700'
    },
    green: {
      container: 'bg-green-50 border-green-200',
      text: 'text-green-900',
      icon: 'text-green-600',
      button: 'bg-green-600 hover:bg-green-700 text-white',
      warning: 'text-orange-700'
    },
    purple: {
      container: 'bg-purple-50 border-purple-200',
      text: 'text-purple-900',
      icon: 'text-purple-600',
      button: 'bg-purple-600 hover:bg-purple-700 text-white',
      warning: 'text-orange-700'
    }
  };

  const colors = colorClasses[bgColor] || colorClasses.blue;

  return (
    <div className={`p-4 border rounded-lg space-y-3 ${colors.container}`}>
      <div className="flex items-center gap-2">
        <svg className={`w-5 h-5 ${colors.icon}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        <span className={`text-sm font-medium ${colors.text}`}>{title}</span>
      </div>

      {description && (
        <p className="text-xs text-gray-600">{description}</p>
      )}

      {needsRegeneration && (
        <p className={`text-xs ${colors.warning} flex items-center gap-1`}>
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          Content has changed. Regenerate to update.
        </p>
      )}

      {status && (
        <p className="text-xs text-gray-700">{status}</p>
      )}

      {children}

      <button
        type="button"
        onClick={onGenerate}
        disabled={isGenerating}
        className={`w-full px-4 py-2 rounded-md font-medium transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${colors.button}`}
      >
        {isGenerating ? (
          <>
            <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Generating...
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Generate
          </>
        )}
      </button>
    </div>
  );
}
