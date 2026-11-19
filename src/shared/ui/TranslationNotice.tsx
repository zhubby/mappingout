/**
 * [INPUT]: 依赖资料投影中的译名来源和英文核对状态。
 * [OUTPUT]: 展示名称证据、正文待审及英文来源缺口。
 * [POS]: 五套资料共用的翻译说明；不将术语匹配当作全文复核。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import {t,useLocale} from '../../i18n';
import {translationOf} from '../../i18n/content';
export default function TranslationNotice({value}:{value:object}){
 const locale=useLocale(),info=translationOf(value);
 if(locale!=='zh-TW'||!info)return null;
 return <div className="translation-notice muted">
  {info.name&&<p>{info.name.kind==='wiki-term'?t('译名有中文 Wiki 佐证；正文不代表已获中文来源核对。'):t('译名暂无中文 Wiki 佐证，采用英文重译或编辑用词。')}</p>}
  {info.name?.references.map(reference=><a key={`${reference.site}/${reference.revid}`} href={reference.revisionUrl} target="_blank" rel="noreferrer">{reference.site==='fandom'?'Fandom':'灰機 Wiki'} · {reference.title} · {reference.revid} </a>)}
  <p>{t('繁体正文含机器辅助译文，尚待逐条校订；请对照英文原文。')}</p>
  {!info.englishVerified&&<p>{t('部分英文内容仍待固定 Wiki 来源核实。')}</p>}
 </div>;
}
