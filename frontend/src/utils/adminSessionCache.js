// Session validity is cached in memory only. Protected APIs still validate every request.
export function createAdminSessionCache(loadSession, { now = Date.now, ttl = 5 * 60 * 1000 } = {}) {
  let value = null;
  let expiresAt = 0;
  let pending = null;
  let generation = 0;
  const peek = () => value && now() < expiresAt ? value : null;
  const clear = () => { generation += 1; value = null; expiresAt = 0; pending = null; };
  const load = ({ force = false } = {}) => {
    const cached = peek();
    if (cached && !force) return Promise.resolve(cached);
    if (pending) return pending;
    const version = generation;
    const request = Promise.resolve().then(loadSession).then((session) => {
      if (version === generation) { value = session; expiresAt = now() + ttl; }
      return session;
    }).finally(() => { if (pending === request) pending = null; });
    pending = request;
    return request;
  };
  return { peek, load, clear, remaining: () => Math.max(0, expiresAt - now()) };
}
