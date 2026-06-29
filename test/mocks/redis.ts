export function createMockRedis() {
  return {
    get: null,
    set: 'OK',
    del: 1,
    // Add specific mock returns as needed for tests
  };
}
