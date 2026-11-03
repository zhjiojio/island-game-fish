"""Read-only full delivery audit; fail on missing, changed or undecodable media."""
import concurrent.futures
import hashlib
import json
import pathlib
import subprocess
import sys

B = pathlib.Path(__file__).resolve().parents[1]
G = B.parents[1]
WF = G.parents[2] / 'game-aigc-workflow'
sys.path.insert(0, str(WF / 'skills/agw-story2game/scripts'))
from validate import validate_data, compile_sound_contract
TASKS = {t['partId']: t for name in ('pilot-tasks.json', 'full-tasks.json') for t in json.loads((B / 'scripts' / name).read_text())}

def sha(path):
    return hashlib.sha256(pathlib.Path(path).read_bytes()).hexdigest()

def check_media(item):
    p = pathlib.Path(item['path'])
    assert sha(p) == item['sha256'], item['videoId']
    assert p.stat().st_size == item['bytes']
    assert item['audio'] == 'native_kling_only'
    for pid, expected in zip(item['parts'], item['partHashes']):
        assert sha(TASKS[pid]['output']) == expected, (item['videoId'], pid)
    result = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(p), '-f', 'null', '-'], capture_output=True, text=True)
    assert result.returncode == 0 and not result.stderr.strip(), (item['videoId'], result.stderr)
    probe = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(p)]))
    kinds = {s['codec_type'] for s in probe['streams']}
    assert {'video', 'audio'} <= kinds
    return {'videoId': item['videoId'], 'sha256': item['sha256'], 'decode': 'passed', 'audioStream': True}

source4 = G / 'output/逃婚后我花千万雇了工地糙汉.v4.json'
source5 = G / 'output/逃婚后我花千万雇了工地糙汉.v5.json'
a, z = [json.loads(p.read_text()) for p in (source4, source5)]
assert sha(source4) == '77cee12ed8c5f8a99e49c6ec00ef31136fa64c03eb09995732b91220ca491ec7'
assert set(a['nodes']) == set(z['nodes'])
for key, node in a['nodes'].items():
    for field in ('type', 'next', 'nextNodeId', 'options', 'unlock', 'stateChanges', 'conditions', 'onEnter', 'onExit'):
        assert node.get(field) == z['nodes'][key].get(field), (key, field)
report = validate_data(z)
assert report['ok'], report['errors']
contracts = [compile_sound_contract(z, v['id']) for n in z['nodes'].values() for v in n.get('videos', [])]
items = json.loads((B / 'review/full-delivery.json').read_text())
assert len(items) == len(contracts) == 69
assert {i['videoId'] for i in items} == {c['videoId'] for c in contracts}
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
    results = list(pool.map(check_media, items))
audit = {'status': 'passed', 'videos': len(results), 'mainStory': sum(not r['videoId'].startswith('ending_') for r in results), 'endings': sum(r['videoId'].startswith('ending_') for r in results), 'source4Unchanged': True, 'graphAndOptionsUnchanged': True, 'source5Sha256': sha(source5), 'scriptErrors': len(report['errors']), 'scriptWarnings': len(report['warnings']), 'media': results}
(B / 'review/final-verification.json').write_text(json.dumps(audit, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({k: v for k, v in audit.items() if k != 'media'}, ensure_ascii=False))
