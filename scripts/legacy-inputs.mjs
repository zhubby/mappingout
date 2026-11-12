import fs from 'node:fs/promises';
import path from 'node:path';

// Check before conversion writes anything: a web-only clone must never overwrite its
// bundled catalog with an empty or partial conversion.
export async function requireLegacyInputs(root) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const campaigns = entries.filter(e => e.isDirectory() && /^Campaign\.\d+\./.test(e.name)).map(e => e.name).sort();
  const required = new Map([
    [0, ['Elitelist.txt', 'PetsList.txt']],
    [1, ['Elitelist.txt', 'Regions.txt', 'Zones.txt', 'EliteLocations.txt', 'Greens.txt', 'PetsLocations.txt', 'Professions.txt', 'Collectors.txt', 'CollectorsLocations.txt']],
    [2, ['Elitelist.txt', 'Regions.txt', 'Zones.txt', 'EliteLocations.txt', 'Greens.txt', 'PetsLocations.txt', 'Professions.txt', 'Collectors.txt']],
    [3, ['Elitelist.txt', 'Regions.txt', 'Zones.txt', 'EliteLocations.txt', 'Greens.txt', 'PetsLocations.txt', 'Professions.txt', 'Collectors.txt', 'CollectorsLocations.txt', 'Treasures.txt']],
    [4, ['Elitelist.txt', 'Regions.txt', 'Zones.txt', 'EliteLocations.txt', 'Greens.txt', 'PetsLocations.txt']]
  ]);
  for (const [code, files] of required) {
    const matches = campaigns.filter(dir => Number(dir.match(/^Campaign\.(\d+)/)[1]) === code);
    if (matches.length !== 1) throw new Error(`原始资料不完整：需要且只能有一个 Campaign.${String(code).padStart(2, '0')} 目录。普通部署请使用 npm run build，无需转换资料。`);
    for (const file of files) {
      const source = path.join(root, matches[0], file);
      const stat = await fs.stat(source).catch(() => null);
      if (!stat?.isFile() || !stat.size) throw new Error(`原始资料缺失或为空：${source}`);
    }
  }
  if (campaigns.length !== required.size) throw new Error('存在额外 Campaign 目录，请将副本移出转换输入目录');
  return campaigns;
}
