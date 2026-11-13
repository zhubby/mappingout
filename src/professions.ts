import warrior from './assets/professions/warrior.png';
import ranger from './assets/professions/ranger.png';
import monk from './assets/professions/monk.png';
import necromancer from './assets/professions/necromancer.png';
import mesmer from './assets/professions/mesmer.png';
import elementalist from './assets/professions/elementalist.png';
import assassin from './assets/professions/assassin.png';
import ritualist from './assets/professions/ritualist.png';
import paragon from './assets/professions/paragon.png';
import dervish from './assets/professions/dervish.png';

export const professions = [
  { id: 1, name: '战士', color: '#e9bd65', icon: warrior },
  { id: 2, name: '游侠', color: '#a5c86a', icon: ranger },
  { id: 3, name: '僧侣', color: '#73a6ed', icon: monk },
  { id: 4, name: '死灵', color: '#5bc993', icon: necromancer },
  { id: 5, name: '幻术', color: '#d998d9', icon: mesmer },
  { id: 6, name: '元素', color: '#ed8271', icon: elementalist },
  { id: 7, name: '刺客', color: '#c08be3', icon: assassin },
  { id: 8, name: '祭祀', color: '#66ccdb', icon: ritualist },
  { id: 9, name: '圣言者', color: '#f2dc93', icon: paragon },
  { id: 10, name: '神唤', color: '#a4b4df', icon: dervish },
];

export const professionById = new Map(professions.map(profession => [profession.id, profession]));
