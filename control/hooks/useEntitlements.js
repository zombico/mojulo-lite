// Lite has no billing / quotas. Return an unrestricted entitlements object so
// that copied wizard steps (Deploy.jsx) get permissive answers without
// needing plan-aware branches stripped out.

export function useEntitlements() {
  return {
    isLoading: false,
    plan: 'lite',
    features: {
      knowledge: true,
      formGathering: true,
      appointments: true,
      triage: true,
      sso: true,
      auditLogs: true,
    },
    quotas: {
      deployedBots: { used: 0, limit: Infinity, remaining: Infinity },
      botSpaces: { used: 0, limit: Infinity, remaining: Infinity },
      users: { used: 1, limit: Infinity, remaining: Infinity },
    },
    hasFeature: () => true,
    hasQuota: () => true,
    canDeploy: true,
  };
}
