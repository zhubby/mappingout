/**
 * [INPUT]: 依赖职业翻译与十张本地职业图标。
 * [OUTPUT]: 提供职业名称、颜色、图标与标识索引。
 * [POS]: 地图标记、职业图例与护甲制作共用的职业视觉定义。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import { t } from '../../i18n';
import warrior from '../../assets/professions/warrior.png';
import ranger from '../../assets/professions/ranger.png';
import monk from '../../assets/professions/monk.png';
import necromancer from '../../assets/professions/necromancer.png';
import mesmer from '../../assets/professions/mesmer.png';
import elementalist from '../../assets/professions/elementalist.png';
import assassin from '../../assets/professions/assassin.png';
import ritualist from '../../assets/professions/ritualist.png';
import paragon from '../../assets/professions/paragon.png';
import dervish from '../../assets/professions/dervish.png';

export const professions = [
  { id: 1, get name() { return t("战士"); }, color: '#e9bd65', icon: warrior },
  { id: 2, get name() { return t("游侠"); }, color: '#a5c86a', icon: ranger },
  { id: 3, get name() { return t("僧侣"); }, color: '#73a6ed', icon: monk },
  { id: 4, get name() { return t("死灵"); }, color: '#5bc993', icon: necromancer },
  { id: 5, get name() { return t("幻术"); }, color: '#d998d9', icon: mesmer },
  { id: 6, get name() { return t("元素"); }, color: '#ed8271', icon: elementalist },
  { id: 7, get name() { return t("刺客"); }, color: '#c08be3', icon: assassin },
  { id: 8, get name() { return t("祭祀"); }, color: '#66ccdb', icon: ritualist },
  { id: 9, get name() { return t("圣言者"); }, color: '#f2dc93', icon: paragon },
  { id: 10, get name() { return t("神唤"); }, color: '#a4b4df', icon: dervish },
];

export const professionById = new Map(professions.map(profession => [profession.id, profession]));
