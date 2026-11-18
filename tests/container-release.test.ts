/**
 * [INPUT]: 依赖容器发布策略、Node 摘要与可注入的注册表、命令接口。
 * [OUTPUT]: 验证事件分流、版本单调性、注册表错误、公开拉取门禁与双架构聚合。
 * [POS]: 容器发布的行为回归；外部请求使用协议级固定响应。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import { describe, expect, test, vi } from 'vitest';
import { createHash } from 'node:crypto';
import {
  compareVersions, createReleasePlan, shouldPromoteLatest, registryManifest, registryPutIndex,
  validateArchitectureIndex, publishArchitecture, publishManifest, verifyPublicPull, packageVisibility,
} from '../scripts/container/release.mjs';

const sha = 'a'.repeat(40);
const digest = (letter: string) => `sha256:${letter.repeat(64)}`;
const bodyDigest = (body: string) => `sha256:${createHash('sha256').update(body).digest('hex')}`;
const input = { eventName: 'push', ref: 'refs/heads/main', repository: 'ZHubby/MappingOut', sha, packageVersion: '1.3.1' };
const digests = { amd64: digest('b'), arm64: digest('c') };
const index = (version = '1.3.1') => ({
  schemaVersion: 2,
  mediaType: 'application/vnd.oci.image.index.v1+json',
  annotations: { 'org.opencontainers.image.version': version },
  manifests: Object.entries(digests).map(([architecture, value]) => ({
    mediaType: 'application/vnd.docker.distribution.manifest.v2+json', digest: value, size: architecture === 'amd64' ? 641 : 739,
    platform: { os: 'linux', architecture },
  })),
});
const found = (manifest = index()) => ({ manifest, digest: digest('d'), size: Buffer.byteLength(JSON.stringify(manifest)) });
const verifiedPublic = async () => true;
const child = (arch: string) => ({
  manifest: { schemaVersion: 2, mediaType: 'application/vnd.docker.distribution.manifest.v2+json' },
  digest: digests[arch], size: arch === 'amd64' ? 641 : 739,
});

function registryFixture(currentLatest: ReturnType<typeof index> | null = null) {
  const bodies = new Map<string, string>();
  const readManifest = vi.fn(async (_image: string, tag: string) => {
    for (const arch of ['amd64', 'arm64']) if (tag === digests[arch]) return child(arch);
    if (tag === 'latest' && !bodies.has(tag)) return currentLatest ? found(currentLatest) : null;
    const body = bodies.get(tag);
    return body ? { manifest: JSON.parse(body), digest: bodyDigest(body), size: Buffer.byteLength(body) } : null;
  });
  const writeIndex = vi.fn(async (_image: string, tag: string, body: string) => {
    bodies.set(tag, body);
    return { digest: bodyDigest(body) };
  });
  return { readManifest, writeIndex, bodies, exec: vi.fn().mockResolvedValue({ stdout: '' }) };
}

describe('container release event policy', () => {
  test.each(['pull_request', 'workflow_dispatch'])('%s validates without publishing', eventName => {
    expect(createReleasePlan({ ...input, eventName })).toMatchObject({ publish: false, formal: false, image: 'ghcr.io/zhubby/mappingout' });
  });
  test('main publishes edge and a complete commit identity', () => {
    expect(createReleasePlan(input)).toMatchObject({ publish: true, formal: false, channel: 'edge', commitTag: `sha-${sha}` });
  });
  test('formal tags bind exactly to the package version', () => {
    expect(createReleasePlan({ ...input, ref: 'refs/tags/desktop-v1.3.1' })).toMatchObject({ publish: true, formal: true, channel: '1.3.1', version: '1.3.1' });
    expect(() => createReleasePlan({ ...input, ref: 'refs/tags/desktop-v1.3.0' })).toThrow(/package version/);
    expect(() => createReleasePlan({ ...input, ref: 'refs/tags/desktop-v01.3.1' })).toThrow(/version/);
    expect(() => createReleasePlan({ ...input, ref: 'refs/tags/desktop-v1.3.1-rc.1' })).toThrow(/version/);
  });
  test('manual dispatch on a release tag still validates release gates without writing', () => {
    expect(createReleasePlan({ ...input, eventName: 'workflow_dispatch', ref: 'refs/tags/desktop-v1.3.1' })).toMatchObject({ formal: true, publish: false });
  });
  test('other branches and unrelated tags cannot publish', () => {
    for (const ref of ['refs/heads/develop', 'refs/tags/resources-v1']) expect(createReleasePlan({ ...input, ref }).publish).toBe(false);
  });
  test('the documented repository default is stable and identifiers are validated', () => {
    expect(createReleasePlan({ ...input, repository: undefined }).image).toBe('ghcr.io/zhubby/mappingout');
    expect(() => createReleasePlan({ ...input, repository: 'bad repo' })).toThrow(/repository/);
    expect(() => createReleasePlan({ ...input, sha: 'latest' })).toThrow(/commit/);
  });
});

describe('latest channel ordering', () => {
  test.each([
    ['1.10.0', '1.9.99', 1], ['2.0.0', '10.0.0', -1], ['1.3.1', '1.3.1', 0],
    ['9007199254740993.0.0', '9007199254740992.0.0', 1],
  ])('compares %s with %s numerically', (a, b, result) => expect(compareVersions(a, b)).toBe(result));
  test('allows an absent latest and equal or newer versions', () => {
    expect(shouldPromoteLatest('1.3.1', null)).toBe(true);
    expect(shouldPromoteLatest('1.3.1', index('1.3.1'))).toBe(true);
    expect(shouldPromoteLatest('1.3.1', index('1.2.9'))).toBe(true);
    expect(shouldPromoteLatest('1.3.1', index('1.4.0'))).toBe(false);
  });
  test('rejects latest metadata that cannot prove version ordering', () => {
    expect(() => shouldPromoteLatest('1.3.1', { ...index(), annotations: {} })).toThrow(/version annotation/);
    expect(() => shouldPromoteLatest('1.3.1', index('edge'))).toThrow(/version/);
  });
});

describe('registry absence and transport failures', () => {
  function fetchFor(response: Response) {
    return vi.fn().mockResolvedValueOnce(Response.json({ token: 'registry-token' })).mockResolvedValueOnce(response);
  }
  test.each(['MANIFEST_UNKNOWN', 'NAME_UNKNOWN'])('recognizes only registry %s 404 as absence', async code => {
    const fetch = fetchFor(Response.json({ errors: [{ code, message: 'not found' }] }, { status: 404 }));
    expect(await registryManifest('ghcr.io/zhubby/mappingout', 'latest', { fetch, token: 'github-token', actor: 'zhubby' })).toBeNull();
    expect(fetch.mock.calls[0][1].headers.Authorization).toMatch(/^Basic /);
    expect(fetch.mock.calls[1][1].headers.Authorization).toBe('Bearer registry-token');
  });
  test.each([401, 403, 429, 500, 503])('fails closed on HTTP %i', async status => {
    const fetch = fetchFor(Response.json({ errors: [{ code: 'DENIED' }] }, { status }));
    await expect(registryManifest('ghcr.io/zhubby/mappingout', 'latest', { fetch })).rejects.toThrow(/registry/);
  });
  test('does not mistake an arbitrary 404 or token failure for a missing latest', async () => {
    await expect(registryManifest('ghcr.io/zhubby/mappingout', 'latest', { fetch: fetchFor(new Response('proxy missing', { status: 404 })) })).rejects.toThrow(/registry/);
    await expect(registryManifest('ghcr.io/zhubby/mappingout', 'latest', { fetch: vi.fn().mockResolvedValue(new Response('denied', { status: 403 })) })).rejects.toThrow(/token/);
    await expect(registryManifest('ghcr.io/zhubby/mappingout', 'latest', { fetch: vi.fn().mockRejectedValue(new Error('network offline')) })).rejects.toThrow('network offline');
  });
  test('returns manifest metadata and the registry content digest', async () => {
    const manifest = { ...index(), annotations: { ...index().annotations, description: '泰瑞亚' } };
    const body = JSON.stringify(manifest, null, 2) + '\n';
    const fetch = fetchFor(new Response(body, { headers: { 'docker-content-digest': digest('d') } }));
    expect(await registryManifest('ghcr.io/zhubby/mappingout', 'latest', { fetch })).toEqual({ manifest, digest: digest('d'), size: Buffer.byteLength(body) });
  });
  test('a successful but malformed registry body cannot authorize latest replacement', async () => {
    for (const body of [null, {}, { schemaVersion: 1 }]) {
      const fetch = fetchFor(Response.json(body, { headers: { 'docker-content-digest': digest('d') } }));
      await expect(registryManifest('ghcr.io/zhubby/mappingout', 'latest', { fetch })).rejects.toThrow(/manifest/);
    }
  });
});

describe('OCI index Registry V2 writes', () => {
  const image = 'ghcr.io/zhubby/mappingout';
  const body = JSON.stringify(index(), null, 2) + '\n';
  function responses(response: Response) {
    return vi.fn().mockResolvedValueOnce(Response.json({ token: 'push-token' })).mockResolvedValueOnce(response);
  }
  test('requests pull,push authorization and PUTs exact annotated OCI bytes', async () => {
    const fetch = responses(new Response(null, { status: 201, headers: { 'docker-content-digest': bodyDigest(body) } }));
    expect(await registryPutIndex(image, 'latest', body, { fetch, token: 'github-token', actor: 'zhubby' })).toEqual({ digest: bodyDigest(body) });
    expect(fetch.mock.calls[0][0].searchParams.get('scope')).toBe('repository:zhubby/mappingout:pull,push');
    expect(fetch.mock.calls[0][1].headers.Authorization).toMatch(/^Basic /);
    expect(fetch.mock.calls[1][0]).toBe('https://ghcr.io/v2/zhubby/mappingout/manifests/latest');
    expect(fetch.mock.calls[1][1]).toMatchObject({
      method: 'PUT', body,
      headers: { Authorization: 'Bearer push-token', 'Content-Type': 'application/vnd.oci.image.index.v1+json' },
    });
  });
  test.each([200, 202, 400, 401, 403, 429, 500])('rejects a non-created HTTP %i response', async status => {
    await expect(registryPutIndex(image, 'latest', body, { fetch: responses(new Response(null, { status })) })).rejects.toThrow(/201/);
  });
  test.each([undefined, 'invalid', digest('e')])('rejects missing or inconsistent response digest %s', async value => {
    const headers = value ? { 'docker-content-digest': value } : {};
    await expect(registryPutIndex(image, 'latest', body, { fetch: responses(new Response(null, { status: 201, headers })) })).rejects.toThrow(/digest/);
  });
});

describe('remote architecture verification', () => {
  test('requires both runnable Linux platforms and expected digests', () => {
    expect(() => validateArchitectureIndex(index(), digests, '1.3.1')).not.toThrow();
    expect(() => validateArchitectureIndex({ ...index(), manifests: index().manifests.slice(0, 1) }, digests, '1.3.1')).toThrow(/architecture/);
    expect(() => validateArchitectureIndex({ ...index(), manifests: [...index().manifests, index().manifests[0]] }, digests, '1.3.1')).toThrow(/architecture/);
    expect(() => validateArchitectureIndex({ ...index(), manifests: index().manifests.map(entry => ({ ...entry, platform: { ...entry.platform, os: 'windows' } })) }, digests, '1.3.1')).toThrow(/architecture/);
    expect(() => validateArchitectureIndex(index(), { ...digests, arm64: digest('e') }, '1.3.1')).toThrow(/digest/);
    expect(() => validateArchitectureIndex(index('1.3.0'), digests, '1.3.1')).toThrow(/version/);
  });
});

describe('serialized channel publication', () => {
  test.each(['refs/heads/main', 'refs/tags/desktop-v1.3.1'])('anonymous verification failure leaves only the staged SHA index for %s', async ref => {
    const registry = registryFixture();
    const verifyPublic = vi.fn().mockRejectedValue(new Error('anonymous pull rejected'));
    await expect(publishManifest(createReleasePlan({ ...input, ref }), digests, {
      ...registry, currentMainSha: async () => sha, verifyPublic,
    })).rejects.toThrow('anonymous pull rejected');
    expect(verifyPublic).toHaveBeenCalledOnce();
    expect(registry.writeIndex.mock.calls.map(([, tag]) => tag)).toEqual([`sha-${sha}`]);
  });
  test.each(['refs/heads/main', 'refs/tags/desktop-v1.3.1'])('exact private-package denial permits channel publication for %s', async ref => {
    const registry = registryFixture();
    const fetch = vi.fn().mockResolvedValue(Response.json({ errors: [{ code: 'DENIED' }] }, { status: 403 }));
    const verifyPublic = vi.fn((plan, images, dependencies) => verifyPublicPull(plan, images, {
      ...dependencies, visibility: plan => packageVisibility(plan, { fetch }),
    }));
    const result = await publishManifest(createReleasePlan({ ...input, ref }), digests, {
      ...registry, currentMainSha: async () => sha, verifyPublic,
    });
    expect(verifyPublic).toHaveBeenCalledOnce();
    expect(await verifyPublic.mock.results[0].value).toBe(false);
    const channel = ref.includes('/tags/') ? 'latest' : 'edge';
    expect(result[channel]).toBe(true);
    expect(registry.writeIndex.mock.calls.at(-1)?.[1]).toBe(channel);
  });
  test.each(['application/vnd.docker.distribution.manifest.v2+json', 'application/vnd.oci.image.manifest.v1+json'])('publishes the accepted local %s image without conversion', async mediaType => {
    const exec = vi.fn().mockResolvedValue({ stdout: '' });
    const readManifest = vi.fn().mockResolvedValue({ digest: digest('b'), manifest: { mediaType } });
    expect(await publishArchitecture(createReleasePlan(input), 'amd64', { exec, readManifest })).toEqual({ arch: 'amd64', digest: digest('b') });
    expect(exec.mock.calls[0]).toEqual(['docker', ['tag', 'mappingout:test', `ghcr.io/zhubby/mappingout:sha-${sha}-amd64`]]);
    expect(exec.mock.calls[1]).toEqual(['docker', ['push', `ghcr.io/zhubby/mappingout:sha-${sha}-amd64`], { maxBuffer: 8 * 1024 * 1024 }]);
    expect(readManifest.mock.calls[0][1]).toBe(`sha-${sha}-amd64`);
  });
  test('refuses an index in place of a runnable architecture manifest', async () => {
    await expect(publishArchitecture(createReleasePlan(input), 'amd64', {
      exec: vi.fn().mockResolvedValue({ stdout: '' }),
      readManifest: vi.fn().mockResolvedValue(found()),
    })).rejects.toThrow(/runnable/);
  });
  test('creates an annotated OCI index referencing unchanged Docker children with exact registry sizes', async () => {
    const registry = registryFixture();
    await publishManifest(createReleasePlan(input), digests, { ...registry, verifyPublic: verifiedPublic, currentMainSha: async () => sha });
    const body = registry.bodies.get(`sha-${sha}`)!;
    expect(JSON.parse(body)).toMatchObject({
      schemaVersion: 2, mediaType: 'application/vnd.oci.image.index.v1+json', manifests: index().manifests,
      annotations: { 'org.opencontainers.image.version': '1.3.1', 'org.opencontainers.image.revision': sha },
    });
    expect(registry.writeIndex.mock.calls[1][2]).toBe(body);
  });
  test.each([0, -1, undefined, 1.2, NaN])('rejects an unproven child manifest byte size %s before writing', async size => {
    const registry = registryFixture();
    registry.readManifest.mockResolvedValueOnce({ ...child('amd64'), size });
    await expect(publishManifest(createReleasePlan(input), digests, { ...registry, verifyPublic: verifiedPublic })).rejects.toThrow(/size/);
    expect(registry.writeIndex).not.toHaveBeenCalled();
  });
  test('rejects a changed child digest before writing', async () => {
    const registry = registryFixture();
    registry.readManifest.mockResolvedValueOnce({ ...child('amd64'), digest: digest('e') });
    await expect(publishManifest(createReleasePlan(input), digests, { ...registry, verifyPublic: verifiedPublic })).rejects.toThrow(/digest/);
    expect(registry.writeIndex).not.toHaveBeenCalled();
  });
  test('rejects a child index before writing a runnable-platform descriptor', async () => {
    const registry = registryFixture();
    registry.readManifest.mockResolvedValueOnce({ ...child('amd64'), manifest: index() });
    await expect(publishManifest(createReleasePlan(input), digests, { ...registry, verifyPublic: verifiedPublic })).rejects.toThrow(/runnable/);
    expect(registry.writeIndex).not.toHaveBeenCalled();
  });
  test('preserves each child media type when Docker and OCI images share an index', async () => {
    const registry = registryFixture();
    registry.readManifest.mockResolvedValueOnce({ ...child('amd64'), manifest: { schemaVersion: 2, mediaType: 'application/vnd.oci.image.manifest.v1+json' } });
    await publishManifest(createReleasePlan(input), digests, { ...registry, verifyPublic: verifiedPublic, currentMainSha: async () => sha });
    expect(JSON.parse(registry.bodies.get(`sha-${sha}`)!).manifests.map(entry => entry.mediaType)).toEqual([
      'application/vnd.oci.image.manifest.v1+json', 'application/vnd.docker.distribution.manifest.v2+json',
    ]);
  });
  test('an inconsistent staging write digest stops public verification and all aliases', async () => {
    const registry = registryFixture();
    registry.writeIndex.mockResolvedValueOnce({ digest: digest('e') });
    const verifyPublic = vi.fn();
    await expect(publishManifest(createReleasePlan(input), digests, { ...registry, verifyPublic })).rejects.toThrow(/write digest/);
    expect(registry.writeIndex.mock.calls.map(([, tag]) => tag)).toEqual([`sha-${sha}`]);
    expect(verifyPublic).not.toHaveBeenCalled();
  });
  test('old formal reruns publish their version while preserving a newer latest', async () => {
    const plan = createReleasePlan({ ...input, ref: 'refs/tags/desktop-v1.3.1' });
    const registry = registryFixture(index('1.4.0'));
    const result = await publishManifest(plan, digests, { ...registry, verifyPublic: verifiedPublic });
    expect(result.latest).toBe(false);
    expect(registry.writeIndex.mock.calls.map(([, tag]) => tag)).toEqual([`sha-${sha}`, '1.3.1']);
  });
  test('first release promotes latest with version metadata on the index', async () => {
    const plan = createReleasePlan({ ...input, ref: 'refs/tags/desktop-v1.3.1' });
    const registry = registryFixture();
    const verifyPublic = vi.fn().mockResolvedValue(true);
    expect((await publishManifest(plan, digests, { ...registry, verifyPublic })).latest).toBe(true);
    expect(registry.writeIndex.mock.calls.map(([, tag]) => tag)).toEqual([`sha-${sha}`, '1.3.1', 'latest']);
    expect(new Set(registry.writeIndex.mock.calls.map(([, , body]) => body)).size).toBe(1);
    expect(registry.readManifest.mock.calls.map(([, tag]) => tag)).toEqual(['latest', digests.amd64, digests.arm64, `sha-${sha}`, '1.3.1', 'latest']);
    expect(verifyPublic.mock.invocationCallOrder[0]).toBeGreaterThan(registry.readManifest.mock.invocationCallOrder[3]);
    expect(verifyPublic.mock.invocationCallOrder[0]).toBeLessThan(registry.writeIndex.mock.invocationCallOrder[1]);
  });
  test('a malformed final version response stops latest promotion after staging validation', async () => {
    const registry = registryFixture();
    const read = registry.readManifest.getMockImplementation()!;
    registry.readManifest.mockImplementation(async (image, tag) => {
      const record = await read(image, tag);
      return tag === '1.3.1' ? { ...record!, manifest: { ...record!.manifest, manifests: [] } } : record;
    });
    await expect(publishManifest(createReleasePlan({ ...input, ref: 'refs/tags/desktop-v1.3.1' }), digests, {
      ...registry, verifyPublic: verifiedPublic,
    })).rejects.toThrow(/architecture/);
    expect(registry.writeIndex.mock.calls.map(([, tag]) => tag)).toEqual([`sha-${sha}`, '1.3.1']);
  });
  test('registry errors stop all publishing', async () => {
    const writeIndex = vi.fn();
    await expect(publishManifest(createReleasePlan({ ...input, ref: 'refs/tags/desktop-v1.3.1' }), digests, {
      writeIndex, readManifest: vi.fn().mockRejectedValue(new Error('registry authentication failed')),
    })).rejects.toThrow(/authentication/);
    expect(writeIndex).not.toHaveBeenCalled();
  });
  test('a malformed existing latest is not treated as an absent manifest', async () => {
    const writeIndex = vi.fn();
    await expect(publishManifest(createReleasePlan({ ...input, ref: 'refs/tags/desktop-v1.3.1' }), digests, {
      writeIndex, readManifest: vi.fn().mockResolvedValue({ digest: digest('d') }),
    })).rejects.toThrow(/version annotation/);
    expect(writeIndex).not.toHaveBeenCalled();
  });
  test('a stale main run preserves edge after verifying its immutable index', async () => {
    const registry = registryFixture();
    const result = await publishManifest(createReleasePlan(input), digests, {
      ...registry, currentMainSha: async () => 'f'.repeat(40),
      verifyPublic: verifiedPublic,
    });
    expect(result.edge).toBe(false);
    expect(registry.writeIndex.mock.calls.map(([, tag]) => tag)).toEqual([`sha-${sha}`]);
  });
  test('the current main run advances edge only after remote architecture verification', async () => {
    const registry = registryFixture();
    expect((await publishManifest(createReleasePlan(input), digests, { ...registry, currentMainSha: async () => sha, verifyPublic: verifiedPublic })).edge).toBe(true);
    expect(registry.writeIndex.mock.calls.map(([, tag]) => tag)).toEqual([`sha-${sha}`, 'edge']);
  });
  test('validation-only runs cannot invoke publishing helpers', async () => {
    await expect(publishManifest(createReleasePlan({ ...input, eventName: 'workflow_dispatch' }), digests, {})).rejects.toThrow(/validation-only/);
  });
});

describe('public pull verification', () => {
  test('public packages verify the immutable manifest with anonymous registry credentials', async () => {
    const readManifest = vi.fn().mockResolvedValue(found());
    const visibility = vi.fn().mockResolvedValue('public');
    const exec = vi.fn().mockResolvedValue({ stdout: '' });
    expect(await verifyPublicPull(createReleasePlan(input), digests, { visibility, readManifest, exec })).toBe(true);
    expect(readManifest).toHaveBeenCalledWith('ghcr.io/zhubby/mappingout', `sha-${sha}`, { anonymous: true });
    expect(exec.mock.calls).toHaveLength(2);
    expect(exec.mock.calls.map(([, args]) => args.slice(2))).toEqual([
      ['pull', '--platform', 'linux/amd64', `ghcr.io/zhubby/mappingout@${digests.amd64}`],
      ['pull', '--platform', 'linux/arm64', `ghcr.io/zhubby/mappingout@${digests.arm64}`],
    ]);
    expect(exec.mock.calls[0][1][0]).toBe('--config');
    expect(exec.mock.calls[0][1][1]).toBe(exec.mock.calls[1][1][1]);
  });
  test('initial private packages skip anonymous pull without failing publication', async () => {
    const readManifest = vi.fn();
    expect(await verifyPublicPull(createReleasePlan(input), digests, { visibility: async () => 'private', readManifest })).toBe(false);
    expect(readManifest).not.toHaveBeenCalled();
  });
  test('visibility errors do not masquerade as private packages', async () => {
    await expect(verifyPublicPull(createReleasePlan(input), digests, { visibility: async () => { throw new Error('GitHub API unavailable'); } })).rejects.toThrow(/unavailable/);
  });
  test('proves public visibility through an anonymous pull-scoped GHCR token', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ token: 'anonymous-pull-token' }));
    expect(await packageVisibility(createReleasePlan(input), { fetch })).toBe('public');
    expect(fetch.mock.calls[0][0].href).toContain('https://ghcr.io/token?');
    expect(fetch.mock.calls[0][0].searchParams.get('scope')).toBe('repository:zhubby/mappingout:pull');
    expect(fetch.mock.calls[0][1].headers).not.toHaveProperty('Authorization');
  });
  test('recognizes explicit anonymous registry denial as private visibility', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ errors: [{ code: 'DENIED', message: 'requested access to the resource is denied' }] }, { status: 403 }));
    expect(await packageVisibility(createReleasePlan(input), { fetch })).toBe('private');
  });
  test('anonymous token transport and rate-limit failures are not private visibility', async () => {
    for (const status of [403, 429, 500]) {
      const fetch = vi.fn().mockResolvedValue(Response.json({ errors: [{ code: 'TOOMANYREQUESTS' }] }, { status }));
      await expect(packageVisibility(createReleasePlan(input), { fetch })).rejects.toThrow(/visibility/);
    }
  });
});
