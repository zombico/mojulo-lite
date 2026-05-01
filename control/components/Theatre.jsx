/**
 * Theatre Component
 *
 * A reusable side panel for displaying dynamic content like:
 * - Deployment status
 * - Logs
 * - Preview iframes
 * - Analytics
 * 
 * Supports optional tabs for switching between different views
 */

export default function Theatre({ children, title, onClose, tabs = null, activeTab = null, onTabChange = null }) {
  return (
    <div className="h-full flex flex-col bg-gray-950 border-l border-gray-700">
      {/* Header */}
      {(title || onClose) && (
        <div className="px-6 py-4 border-b border-gray-700 bg-gray-900">
          <div className="flex items-center justify-between">

            {onClose && (
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-200 transition"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Tabs (if provided) */}
          {tabs && tabs.length > 0 && (
            <div className="flex gap-1 border-b border-gray-700 -mb-4">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => onTabChange && onTabChange(tab.id)}
                  disabled={tab.disabled}
                  className={`px-4 py-2 text-sm font-medium transition-colors relative ${
                    activeTab === tab.id
                      ? 'text-teal-400 border-b-2 border-teal-400 -mb-[2px]'
                      : 'text-gray-400 hover:text-gray-200 disabled:text-gray-600 disabled:cursor-not-allowed'
                  }`}
                >
                  {tab.label}
                  {tab.badge && (
                    <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-teal-900/50 text-teal-400">
                      {tab.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {children}
      </div>
    </div>
  );
}
