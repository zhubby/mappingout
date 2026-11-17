/**
 * [INPUT]: 依赖护甲配方、个人计划和角色契约。
 * [OUTPUT]: 提供材料合计与制作计划变更。
 * [POS]: 护甲领域规则；不访问存储或界面。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import { t } from '../../i18n';
import type { ArmorOffer, ArmorPiece, ArmorPlan } from '../../shared/contracts/armor';
import type { Personal } from '../../shared/contracts/personal';
export function armorTotal(pieces: ArmorPiece[]) {
  const materials = new Map<string,number>();
  for (const piece of pieces) for (const amount of piece.materials) materials.set(amount.materialId,(materials.get(amount.materialId)||0)+amount.quantity);
  return { gold:pieces.reduce((sum,p)=>sum+p.gold,0), materials:[...materials].sort(([a],[b])=>a.localeCompare(b)).map(([materialId,quantity])=>({materialId,quantity})) };
}
export function planPieces(plan: ArmorPlan, offer: ArmorOffer, remaining=false) { return offer.pieces.filter(p=>plan.pieceIds.includes(p.id)&&(!remaining||!plan.completedPieceIds.includes(p.id))); }
export function saveArmorPlan(state: Personal, plan: ArmorPlan): Personal {
  if (!state.characters.some(c=>c.id===plan.characterId)) throw Error(t("此角色已在其他页面删除，请重新选择角色。"));
  return {...state,armorPlans:[...state.armorPlans.filter(p=>p.id!==plan.id),plan]};
}
export function setArmorPiece(state: Personal, planId: string, characterId: string, pieceId: string, done: boolean): Personal {
  const plan=state.armorPlans.find(p=>p.id===planId&&p.characterId===characterId);
  if (!plan || !plan.pieceIds.includes(pieceId)) throw Error(t("制作计划已变更，请刷新后重试。"));
  return saveArmorPlan(state,{...plan,completedPieceIds:[...plan.completedPieceIds.filter(id=>id!==pieceId),...(done?[pieceId]:[])]});
}
