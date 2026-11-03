# 用 CDP 给游戏截屏：python3 tools/shot.py <url> <out.png> <wait_seconds>
import base64
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request

import websocket

if len(sys.argv) != 4:
    print(f'Usage: {sys.argv[0]} <url> <out.png> <wait_seconds>', file=sys.stderr)
    sys.exit(1)

url, out, wait_s = sys.argv[1], sys.argv[2], float(sys.argv[3])

# 跨平台检测 Chrome/Chromium 路径
def find_chrome():
    # 1. PATH 中查找
    for name in ('google-chrome', 'google-chrome-stable', 'chromium-browser', 'chromium'):
        p = shutil.which(name)
        if p:
            return p
    # 2. 常见安装路径
    candidates = [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
    ]
    if sys.platform == 'win32':
        prog = os.environ.get('PROGRAMFILES', 'C:\\Program Files')
        candidates.extend([
            os.path.join(prog, 'Google', 'Chrome', 'Application', 'chrome.exe'),
            os.path.join(prog + ' (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        ])
    for c in candidates:
        if os.path.isfile(c):
            return c
    raise RuntimeError('Chrome/Chromium not found. Please install or add to PATH.')

chrome_path = find_chrome()
tmp_dir = tempfile.mkdtemp(prefix='zyshot_')

chrome = subprocess.Popen([
    chrome_path,
    '--headless=new', '--remote-debugging-port=9333', '--remote-allow-origins=*',
    '--window-size=460,860', '--hide-scrollbars',
    '--user-data-dir=' + tmp_dir, 'about:blank'
], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

try:
    ws_url = None
    for _ in range(30):
        try:
            tabs = json.load(urllib.request.urlopen('http://localhost:9333/json'))
            pages = [t for t in tabs if t.get('type') == 'page']
            if pages:
                ws_url = pages[0]['webSocketDebuggerUrl']
                break
        except Exception:
            pass
        time.sleep(0.5)
    assert ws_url, 'chrome CDP not ready'

    ws = websocket.create_connection(ws_url, timeout=30)
    mid = [0]

    def send(method, params=None):
        mid[0] += 1
        ws.send(json.dumps({'id': mid[0], 'method': method, 'params': params or {}}))
        while True:
            msg = json.loads(ws.recv())
            if msg.get('id') == mid[0]:
                return msg.get('result', {})

    send('Page.enable')
    send('Runtime.enable')
    send('Page.navigate', {'url': url})

    deadline = time.time() + wait_s
    ws.settimeout(1)
    while time.time() < deadline:
        try:
            msg = json.loads(ws.recv())
        except Exception:
            continue
        m = msg.get('method')
        if m == 'Runtime.exceptionThrown':
            d = msg['params']['exceptionDetails']
            print('EXC:', d.get('text'), d.get('exception', {}).get('description', ''))
        elif m == 'Runtime.consoleAPICalled' and msg['params']['type'] in ('error', 'warning'):
            print('CONSOLE:', [a.get('value') or a.get('description') for a in msg['params']['args']])
    ws.settimeout(30)
    shot = send('Page.captureScreenshot', {'format': 'png'})
    with open(out, 'wb') as f:
        f.write(base64.b64decode(shot['data']))
    print('saved', out)
finally:
    chrome.terminate()
    try:
        chrome.wait(timeout=5)
    except subprocess.TimeoutExpired:
        chrome.kill()
        chrome.wait()
    shutil.rmtree(tmp_dir, ignore_errors=True)
