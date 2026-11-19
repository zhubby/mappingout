/**
 * [INPUT]: 依赖地图资料与个人记录契约。
 * [OUTPUT]: 提供可选地图目录、写入与导航接口。
 * [POS]: 应用向功能页注入能力；日历和任务不强制加载地图目录。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import type { Catalog } from './catalog';
import type { Personal } from './personal';
export interface FeatureProps { catalog?: Catalog; personal: Personal; update: (change:(state:Personal)=>Personal)=>Promise<boolean>; params: Record<string,string>; patch: (values:Record<string,string>)=>void; manageCharacters:()=>void; navigateZone:(id:string)=>void; manageResources?:()=>void }
