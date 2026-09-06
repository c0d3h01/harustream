// Shared SSRF guard. Used by every proxy that fetches a caller-influenced
// upstream URL server-side (streaming proxy, image proxy) so the check lives
// in one place instead of being reimplemented per proxy.
//
// Full DNS resolution is skipped to avoid latency; this only rejects the
// obvious cases (IP literals in private/reserved ranges, loopback, and
// `.local`/`.internal` hostnames). It is not a substitute for network-level
// egress controls, but it stops the common case of a proxy being pointed at
// the host's own internal services.
export function isInternalHost(host: string): boolean {
  const lower = host.toLowerCase();
  if (lower === 'localhost' || lower.endsWith('.local') || lower.endsWith('.internal')) {
    return true;
  }
  const v4 = lower.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 127 || a === 0) return true; // loopback / this network
  }
  return false;
}
