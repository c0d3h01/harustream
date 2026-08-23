export function encodeRef(value: string): string {
  if (typeof window === 'undefined') {
    return Buffer.from(value, 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }
  return btoa(unescape(encodeURIComponent(value)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function decodeRef(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  if (typeof window === 'undefined') return Buffer.from(padded, 'base64').toString('utf8');
  return decodeURIComponent(escape(atob(padded)));
}
