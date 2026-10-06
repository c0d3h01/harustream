import { isIP } from 'node:net';

const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.home.arpa'];

// Single-uint32 CIDR checks; `isIP` already validated the dotted quad.
const BLOCKED_V4: Array<[base: number, bits: number]> = [
  [0x00_00_00_00, 8], // 0.0.0.0/8 this network
  [0x0a_00_00_00, 8], // 10.0.0.0/8 private
  [0x64_40_00_00, 10], // 100.64.0.0/10 CGNAT
  [0x7f_00_00_00, 8], // 127.0.0.0/8 loopback
  [0xa9_fe_00_00, 16], // 169.254.0.0/16 link-local, incl. cloud metadata
  [0xac_10_00_00, 12], // 172.16.0.0/12 private
  [0xc0_00_00_00, 16], // 192.0.0.0/16 incl. TEST-NET-1
  [0xc0_a8_00_00, 16], // 192.168.0.0/16 private
  [0xc6_12_00_00, 15], // 198.18.0.0/15 benchmarking
  [0xc6_33_00_00, 16], // 198.51.0.0/16 TEST-NET-2
  [0xcb_00_00_00, 16], // 203.0.0.0/16 TEST-NET-3
];

function blockedIPv4(address: string): boolean {
  const value = address.split('.').reduce((acc, octet) => acc * 256 + Number(octet), 0);
  if (value >= 0xe0_00_00_00) return true; // 224.0.0.0/3 multicast, reserved, broadcast
  return BLOCKED_V4.some(([base, bits]) => value >>> (32 - bits) === base >>> (32 - bits));
}

function blockedIPv6(host: string): boolean {
  const address = host.replace(/^\[/, '').replace(/\]$/, '').split('%')[0].toLowerCase();
  if (isIP(address) !== 6) return true;
  if (address.includes('.')) {
    const embedded = address.slice(address.lastIndexOf(':') + 1);
    return isIP(embedded) === 4 ? blockedIPv4(embedded) : true;
  }
  const halves = address.split('::');
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const fill = 8 - head.length - tail.length;
  const groups =
    halves.length === 2
      ? [...head, ...Array.from({ length: fill }, () => '0'), ...tail]
      : address.split(':');
  const nums = groups.map((group) => Number.parseInt(group || '0', 16));
  if (nums.every((n) => n === 0)) return true; // :: in any form
  if (nums.slice(0, 7).every((n) => n === 0) && nums[7] === 1) return true; // ::1 in any form
  const first = nums[0];
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((first & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  return false;
}

/**
 * Rejects hostnames that resolve inside the deployment's own network.
 * `new URL()` normalises decimal/hex/octal IPv4 to dotted quad, so only the
 * canonical forms need checking.
 */
export function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.+$/, '');
  if (!host) return true;
  if (host === 'localhost') return true;
  if (BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix))) return true;
  if (host.includes(':')) return blockedIPv6(host);
  if (isIP(host) === 4) return blockedIPv4(host);
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  return false;
}

export function assertPublicUrl(url: URL): void {
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Only http(s) targets are allowed');
  }
  if (url.username || url.password) throw new Error('Target credentials are not allowed');
  if (isBlockedHost(url.hostname)) throw new Error('Target host is not reachable');
}
