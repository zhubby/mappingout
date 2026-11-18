/**
 * [INPUT]: 依赖浏览器哈希与 UUID 能力边界、Node 参考实现。
 * [OUTPUT]: 验证原生和 HTTP 哈希一致、安全随机 UUID 格式。
 * [POS]: 浏览器兼容回归；覆盖多字节与多块哈希输入。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import { createHash, webcrypto } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomUUID, sha256Hex } from '../src/shared/browserCrypto';

afterEach(() => vi.unstubAllGlobals());

describe.each([['native', webcrypto], ['HTTP', {}]])('%s SHA-256', (_name, cryptoApi) => {
  it.each(['', 'abc', '泰瑞亚地图 🗺️'.repeat(500)])('matches the reference hash for %s', async text => {
    vi.stubGlobal('crypto', cryptoApi);
    expect(await sha256Hex(text)).toBe(createHash('sha256').update(text).digest('hex'));
  });
});

it('uses getRandomValues for RFC 9562 UUID v4 when randomUUID is unavailable', () => {
  const getRandomValues = vi.fn((bytes: Uint8Array) => bytes.fill(255));
  vi.stubGlobal('crypto', { getRandomValues });
  expect(randomUUID()).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
  expect(getRandomValues).toHaveBeenCalledOnce();
});
