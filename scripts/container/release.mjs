/**
 * [INPUT]: 依赖 GitHub 事件、package.json、Docker CLI 与 GHCR Registry V2 接口。
 * [OUTPUT]: 导出发布策略、原始清单读取、OCI 索引写入与双架构频道发布；提供 CI CLI。
 * [POS]: 容器发布边界。先验收 SHA 暂存清单与公开拉取，再写入版本与串行频道。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const run = promisify(execFile);
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const digestPattern = /^sha256:[a-f0-9]{64}$/;
const imagePattern = /^ghcr\.io\/[a-z0-9][a-z0-9_.-]*\/[a-z0-9][a-z0-9_.-]*$/;
const versionAnnotation = 'org.opencontainers.image.version';
const platforms = ['amd64', 'arm64'];
const manifestTypes = ['application/vnd.oci.image.manifest.v1+json', 'application/vnd.docker.distribution.manifest.v2+json'];
const indexTypes = ['application/vnd.oci.image.index.v1+json', 'application/vnd.docker.distribution.manifest.list.v2+json'];
const contentDigest = body => `sha256:${createHash('sha256').update(body).digest('hex')}`;

function requireVersion(version) {
  if (typeof version !== 'string' || !versionPattern.test(version)) throw new Error(`Invalid release version: ${version}`);
  return version.split('.').map(BigInt);
}

export function compareVersions(left, right) {
  const a = requireVersion(left), b = requireVersion(right);
  for (let i = 0; i < a.length; i++) {
    if (a[i] > b[i]) return 1;
    if (a[i] < b[i]) return -1;
  }
  return 0;
}

export function createReleasePlan({ eventName, ref, repository = 'zhubby/mappingout', sha, packageVersion }) {
  requireVersion(packageVersion);
  const image = `ghcr.io/${repository.toLowerCase()}`;
  if (!imagePattern.test(image)) throw new Error('Invalid GitHub repository identity');
  if (typeof sha !== 'string' || !/^[a-f0-9]{40}$/.test(sha)) throw new Error('Invalid full commit identity');
  const formal = ref.startsWith('refs/tags/desktop-v');
  const version = formal ? ref.slice('refs/tags/desktop-v'.length) : packageVersion;
  requireVersion(version);
  if (formal && version !== packageVersion) throw new Error(`Tag version ${version} differs from package version ${packageVersion}`);
  return {
    image, sha, version, formal,
    publish: eventName === 'push' && (ref === 'refs/heads/main' || formal),
    channel: formal ? version : 'edge', commitTag: `sha-${sha}`,
  };
}

export function shouldPromoteLatest(version, currentManifest) {
  requireVersion(version);
  if (currentManifest === null) return true;
  const current = currentManifest?.annotations?.[versionAnnotation];
  if (!current) throw new Error('Current latest has no top-level OCI version annotation');
  return compareVersions(version, current) >= 0;
}

async function registryToken(image, { fetch = globalThis.fetch, token, actor = 'x-access-token', visibilityProbe = false, scope = 'pull' } = {}) {
  if (!imagePattern.test(image)) throw new Error('Invalid registry image identity');
  const repository = image.slice('ghcr.io/'.length);
  const tokenURL = new URL('https://ghcr.io/token');
  tokenURL.searchParams.set('service', 'ghcr.io');
  tokenURL.searchParams.set('scope', `repository:${repository}:${scope}`);
  const headers = token ? { Authorization: `Basic ${Buffer.from(`${actor}:${token}`).toString('base64')}` } : {};
  const tokenResponse = await fetch(tokenURL, { headers, signal: AbortSignal.timeout(30_000) });
  if (!tokenResponse.ok) {
    let errors;
    try { errors = (await tokenResponse.json()).errors; } catch { /* 代理响应不能证明可见性。 */ }
    if (visibilityProbe && [401, 403].includes(tokenResponse.status) && Array.isArray(errors)
      && errors.length > 0 && errors.every(error => error.code === 'DENIED')) return null;
    throw new Error(`registry ${visibilityProbe ? 'visibility ' : ''}token request failed (${tokenResponse.status})`);
  }
  const credentials = await tokenResponse.json();
  const bearer = credentials.token ?? credentials.access_token;
  if (!bearer) throw new Error('registry token response has no token');
  return bearer;
}

