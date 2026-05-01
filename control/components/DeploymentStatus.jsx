/**
 * DeploymentStatus Component
 *
 * Displays real-time deployment progress with milestones
 */

export default function DeploymentStatus({ deployment, isPreview = false }) {
  const { status, deployment_progress, url, error } = deployment || {};

  // Ensure deployment_progress is always an array
  const progressArray = Array.isArray(deployment_progress) ? deployment_progress : [];

  // Define milestone steps for visual representation
  const milestones = [
    { step: 'cloning', label: 'Preparing Bot', icon: '📦' },
    { step: 'building', label: 'Building Container', icon: '🔨' },
    { step: 'deploying', label: 'Launching', icon: '🚀' },
    { step: 'complete', label: 'Live', icon: '✅' }
  ];

  // Get the latest progress step
  const latestProgress = progressArray[progressArray.length - 1];
  const currentStep = latestProgress?.step || null;

  // Check if a milestone is completed
  const isMilestoneComplete = (step) => {
    return progressArray.some(p => p.step === step);
  };

  // Check if a milestone is current
  const isMilestoneCurrent = (step) => {
    return currentStep === step;
  };

  return (
    <div className="space-y-6 p-4">
      {/* Status Header */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-gray-100">Deployment Status</h3>
            <p className="text-xs text-gray-400 mt-1">
              {status === 'deploying' && 'Deployment in progress...'}
              {status === 'deployed' && 'Successfully deployed'}
              {status === 'failed' && 'Deployment failed'}
            </p>
          </div>
          {status === 'deploying' && (
            <div className="animate-spin h-5 w-5 border-2 border-teal-400 border-t-transparent rounded-full"></div>
          )}
          {status === 'deployed' && (
            <div className="h-5 w-5 text-green-400">✓</div>
          )}
          {status === 'failed' && (
            <div className="h-5 w-5 text-red-400">✗</div>
          )}
        </div>
      </div>

      {/* Milestones */}
      <div className="space-y-4">
        {milestones.map((milestone, index) => {
          const isComplete = isMilestoneComplete(milestone.step);
          const isCurrent = isMilestoneCurrent(milestone.step);
          const isPending = !isComplete && !isCurrent;

          return (
            <div key={milestone.step} className="flex items-start gap-3">
              {/* Icon */}
              <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                isComplete ? 'bg-green-900/50 text-green-400' :
                isCurrent ? 'bg-teal-900/50 text-teal-400 animate-pulse' :
                'bg-gray-800 text-gray-500'
              }`}>
                {isComplete ? '✓' : isCurrent ? milestone.icon : milestone.icon}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-medium ${
                  isComplete ? 'text-green-400' :
                  isCurrent ? 'text-teal-300' :
                  'text-gray-500'
                }`}>
                  {milestone.label}
                </div>

                {/* Show only the most recent message for this step */}
                {(() => {
                  const stepProgress = progressArray.filter(p => p.step === milestone.step);
                  const latestStepProgress = stepProgress[stepProgress.length - 1];

                  return latestStepProgress ? (
                    <div className="text-xs text-gray-400 mt-1">
                      {latestStepProgress.message}
                      <span className="ml-2 text-gray-500">
                        {new Date(latestStepProgress.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  ) : null;
                })()}
              </div>

              {/* Connector line (except for last item) */}
              {index < milestones.length - 1 && (
                <div className={`absolute left-[16px] mt-8 h-8 w-0.5 ${
                  isComplete ? 'bg-green-800' : 'bg-gray-700'
                }`} style={{ marginTop: '32px' }}></div>
              )}
            </div>
          );
        })}
      </div>

      {/* Deployment URL (if deployed) */}
      {url && (
        <div className={`rounded-lg p-4 ${
          isPreview
            ? 'bg-teal-900/30 border border-teal-800'
            : 'bg-green-900/30 border border-green-800'
        }`}>
          <div className="flex items-start gap-3">
            <div className="text-2xl">🌐</div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h4 className={`text-sm font-medium ${
                  isPreview ? 'text-teal-300' : 'text-green-300'
                }`}>
                  {isPreview ? 'Preview' : 'Production'} Deployment URL
                </h4>
                {isPreview && (
                  <span className="px-2 py-0.5 bg-teal-800 text-teal-200 text-xs font-medium rounded">
                    PREVIEW
                  </span>
                )}
              </div>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className={`text-sm hover:underline break-all ${
                  isPreview
                    ? 'text-teal-400 hover:text-teal-300'
                    : 'text-green-400 hover:text-green-300'
                }`}
              >
                {url}
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Error (if failed) */}
      {error && (
        <div className="bg-red-900/30 border border-red-800 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <div className="text-2xl">⚠️</div>
            <div className="flex-1">
              <h4 className="text-sm font-medium text-red-300">Error</h4>
              <p className="text-sm text-red-400 mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* All Progress Messages */}
      {progressArray.length > 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <h4 className="text-xs font-medium text-gray-300 mb-2">Deployment Log</h4>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {progressArray.map((progress, idx) => (
              <div key={idx} className="text-xs text-gray-400">
                <span className="text-gray-500">
                  {new Date(progress.timestamp).toLocaleTimeString()}
                </span>
                {' - '}
                <span>{progress.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
