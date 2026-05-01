// Lite has no org-level settings. The builder stream route expects these shapes;
// returning null/defaults causes the fallback auto-select logic to kick in.

export const OrganizationSettingsRepository = {
  async getBuilderConfig(_orgName) {
    return null;
  },

  async getDefaultRegion(_orgName) {
    return 'us-east-1';
  },
};
