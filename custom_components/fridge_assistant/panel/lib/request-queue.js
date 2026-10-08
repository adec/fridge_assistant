/* Preserve mutations arriving while background refreshes are running. */
export function serializeRequests(task) {
  let pending = Promise.resolve();
  return (...args) => {
    const result = pending.then(() => task(...args));
    pending = result.catch(() => {});
    return result;
  };
}
