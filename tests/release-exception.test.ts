/**
 * [INPUT]: 依赖被测领域或构建接口与固定测试资料。
 * [OUTPUT]: 验证 release-exception 的行为与拒绝条件。
 * [POS]: 独立回归测试；不向生产环境写入数据。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import {test, expect} from 'vitest';
import {applyReleaseException} from '../scripts/validate/check-release.mjs';

const finding = '50723 Chinese fields still require review against English Wiki';
const exception = {version: '1.2.0', fingerprint: 'snapshot', reason: 'Explicit release request with disclosed pending review', acceptedFindings: [finding]};
const input = {version: '1.2.0', fingerprint: 'snapshot', findings: [finding], exception};

test('accepts only the recorded findings for the exact version and content', () => {
  expect(applyReleaseException(input)).toEqual({errors: [], acceptedFindings: [finding]});
  for (const changed of [{version: '1.2.1'}, {fingerprint: 'different'}, {exception: null}]) {
    expect(applyReleaseException({...input, ...changed}).errors.length).toBeGreaterThan(0);
  }
});

test('never waives structural failures, even when listed in an exception', () => {
  const failures = ['Stale English baseline: catalog', 'Missing English UI: title', 'Wiki revision changes still require review', 'Missing or changed font: Friz Quadrata Std'];
  for (const failure of failures) {
    expect(applyReleaseException({...input, findings: [failure], exception: {...exception, acceptedFindings: [failure]}}).errors).toContain(failure);
  }
});

test('additional or changed editorial findings require a new explicit exception', () => {
  expect(applyReleaseException({...input, findings: ['50724 Chinese fields still require review against English Wiki']}).errors.length).toBeGreaterThan(0);
  expect(applyReleaseException({...input, findings: [...input.findings, 'Font distribution not approved: Friz Quadrata Std']}).errors.length).toBeGreaterThan(0);
});
