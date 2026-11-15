"""Maintainer-only offline draft generator; models are never shipped in the app.

Requires ctranslate2, sentencepiece and the Argos en_zh/zh_en 1.9 packages.
Protects game names and every numeric token by translating text between them.
Outputs machine-draft records, which still require individual human review.
Argos OPUS-MT 1.9 models: CC-BY 4.0; Jörg Tiedemann and Santhosh Thottingal,
"OPUS-MT — Building open translation services for the World", EAMT 2020.
"""
import json
import os
import re
import sys
from pathlib import Path
import ctranslate2
import sentencepiece as spm

ROOT = Path(__file__).resolve().parents[2]
os.chdir(ROOT)
pending = json.loads(Path('releases/qa/i18n-pending.json').read_text(encoding='utf-8'))
destination = Path('data/i18n/local-drafts.json')
output = json.loads(destination.read_text(encoding='utf-8')) if destination.exists() else {}
segment_file = Path('releases/qa/i18n-segments.json')
segments = json.loads(segment_file.read_text(encoding='utf-8')) if segment_file.exists() else {}
token_pattern = re.compile(r'(ZXQ\d+ZXQ)')
han = re.compile(r'[\u3400-\u9fff]')

def chunks(text, locale):
    # Keep punctuation and whitespace in place during reconstruction.
    if locale == 'en':
        return re.split(r'(ZXQ\d+ZXQ|[A-Za-z][A-Za-z\s\-\x27/,.:()]*|[\n\r]+|(?<=[.!?。！？])\s+)', text)
    return re.split(r'(ZXQ\d+ZXQ|[\n\r]+|(?<=[.!?。！？])\s+)', text)

def needs_translation(part, locale):
    if not part or token_pattern.fullmatch(part) or not part.strip():
        return False
    if locale == 'en':
        return bool(han.search(part))
    return bool(re.search('[A-Za-z]', part))

def split_long(text):
    # Bound sentencepiece input to avoid silent encoder truncation.
    if len(text) <= 350:
        return [text]
    result=[]
    while text:
        end=min(350,len(text))
        if end<len(text):
            space=text.rfind(' ', 120, end)
            if space>0:end=space+1
        result.append(text[:end]);text=text[end:]
    return result

def save():
    temporary=destination.with_suffix('.tmp')
    temporary.write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    temporary.replace(destination)
    segment_file.write_text(json.dumps(segments,ensure_ascii=False),encoding='utf-8')

for locale, direction in [('zh-CN','en_zh'),('en','zh_en')]:
    tasks=[task for task in pending if task['locale']==locale and task['key'] not in output]
    model=ROOT / f'releases/qa/argos-{direction}/translate-{direction}-1_9'
    tokenizer=spm.SentencePieceProcessor(model_file=str(model/'sentencepiece.model'))
    translator=ctranslate2.Translator(str(model/'model'),device='cpu',compute_type='int8',inter_threads=1,intra_threads=min(6,os.cpu_count() or 2))
    required={}
    for task in tasks:
        for part in chunks(task['input'],locale):
            if needs_translation(part,locale):
                for piece in split_long(part):
                    key=locale+'\0'+piece
                    if key not in segments:required[key]=piece
    items=sorted(required.items(),key=lambda item:len(item[1]))
    print(locale,'unique fragments',len(items),'tasks',len(tasks),flush=True)
    for start in range(0,len(items),32):
        batch=items[start:start+32]
        encoded=[tokenizer.encode(text,out_type=str) for _,text in batch]
        translated=translator.translate_batch(encoded,beam_size=1,max_input_length=512,max_decoding_length=min(640,max(map(len,encoded))*3+32),no_repeat_ngram_size=3,repetition_penalty=1.1)
        for (key,text),result in zip(batch,translated):
            value=''.join(result.hypotheses[0]).replace('\u2581',' ').strip()
            # Retain token-boundary whitespace for English reconstruction.
            if text.startswith(' ') and not value.startswith(' '):value=' '+value
            if text.endswith(' ') and not value.endswith(' '):value+=' '
            segments[key]=value
        if start%320==0:
            print(locale,'fragments',start+len(batch),'/',len(items),flush=True)
        save()
    for task in tasks:
        translated=[]
        for part in chunks(task['input'],locale):
            if needs_translation(part,locale):
                translated.extend(segments[locale+'\0'+piece] for piece in split_long(part))
            else:translated.append(part)
        value=''.join(translated)
        value=token_pattern.sub(lambda match:task['tokens'][int(match[0][3:-3])],value)
        output[task['key']]={'text':value,'method':'machine-draft','provider':'Argos 1.9 offline, protected facts'}
    save()
    del translator
print('Local drafts complete',len(output),flush=True)
