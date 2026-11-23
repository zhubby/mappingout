/**
 * [INPUT]: 依赖动态说明组件、真实 Cleave 资料与服务端 React 呈现。
 * [OUTPUT]: 验证同一效果的多次出现各自保留符号，不重复负号。
 * [POS]: 技能详情的可见数值回归；不改变成长数值。
 * [PROTOCOL]: Update this header on change, then check AGENTS.md
 */
import fs from 'node:fs';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import {SkillDescription} from '../src/features/skills/skill-ui';
import type {SkillCatalog,SkillVariant} from '../src/shared/contracts/skills';

it('preserves the sign of each repeated Cleave growth occurrence',()=>{
 const data=JSON.parse(fs.readFileSync('public/data/skills.json','utf8')) as SkillCatalog;
 const variant=data.skills.find(skill=>skill.id==='skill:gww:4050')!.variants[0];
 const html=renderToStaticMarkup(createElement(SkillDescription,{variant,levels:{attribute:12,titles:{}}}));
 const values=[...html.matchAll(/<strong[^>]*>([^<]*)<\/strong>/g)].map(match=>match[1]);
 const parts=variant.descriptionParts.filter(part=>part.effectId==='growth:0:var3');
 expect(parts.map(part=>part.raw)).toEqual(['+10…34…40','10…34…40']);
 expect(values).toEqual(['+34','2','34']);
});

it('renders an already negative growth value with one minus sign',()=>{
 const variant={descriptionTemplate:'[[MO:reduction]]%',descriptionParts:[{effectId:'reduction',raw:'-5…-10…-15'}],effects:[{id:'reduction',axisKind:'fixed',values:{fixed:-10},label:'Reduction'}]} as SkillVariant;
 const html=renderToStaticMarkup(createElement(SkillDescription,{variant,levels:{attribute:12,titles:{}}}));
 expect(html).toContain('>-10</strong>%');
 expect(html).not.toContain('--10');
});
