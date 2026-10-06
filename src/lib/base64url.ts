export function encodeBase64Url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

export function decodeBase64Url(encoded: string): string {
  return Buffer.from(encoded, 'base64url').toString('utf8');
}
