// Lite does not have bot spaces. This stub returns null/empty results so the
// builder stream code can call these methods without crashing.

export const BotSpaceRepository = {
  async findById(_id) {
    return null;
  },

  async list() {
    return [];
  },
};
