/**
 * [INPUT]: 依赖浏览器 Crypto 与 noble 的 SHA-256。
 * [OUTPUT]: 提供 HTTP 可用的资料哈希与 UUID v4。
 * [POS]: 浏览器加密能力边界；保留哈希校验和随机标识强度。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const subtle = globalThis.crypto?.subtle;
  return bytesToHex(subtle ? new Uint8Array(await subtle.digest('SHA-256', bytes)) : sha256(bytes));
}

export function randomUUID(): string {
  if (globalThis.crypto.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytesToHex(bytes);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
