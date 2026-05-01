// Lite does not track deployment event history separately. These stubs keep
// the builder executor flow intact without persisting events.

export const DeploymentEventRepository = {
  async create(_data) {
    return { id: null };
  },

  async updateStatus(_id, _status) {
    return null;
  },
};
