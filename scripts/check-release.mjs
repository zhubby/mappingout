/**
 * [INPUT]: 依赖版本、四套资料的发布输入与既有发布例外。
 * [OUTPUT]: 计算发布指纹并执行审校、许可及完整性门禁。
 * [POS]: 正式发布校验；资料变更使旧例外失效。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {validateI18n} from './validate-i18n.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const releaseInputs = [
  ...['catalog', 'armor', 'calendar', 'quests', 'skills'].flatMap(dataset => [
    `public/data/${dataset}.json`, `data/i18n/baseline/${dataset}.json`,
    ...['en', 'zh-CN'].map(locale => `public/data/i18n/${locale}/${dataset}.json`),
  ]),
  'data/i18n/review.json', 'data/i18n/wiki-current-revisions.json',
  'public/fonts/manifest.json', 'src/i18n/en.json', 'src/i18n/zh-CN.json',
];
export function releaseFingerprint(directory = root) {
  const hash = createHash('sha256');
  for (const file of releaseInputs) hash.update(file + '\0').update(JSON.stringify(JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8'))));
  return hash.digest('hex');
}

// Exceptions cover only the recorded editorial/licensing findings. Integrity,
// missing resources, stale Wiki revisions and source bindings always block.
export function applyReleaseException({version, findings, fingerprint, exception}) {
  if (!findings.length) return {errors: [], acceptedFindings: []};
  if (!exception || exception.version !== version || exception.fingerprint !== fingerprint || !exception.reason?.trim()) {
    return {errors: [...findings, 'Missing or stale version-specific release exception'], acceptedFindings: []};
  }
  const eligible = /^(?:\d+ (?:Chinese fields still require review against English Wiki|English fields still require Wiki source verification|translated fields require numeric\/token review|Chinese fields still contain untranslated Latin words)|Font distribution not approved: Friz Quadrata Std)$/;
  const actual = [...new Set(findings)].sort();
  const accepted = [...new Set(exception.acceptedFindings)].sort();
  if (actual.some(finding => !eligible.test(finding)) || JSON.stringify(actual) !== JSON.stringify(accepted)) {
    return {errors: [...findings, 'Release exception does not match the current eligible findings'], acceptedFindings: []};
  }
  return {errors: [], acceptedFindings: actual};
}

export function checkRelease(directory = root) {
  const validation = validateI18n(directory, true);
  const readJson = file => JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8'));
  const version = readJson('package.json').version;
  if (version !== readJson('src-tauri/tauri.conf.json').version) validation.errors.push('Desktop and package versions differ');
  const exceptionPath = path.join(directory, 'data/i18n/release-exception.json');
  const exception = fs.existsSync(exceptionPath) ? readJson('data/i18n/release-exception.json') : null;
  return {...validation, ...applyReleaseException({version, findings: validation.errors, fingerprint: releaseFingerprint(directory), exception})};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = checkRelease();
  console.log(JSON.stringify(result, null, 2));
  if (result.errors.length) process.exitCode = 1;
}
