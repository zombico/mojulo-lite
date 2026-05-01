'use client';

import { useModularWizard } from '../ModularWizardContext';
import './preview.css';

export default function TriagePreview({ activeTab = 'desktop' }) {
  const { formData } = useModularWizard();

  const routes = formData.triageRoutes || [];
  const botName = formData.botName || 'Triage Bot';

  // Calculate vertical spacing based on number of routes
  const getSpacing = (total) => {
    if (total === 1) return 0;
    if (total === 2) return 80;
    if (total === 3) return 70;
    return 60;
  };

  // Get Y position for destination (centered around hub at y=230)
  const getDestinationY = (index, total) => {
    const centerY = 230;
    const spacing = getSpacing(total);
    const totalSpan = (total - 1) * spacing;
    const startY = centerY - totalSpan / 2;
    return startY + index * spacing;
  };

  // Generate curved path from hub to a destination
  const getCurvedPath = (index, total) => {
    const startX = 136; // Right edge of hub (100 + 36 radius)
    const startY = 230; // Hub center Y
    const endX = 285;   // Left edge of destination pills
    const endY = getDestinationY(index, total);

    // Control points for smooth bezier curve
    const midX = (startX + endX) / 2;

    return `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`;
  };

  if (activeTab === 'desktop') {
    return (
      <div className="h-full flex flex-col">
        {routes.length === 0 ? (
          // Empty/neutral state
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <svg className="w-16 h-16 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
            <p className="text-sm">No routing destinations configured yet</p>
            <p className="text-xs mt-1">Click "Add Routing Destination" to get started</p>
          </div>
        ) : (
          // Triage topology diagram - all in SVG for proper alignment
          <div className="flex-1 flex items-center justify-center">
            <svg
              viewBox="0 0 600 400"
              className="w-full h-full max-w-2xl"
              style={{ maxHeight: '500px' }}
            >
              <defs>
                {/* Gradient for connection lines */}
                <linearGradient id="triageCurveGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#14b8a6" />
                  <stop offset="100%" stopColor="#818cf8" />
                </linearGradient>
                {/* Hub gradient */}
                <linearGradient id="triageHubGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#0d9488"/>
                  <stop offset="100%" stopColor="#115e59"/>
                </linearGradient>
                {/* Destination gradient */}
                <linearGradient id="triageDestGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#6366f1"/>
                  <stop offset="100%" stopColor="#7c3aed"/>
                </linearGradient>
                {/* Glow filter for hub */}
                <filter id="triageGlow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="6" result="coloredBlur"/>
                  <feMerge>
                    <feMergeNode in="coloredBlur"/>
                    <feMergeNode in="SourceGraphic"/>
                  </feMerge>
                </filter>
              </defs>

              {/* User icon and incoming flow - positioned above hub */}
              <g>
                {/* User circle */}
                <circle cx="100" cy="70" r="24" fill="#374151" stroke="#4b5563" strokeWidth="2"/>
                {/* User icon path */}
                <g transform="translate(86, 56)">
                  <path
                    d="M18 7.5a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM13.5 15.75a7.875 7.875 0 00-7.875 7.875h15.75a7.875 7.875 0 00-7.875-7.875z"
                    fill="none"
                    stroke="#9ca3af"
                    strokeWidth="1.5"
                    transform="scale(1)"
                  />
                </g>
                <text x="100" y="110" textAnchor="middle" fill="#6b7280" fontSize="11">User</text>

                {/* Incoming dashed line - vertical */}
                <line
                  x1="100" y1="120" x2="100" y2="175"
                  stroke="#14b8a6"
                  strokeWidth="2"
                  strokeDasharray="6 4"
                  opacity="0.7"
                />
                {/* Arrow pointing down */}
                <polygon points="95,175 100,190 105,175" fill="#14b8a6"/>
              </g>

              {/* Central Triage Hub */}
              <g filter="url(#triageGlow)">
                {/* Outer glow circle */}
                <circle cx="100" cy="230" r="45" fill="#14b8a6" opacity="0.12"/>
                {/* Main hub circle */}
                <circle cx="100" cy="230" r="36" fill="url(#triageHubGradient)" stroke="#2dd4bf" strokeWidth="3"/>
                {/* Hub icon - clipboard check */}
                <g transform="translate(82, 212)">
                  <path
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                    fill="none"
                    stroke="white"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    transform="scale(1.4)"
                  />
                </g>
              </g>

              {/* Hub label */}
              <g>
                <rect x="40" y="278" width="120" height="24" rx="12" fill="#1f2937" stroke="#374151"/>
                <text x="100" y="294" textAnchor="middle" fill="#5eead4" fontSize="11" fontWeight="500">{botName}</text>
                <text x="100" y="318" textAnchor="middle" fill="#6b7280" fontSize="10">Evaluates & Routes</text>
              </g>

              {/* Curved paths to destinations */}
              {routes.map((route, index) => {
                const endY = getDestinationY(index, routes.length);
                return (
                  <g key={`path-${route.deploymentId || index}`}>
                    {/* The curved connection line */}
                    <path
                      d={getCurvedPath(index, routes.length)}
                      fill="none"
                      stroke="url(#triageCurveGradient)"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />
                    {/* Dot at end */}
                    <circle cx="285" cy={endY} r="4" fill="#818cf8" />
                  </g>
                );
              })}

              {/* Destination bot pills */}
              {routes.map((route, index) => {
                const y = getDestinationY(index, routes.length);
                // Estimate text width (roughly 7px per character)
                const textWidth = Math.max(route.name.length * 8, 80);
                const pillWidth = textWidth + 40;
                const pillX = 295;
                return (
                  <g key={`dest-${route.deploymentId || index}`}>
                    {/* Pill background */}
                    <rect
                      x={pillX}
                      y={y - 14}
                      width={pillWidth}
                      height="28"
                      rx="14"
                      fill="#1f2937"
                      stroke="#6366f1"
                      strokeWidth="1.5"
                    />
                    {/* Bot name centered */}
                    <text
                      x={pillX + pillWidth / 2}
                      y={y + 5}
                      textAnchor="middle"
                      fill="#f3f4f6"
                      fontSize="12"
                      fontWeight="500"
                    >
                      {route.name}
                    </text>
                  </g>
                );
              })}

            </svg>
          </div>
        )}
      </div>
    );
  }

  return null;
}
