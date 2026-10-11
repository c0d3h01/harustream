import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { imgUrl } from '@/lib/media';

describe('imgUrl', () => {
  it('returns empty for falsy', () => {
    assert.strictEqual(imgUrl(null), '');
    assert.strictEqual(imgUrl(undefined), '');
  });
  it('passes local paths through', () => {
    assert.strictEqual(imgUrl('/foo.png'), '/foo.png');
  });
  it('proxies remote urls', () => {
    assert.match(imgUrl('https://cdn/x.jpg'), /^\/api\/image\/.+/);
  });
});
