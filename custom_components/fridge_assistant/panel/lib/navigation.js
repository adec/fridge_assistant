/* Optional launch context for dashboards/kiosks; normal sidebar launches are unchanged. */
export function homePath(search, origin) {
  const raw = new URLSearchParams(search).get('return_to');
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return null;
  try {
    const url = new URL(raw, origin);
    if (url.origin !== origin || url.pathname === '/fridge-assistant' || url.pathname.startsWith('/api/')) return null;
    return url.pathname + url.search + url.hash;
  } catch { return null; }
}