/** 仅注册表明确返回不存在时返回 null；认证、代理与网络故障全部向上传递。 */
export async function registryManifest(image, tag, { fetch = globalThis.fetch, token, actor } = {}) {
  const bearer = await registryToken(image, { fetch, token, actor });
  const repository = image.slice('ghcr.io/'.length);
  const response = await fetch(`https://ghcr.io/v2/${repository}/manifests/${encodeURIComponent(tag)}`, {
    headers: { Authorization: `Bearer ${bearer}`, Accept: [...indexTypes, ...manifestTypes].join(', ') },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    let errors;
    try { errors = (await response.json()).errors; } catch { /* 代理响应不是注册表 JSON。 */ }
    if (response.status === 404 && Array.isArray(errors) && errors.length > 0
      && errors.every(error => ['MANIFEST_UNKNOWN', 'NAME_UNKNOWN'].includes(error.code))) return null;
    throw new Error(`registry manifest request failed (${response.status}) for ${image}:${tag}`);
  }
  const body = await response.text();
  const manifest = JSON.parse(body);
  if (!manifest || manifest.schemaVersion !== 2 || ![...indexTypes, ...manifestTypes].includes(manifest.mediaType)) {
    throw new Error('registry returned an invalid version 2 manifest');
  }
  const digest = response.headers.get('docker-content-digest');
  if (!digestPattern.test(digest ?? '')) throw new Error('registry manifest response has no valid content digest');
  return { manifest, digest, size: Buffer.byteLength(body) };
}

export async function registryPutIndex(image, tag, body, { fetch = globalThis.fetch, token, actor } = {}) {
  if (typeof body !== 'string') throw new Error('OCI index body must be serialized JSON bytes');
  const index = JSON.parse(body);
  if (index?.schemaVersion !== 2 || index.mediaType !== indexTypes[0]) throw new Error('Expected an OCI index body');
  const bearer = await registryToken(image, { fetch, token, actor, scope: 'pull,push' });
  const repository = image.slice('ghcr.io/'.length);
  const response = await fetch(`https://ghcr.io/v2/${repository}/manifests/${encodeURIComponent(tag)}`, {
    method: 'PUT', body,
    headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': indexTypes[0] },
    signal: AbortSignal.timeout(30_000),
  });
  if (response.status !== 201) throw new Error(`registry index PUT expected 201, received ${response.status}`);
  const digest = response.headers.get('docker-content-digest');
  if (digest !== contentDigest(body)) throw new Error('registry index PUT returned an inconsistent content digest');
  return { digest };
}

function requireDigests(digests) {
  if (!digests || Object.keys(digests).sort().join(',') !== platforms.join(',')
    || platforms.some(arch => !digestPattern.test(digests[arch]))) throw new Error('Expected validated amd64 and arm64 digests');
}

export function validateArchitectureIndex(manifest, digests, version) {
  requireDigests(digests);
  if (manifest?.annotations?.[versionAnnotation] !== version) throw new Error('Remote index version annotation differs from release version');
  if (manifest.mediaType !== indexTypes[0] || !Array.isArray(manifest.manifests) || manifest.manifests.length !== 2) {
    throw new Error('Remote index must contain exactly two runnable architecture entries');
  }
  const seen = new Set();
  for (const entry of manifest.manifests) {
    const arch = entry.platform?.architecture;
    if (entry.platform?.os !== 'linux' || !platforms.includes(arch) || seen.has(arch)
      || !manifestTypes.includes(entry.mediaType)) throw new Error('Remote index has an invalid architecture entry');
    if (!Number.isSafeInteger(entry.size) || entry.size <= 0) throw new Error('Remote index has an invalid child byte size');
    if (entry.digest !== digests[arch]) throw new Error(`Remote ${arch} digest differs from validated image`);
    seen.add(arch);
  }
}

function requirePublisher(plan) {
  if (!plan.publish) throw new Error('A validation-only event cannot publish images');
}

export async function publishArchitecture(plan, arch, { exec = run, readManifest = registryManifest } = {}) {
  requirePublisher(plan);
  if (!platforms.includes(arch)) throw new Error('Unsupported native architecture');
  const reference = `${plan.image}:${plan.commitTag}-${arch}`;
  // 保留 Docker 配置和 HEALTHCHECK；OCI 索引直接引用这些原始子清单。
  await exec('docker', ['tag', 'mappingout:test', reference]);
  await exec('docker', ['push', reference], { maxBuffer: 8 * 1024 * 1024 });
  const remote = await readManifest(plan.image, `${plan.commitTag}-${arch}`);
  if (!remote || !manifestTypes.includes(remote.manifest.mediaType)) {
    throw new Error('Published architecture must be a runnable image manifest');
  }
  return { arch, digest: remote.digest };
}

export async function publishManifest(plan, digests, {
  exec = run, readManifest = registryManifest, writeIndex = registryPutIndex, verifyPublic = verifyPublicPull,
  currentMainSha = async () => {
    const { stdout } = await exec('git', ['ls-remote', 'origin', 'refs/heads/main']);
    const main = stdout.trim().split(/\s+/)[0];
    if (!/^[a-f0-9]{40}$/.test(main)) throw new Error('Cannot establish current main commit');
    return main;
  },
} = {}) {
  requirePublisher(plan);
  requireDigests(digests);
  // 频道写入由工作流独立串行；先证明 latest 的现有版本，再执行任何清单写入。
  const latest = plan.formal ? await readManifest(plan.image, 'latest') : null;
  const promote = plan.formal ? shouldPromoteLatest(plan.version, latest === null ? null : latest.manifest) : false;
  const manifests = [];
  for (const arch of platforms) {
    const child = await readManifest(plan.image, digests[arch]);
    if (!child || child.digest !== digests[arch]) throw new Error(`Remote ${arch} child digest differs from validated image`);
    if (!Number.isSafeInteger(child.size) || child.size <= 0) throw new Error(`Remote ${arch} child manifest has no exact positive byte size`);
    if (!manifestTypes.includes(child.manifest?.mediaType)) throw new Error(`Remote ${arch} child is not a runnable image manifest`);
    manifests.push({ mediaType: child.manifest.mediaType, digest: child.digest, size: child.size, platform: { os: 'linux', architecture: arch } });
  }
  // 只建立 OCI 索引；保持子清单、配置与层的原始摘要。
  const body = JSON.stringify({
    schemaVersion: 2, mediaType: indexTypes[0], manifests,
    annotations: {
      [versionAnnotation]: plan.version, 'org.opencontainers.image.revision': plan.sha,
      'org.opencontainers.image.source': `https://github.com/${plan.image.slice('ghcr.io/'.length)}`,
    },
  });
  const digest = contentDigest(body);
  const publishTag = async tag => {
    const written = await writeIndex(plan.image, tag, body);
    if (written?.digest !== digest) throw new Error(`Published ${tag} index write digest differs from staged bytes`);
    const published = await readManifest(plan.image, tag);
    if (!published) throw new Error(`Published ${tag} index is absent`);
    if (published.digest !== digest) throw new Error(`Published ${tag} index digest differs from staged bytes`);
    validateArchitectureIndex(published.manifest, digests, plan.version);
  };
  await publishTag(plan.commitTag);
  // 公开拉取失败只留下 SHA 暂存清单；版本和部署频道仍指向原先的镜像。
  await verifyPublic(plan, digests, { readManifest, exec });
  if (plan.formal) await publishTag(plan.version);
  // 写 edge 前重新读取 main；排除排队中的旧提交和旧运行重试。
  const edge = !plan.formal && await currentMainSha() === plan.sha;
  if (promote || edge) await publishTag(promote ? 'latest' : 'edge');
  return { latest: promote, edge, digest };
}

export async function packageVisibility(plan, { fetch = globalThis.fetch } = {}) {
  // 已认证发布证明镜像存在；匿名拉取授权只判断公开可见性，不承担 latest 缺失判断。
  const token = await registryToken(plan.image, { fetch, visibilityProbe: true });
  return token === null ? 'private' : 'public';
}

export async function verifyPublicPull(plan, digests, { visibility = packageVisibility, readManifest = registryManifest, exec = run } = {}) {
  if (await visibility(plan) !== 'public') {
    console.log('GHCR package is private/internal. New GHCR packages default to private; set package visibility to public to enable anonymous pulls.');
    return false;
  }
  const remote = await readManifest(plan.image, plan.commitTag, { anonymous: true });
  if (!remote) throw new Error('Public package cannot be pulled anonymously');
  validateArchitectureIndex(remote.manifest, digests, plan.version);
  // 独立空配置防止发布凭据泄漏到匿名拉取验证。
  const config = await mkdtemp(path.join(os.tmpdir(), 'mappingout-anonymous-pull-'));
  try {
    for (const arch of platforms) {
      await exec('docker', ['--config', config, 'pull', '--platform', `linux/${arch}`, `${plan.image}@${digests[arch]}`], { maxBuffer: 8 * 1024 * 1024 });
    }
  } finally { await rm(config, { recursive: true, force: true }); }
  console.log('Anonymous public pull verified for amd64 and arm64.');
  return true;
}

async function main() {
  const packageVersion = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8')).version;
  const plan = createReleasePlan({
    eventName: process.env.GITHUB_EVENT_NAME, ref: process.env.GITHUB_REF ?? '',
    repository: process.env.GITHUB_REPOSITORY, sha: process.env.GITHUB_SHA, packageVersion,
  });
  const command = process.argv[2];
  const credentials = { token: process.env.GITHUB_TOKEN, actor: process.env.GITHUB_ACTOR };
  const readManifest = (image, tag, options = {}) => registryManifest(image, tag, options.anonymous ? {} : credentials);
  const writeIndex = (image, tag, body) => registryPutIndex(image, tag, body, credentials);
  if (command === 'plan') {
    if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, Object.entries(plan).map(([key, value]) => `${key}=${value}\n`).join(''));
    console.log(JSON.stringify(plan, null, 2));
  } else if (command === 'publish-arch') {
    if (!process.argv[3]) throw new Error('publish-arch requires an output file');
    const result = await publishArchitecture(plan, process.env.CONTAINER_ARCH, { readManifest });
    await writeFile(process.argv[3], JSON.stringify(result) + '\n');
    console.log(`${result.arch}: ${result.digest}`);
  } else if (command === 'merge') {
    if (!process.argv[3]) throw new Error('merge requires a digest directory');
    const digests = {};
    for (const arch of platforms) {
      const entry = JSON.parse(await readFile(path.join(process.argv[3], `digest-${arch}.json`), 'utf8'));
      if (entry.arch !== arch) throw new Error(`Unexpected architecture in ${arch} artifact`);
      digests[arch] = entry.digest;
    }
    const result = await publishManifest(plan, digests, { readManifest, writeIndex });
    console.log(JSON.stringify(result, null, 2));
  } else throw new Error('Expected plan, publish-arch, or merge command');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
