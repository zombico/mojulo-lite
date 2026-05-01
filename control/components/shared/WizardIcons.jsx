// Wizard Step Icons
// Shared icon components used across wizard flows

export const ResourcesIcon = ({ className = "w-5 h-5" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
  </svg>
);

export const IdentityIcon = ({ className = "w-5 h-5" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <rect x="6" y="8" width="12" height="13" rx="1.5" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    <rect x="8" y="11" width="8" height="5" rx="1" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    <line x1="12" y1="8" x2="12" y2="4" strokeWidth={2} strokeLinecap="round" />
    <circle cx="12" cy="3" r="1" fill="currentColor" />
    <circle cx="10.5" cy="13.5" r="0.5" fill="currentColor" />
    <circle cx="13.5" cy="13.5" r="0.5" fill="currentColor" />
  </svg>
);

export const DRAGbotFavicon = ({ className = "w-5 h-5", variant = "light" }) => {
  const isLight = variant === "light";
  const porcelainId = isLight ? "porcelain-light" : "porcelain-dark";
  const glossId = isLight ? "gloss-light" : "gloss-dark";
  const shadowId = isLight ? "shadow-light" : "shadow-dark";
  const faceColor = isLight ? "#0a2028" : "#061418";

  return (
    <svg className={className} viewBox="0 0 512 512" fill="none">
      <defs>
        <rect id="pill" width="118" height="92" rx="40" ry="40"/>
        {isLight ? (
          <>
            <linearGradient id={porcelainId} x1="0.1" y1="0" x2="0.5" y2="1">
              <stop offset="0%" stopColor="#fff"/>
              <stop offset="25%" stopColor="#f8f8fb"/>
              <stop offset="50%" stopColor="#f0f0f5"/>
              <stop offset="75%" stopColor="#e8e8ee"/>
              <stop offset="100%" stopColor="#e0e0e8"/>
            </linearGradient>
            <radialGradient id={glossId} cx="0.25" cy="0.15" r="0.65">
              <stop offset="0%" stopColor="#fff" stopOpacity="0.9"/>
              <stop offset="40%" stopColor="#fff" stopOpacity="0.2"/>
              <stop offset="100%" stopColor="#fff" stopOpacity="0"/>
            </radialGradient>
            <filter id={shadowId} x="-10%" y="-10%" width="130%" height="140%">
              <feDropShadow dx="6" dy="10" stdDeviation="12" floodColor="#0a1820" floodOpacity="0.25"/>
            </filter>
          </>
        ) : (
          <>
            <linearGradient id={porcelainId} x1="0.1" y1="0" x2="0.5" y2="1">
              <stop offset="0%" stopColor="#3a3a42"/>
              <stop offset="30%" stopColor="#2e2e36"/>
              <stop offset="55%" stopColor="#333340"/>
              <stop offset="80%" stopColor="#28282e"/>
              <stop offset="100%" stopColor="#222228"/>
            </linearGradient>
            <radialGradient id={glossId} cx="0.25" cy="0.15" r="0.65">
              <stop offset="0%" stopColor="#fff" stopOpacity="0.2"/>
              <stop offset="40%" stopColor="#fff" stopOpacity="0.05"/>
              <stop offset="100%" stopColor="#fff" stopOpacity="0"/>
            </radialGradient>
            <filter id={shadowId} x="-10%" y="-10%" width="130%" height="140%">
              <feDropShadow dx="4" dy="8" stdDeviation="14" floodColor="#000" floodOpacity="0.5"/>
            </filter>
          </>
        )}
      </defs>
      {/* Chat bubble with shadow */}
      <path d="M256,48 C410,48 504,120 504,218 C504,316 410,388 340,388 L168,388 L56,488 L100,388 C30,370 8,310 8,218 C8,120 102,48 256,48 Z" fill={`url(#${porcelainId})`} filter={`url(#${shadowId})`}/>
      {/* Chat bubble base */}
      <path d="M256,48 C410,48 504,120 504,218 C504,316 410,388 340,388 L168,388 L56,488 L100,388 C30,370 8,310 8,218 C8,120 102,48 256,48 Z" fill={`url(#${porcelainId})`}/>
      {/* Gloss overlay */}
      <path d="M256,48 C410,48 504,120 504,218 C504,316 410,388 340,388 L168,388 L56,488 L100,388 C30,370 8,310 8,218 C8,120 102,48 256,48 Z" fill={`url(#${glossId})`}/>
      {/* Face area */}
      <rect x="66" y="102" width="380" height="232" rx="100" ry="100" fill={faceColor}/>
      {/* Eyes */}
      <use href="#pill" x="127" y="172" fill="#5eead4"/>
      <use href="#pill" x="267" y="172" fill="#5eead4"/>
    </svg>
  );
};

export const RAGIcon = ({ className = "w-5 h-5" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
  </svg>
);

export const FormsIcon = ({ className = "w-5 h-5" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
  </svg>
);

export const DeployIcon = ({ className = "w-5 h-5" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
  </svg>
);

export const TriageIcon = ({ className = "w-5 h-5" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12h6m0 0l4-5h6m-10 5l4 5h6" />
  </svg>
);

export const AppointmentsIcon = ({ className = "w-5 h-5" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);
