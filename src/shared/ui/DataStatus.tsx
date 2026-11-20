/**
 * [INPUT]: 依赖界面翻译、聚合资料进度与错误文案。
 * [OUTPUT]: 展示下载量、三步阶段、动态进度条和失败重试。
 * [POS]: 地图与功能页共用的资料等待界面；不执行下载。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import { Check, CircleAlert, Compass, RotateCcw } from 'lucide-react';
import { displayMessage, t } from '../../i18n';
import type { ContentProgress } from '../../i18n/content';
import './data-status.css';

interface Props { error?:string; retry?:()=>void; progress?:ContentProgress }

function resourceLabel(resource?:string):string {
  switch(resource?.split('/').at(-1)?.replace(/\.json$/,'')){
    case 'catalog':return t('世界地图');
    case 'skills':return t('技能资料');
    case 'quests':return t('任务攻略');
    case 'armor':return t('护甲制作');
    case 'calendar':return t('活动日历');
    default:return t('探索资料');
  }
}

function bytesLabel(bytes:number):string {
  if(bytes<1024)return `${bytes} B`;
  if(bytes<1024*1024)return `${(bytes/1024).toFixed(1)} KB`;
  return `${(bytes/(1024*1024)).toFixed(1)} MB`;
}

export function DataStatus({error,retry,progress}:Props) {
  const phase=progress?.phase??'fetching';
  const stages=[t('下载资料'),t('校验内容'),t('整理页面')];
  const stage=phase==='projecting'?2:phase==='verifying'?1:0;
  const label=!progress?t('正在加载资料…'):phase==='fetching'?t('正在下载资料'):phase==='verifying'?t('正在校验资料'):t('正在整理页面');
  const loaded=progress?.loadedBytes??0;
  const total=progress?.totalBytes;
  const percentage=stage===0&&total?Math.min(100,loaded/total*100):undefined;

  return <section className={`feature-status data-status${error?' data-status--error':''}`} aria-label={t('资料准备')}>
    <div className="data-status__content">
      <div className="data-status__emblem" aria-hidden="true">
        {error?<CircleAlert size={32} strokeWidth={1.2}/>:<><span className="data-status__orbit"/><Compass size={36} strokeWidth={1.1}/></>}
      </div>
      <div className="data-status__heading" role={error?'alert':'status'} aria-atomic="true">
        <h2>{error?t('资料加载失败'):t('正在准备探索资料')}</h2>
        <p>{error?displayMessage(error):resourceLabel(progress?.resource)}</p>
        {!error&&<span className="data-status__sr">{label}</span>}
      </div>
      {error?retry&&<button className="primary data-status__retry" onClick={retry}><RotateCcw size={14}/>{t('重新加载')}</button>:<>
        <div className="data-status__download">
          <div className="data-status__caption"><span>{label}</span><span className="data-status__value">{percentage!==undefined?`${Math.floor(percentage)}%`:`0${stage+1} / 03`}</span></div>
          <div className={`data-status__track${percentage===undefined?' data-status__track--flow':''}`}>
            <progress aria-label={stage===0?t('资料下载进度'):label} value={percentage} max={100}/>
            {percentage===undefined&&<span aria-hidden="true"/>}
          </div>
          <div className="data-status__detail">
            <span>{stage===0&&loaded>0?`${bytesLabel(loaded)}${total?` / ${bytesLabel(total)}`:''}`:t('资料就绪后会自动开启')}</span>
            {stage===0&&!!progress?.resourceCount&&<span>{t('已完成 {{v0}} / {{v1}} 份资料',{v0:progress.completedResources??0,v1:progress.resourceCount})}</span>}
          </div>
        </div>
        <ol className="data-status__stages" aria-label={t('资料准备阶段')}>
          {stages.map((name,index)=><li key={index} className={index<stage?'is-complete':index===stage?'is-current':''} aria-current={index===stage?'step':undefined}>
            <span className="data-status__step" aria-hidden="true">{index<stage?<Check size={12}/>:index+1}</span><span>{name}</span>
          </li>)}
        </ol>
      </>}
    </div>
  </section>;
}
