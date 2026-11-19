# [INPUT]: 依赖英文待译片段、受保护词元和 Argos en_zh 1.9 模型。
# [OUTPUT]: 保存繁体重新翻译初稿和维护期模型来源。
# [POS]: 在线服务限流时的本地翻译入口；不授予人工复核。
# [PROTOCOL]: Update this header on change, then check AGENTS.md
"""Use a maintainer venv with ctranslate2, sentencepiece and OpenCC.

Input is exported by translate-traditional.mjs --export-local FILE.
Model: Argos OPUS-MT en_zh 1.9, CC-BY 4.0, Tiedemann and Thottingal.
No model or Python dependency enters application resources.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path
import ctranslate2
import sentencepiece as spm
from opencc import OpenCC

parser = argparse.ArgumentParser()
parser.add_argument('--input', required=True)
parser.add_argument('--model', required=True)
args = parser.parse_args()
pending = json.loads(Path(args.input).read_text())
cache_file = Path(pending['cacheFile'])
cache = json.loads(cache_file.read_text())
model = Path(args.model)
tokenizer = spm.SentencePieceProcessor(model_file=str(model / 'sentencepiece.model'))
translator = ctranslate2.Translator(str(model / 'model'), device='cpu', compute_type='int8', inter_threads=1, intra_threads=6)
traditional = OpenCC('s2twp')
marker = re.compile(r'(MOPROTECT\d+END)')

def fragments(text):
    result = []
    for part in marker.split(text):
        if marker.fullmatch(part) or not part.strip():
            result.append(part)
            continue
        # Bound encoder input without discarding words or protected tokens.
        while len(part) > 300:
            end = part.rfind(' ', 100, 300)
            end = end + 1 if end >= 100 else 300
            result.append(part[:end])
            part = part[end:]
        result.append(part)
    return result

pieces = {piece for item in pending['items'] for piece in fragments(item['input'])
          if re.search('[A-Za-z]', piece) and not marker.fullmatch(piece)}
segments = {}
items = sorted(pieces, key=len)
print(f'Local model: {len(items)} English spans, {len(pending["items"])} drafts', flush=True)
for start in range(0, len(items), 32):
    batch = items[start:start + 32]
    encoded = [tokenizer.encode(text, out_type=str) for text in batch]
    results = translator.translate_batch(encoded, beam_size=2, max_input_length=512,
        max_decoding_length=640, no_repeat_ngram_size=3)
    for source, result in zip(batch, results):
        text = ''.join(result.hypotheses[0]).replace('\u2581', ' ').strip()
        segments[source] = traditional.convert(text) if text else source
    if start % 640 == 0:
        print(f'Local spans {min(start + 32, len(items))}/{len(items)}', flush=True)

for item in pending['items']:
    output = []
    for piece in fragments(item['input']):
        token = marker.fullmatch(piece)
        output.append(item['tokens'][int(piece[9:-3])] if token else segments.get(piece, piece))
    text = traditional.convert(' '.join(output)).strip()
    if re.search(r'<unk>|\u2581|MOPROTECT|(?:PROT)?ECT\d+(?:END)?', text):
        raise ValueError('Local draft contains unresolved model tokens; use online retranslation.')
    key = hashlib.sha256(item['source'].encode()).hexdigest()
    cache['fields'][key] = {'source': item['source'], 'text': text,
        'kind': 'english-retranslation', 'provider': 'Argos OPUS-MT en_zh 1.9 + OpenCC; protected spans; pending review'}

cache['engine'] = 'English to Traditional Chinese drafts: Google Translate and Argos OPUS-MT en_zh 1.9 + OpenCC; pinned terms and numbers protected; not human reviewed'
cache['localModel'] = {'url': 'https://argos-net.com/v1/translate-en_zh-1_9.argosmodel',
    'license': 'CC-BY 4.0', 'authors': 'Jörg Tiedemann and Santhosh Thottingal',
    'modelSha256': hashlib.sha256((model / 'model' / 'model.bin').read_bytes()).hexdigest()}
temporary = cache_file.with_suffix('.tmp')
temporary.write_text(json.dumps(cache, ensure_ascii=False, separators=(',', ':')) + '\n')
temporary.replace(cache_file)
print(f'Local Traditional drafts saved: {len(cache["fields"])}', flush=True)
