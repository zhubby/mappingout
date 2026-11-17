/**
 * [INPUT]: 依赖 Node.js 压缩、哈希和 Ed25519 验签能力。
 * [OUTPUT]: 提供安全路径、确定性 ZIP 和资源信封验签。
 * [POS]: 资源构建与发布共用的纯规则；不读取私钥。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import {deflateRawSync, crc32} from 'node:zlib';
import {createHash, createPublicKey, verify} from 'node:crypto';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export function safePath(name) {
  return typeof name === 'string' && /^[a-zA-Z0-9_./-]+$/.test(name) && !name.startsWith('/') && name.split('/').every(part => part && part !== '.' && part !== '..');
}

// Fixed ordering, timestamps, compression and permissions produce identical ZIPs
// on all build hosts. No symlinks, directories or executable entries are emitted.
export function createZip(files) {
  const local = [], central = []; let offset = 0;
  const seen=new Set();
  if(files.length>65535)throw Error('Too many resource files');
  for (const [name, bytes] of [...files].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
    if (!safePath(name)) throw Error(`Invalid resource path: ${name}`);
    if(seen.has(name.toLowerCase()))throw Error('Duplicate resource path');seen.add(name.toLowerCase());
    const filename = Buffer.from(name), compressed = deflateRawSync(bytes, {level: 9}), crc = crc32(bytes);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20,4); header.writeUInt16LE(8,8); header.writeUInt16LE(33,12);
    header.writeUInt32LE(crc,14); header.writeUInt32LE(compressed.length,18); header.writeUInt32LE(bytes.length,22); header.writeUInt16LE(filename.length,26);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50); directory.writeUInt16LE(20,4); directory.writeUInt16LE(20,6); directory.writeUInt16LE(8,10); directory.writeUInt16LE(33,14);
    directory.writeUInt32LE(crc,16); directory.writeUInt32LE(compressed.length,20); directory.writeUInt32LE(bytes.length,24); directory.writeUInt16LE(filename.length,28); directory.writeUInt32LE(offset,42);
    local.push(header, filename, compressed); central.push(directory, filename);
    offset += header.length + filename.length + compressed.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(files.length,8); end.writeUInt16LE(files.length,10); end.writeUInt32LE(directory.length,12); end.writeUInt32LE(offset,16);
  return Buffer.concat([...local, directory, end]);
}

export function verifyEnvelope(envelope, encodedKey) {
  const payload = Buffer.from(envelope.payload, 'base64');
  const keyText = Buffer.from(encodedKey, 'base64').toString('utf8').trim().split(/\r?\n/);
  const rawKey = Buffer.from(keyText.at(-1), 'base64');
  const lines = Buffer.from(envelope.signature, 'base64').toString('utf8').trim().split(/\r?\n/);
  const signature = Buffer.from(lines[1] || '', 'base64');
  if(!['ED','Ed'].includes(signature.subarray(0,2).toString())||rawKey.subarray(0,2).toString()!=='Ed')throw Error('Invalid resource signature algorithm');
  const key = createPublicKey({key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), rawKey.subarray(10)]), format:'der', type:'spki'});
  const message = signature.subarray(0,2).toString() === 'ED' ? createHash('blake2b512').update(payload).digest() : payload;
  if (rawKey.length !== 42 || signature.length !== 74 || !rawKey.subarray(2,10).equals(signature.subarray(2,10)) || !verify(null,message,key,signature.subarray(10)) || !lines[2]?.startsWith('trusted comment: ') || !verify(null,Buffer.concat([signature.subarray(10),Buffer.from(lines[2].slice(17))]),key,Buffer.from(lines[3] || '', 'base64'))) throw Error('Invalid resource signature');
  return JSON.parse(payload.toString('utf8'));
}
