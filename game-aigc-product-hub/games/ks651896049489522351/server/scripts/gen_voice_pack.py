#!/usr/bin/env python3
# 斗地主语音包批量生成（MiniMax t2a_v2）
# 用法：
#   python3 gen_voice_pack.py --dir tiezi   --voice male-qn-badao --name 铁子语音包
#   python3 gen_voice_pack.py --dir tianmei --voice female-tianmei --name 甜妹语音包
# 台词来自御姐包 manifest.json（76 条，结构与命名完全一致，可直接互替换 CDN 目录）。
# 可断点续跑：已存在且非空的 mp3 会跳过。
import json, os, sys, time, argparse, urllib.request

# 凭证走环境变量，不入库（首次使用前 export，可写入 ~/.zshrc）：
#   export MINIMAX_API_KEY=sk-cp-xxx
#   export MINIMAX_GROUP_ID=2038909098828767900
API_KEY = os.environ.get("MINIMAX_API_KEY", "")
GROUP_ID = os.environ.get("MINIMAX_GROUP_ID", "")
if not API_KEY or not GROUP_ID:
    sys.exit("缺少 MINIMAX_API_KEY / MINIMAX_GROUP_ID 环境变量（勿硬编码入库）")
BASE = os.path.join(os.path.dirname(__file__), "..", "package", "asset", "audio")
YUJIE_MANIFEST = os.path.join(BASE, "effect", "room", "yujie", "manifest.json")

def tts_one(text, voice_id, out, speed, emotion, model="speech-02-turbo"):
    url = f"https://api.minimax.chat/v1/t2a_v2?GroupId={GROUP_ID}"
    payload = {
        "model": model,
        "text": text,
        "voice_setting": {"voice_id": voice_id, "speed": speed, "vol": 1.0, "pitch": 0, "emotion": emotion},
        "audio_setting": {"sample_rate": 32000, "bitrate": 128000, "format": "mp3", "channel": 1},
    }
    req = urllib.request.Request(url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"},
        method="POST")
    with urllib.request.urlopen(req, timeout=90) as r:
        d = json.loads(r.read())
    br = d.get("base_resp", {})
    if br.get("status_code", 0) != 0:
        raise RuntimeError(f"api_error: {br}")
    audio = bytes.fromhex(d["data"]["audio"])
    if len(audio) < 500:
        raise RuntimeError(f"audio_too_short: {len(audio)}B")
    open(out, "wb").write(audio)
    return len(audio)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True, help="包目录名（昵称），如 tiezi / tianmei")
    ap.add_argument("--voice", required=True, help="MiniMax 音色 ID，如 male-qn-badao")
    ap.add_argument("--name", required=True, help="语音包显示名")
    ap.add_argument("--speed", type=float, default=1.3)
    ap.add_argument("--emotion", default="happy")
    args = ap.parse_args()

    src = json.load(open(YUJIE_MANIFEST))
    items = src["items"]
    out_dir = os.path.join(BASE, "voice-packs", args.dir)
    for it in items:
        os.makedirs(os.path.join(out_dir, it["group"]), exist_ok=True)

    ok, skip, fail = 0, 0, []
    for i, it in enumerate(items):
        out = os.path.join(out_dir, it["group"], it["file"])
        if os.path.exists(out) and os.path.getsize(out) > 500:
            skip += 1
            continue
        text = it["text"]
        # 单条重试 3 次
        done = False
        for attempt in range(3):
            try:
                n = tts_one(text, args.voice, out, it.get("speed", args.speed),
                            it.get("emotion", args.emotion))
                ok += 1
                print(f"[{i+1}/{len(items)}] ✅ {it['group']}/{it['file']} {n}B")
                done = True
                break
            except Exception as e:
                print(f"[{i+1}/{len(items)}] ⚠️ retry{attempt+1} {it['file']}: {e}")
                time.sleep(2 + attempt * 3)
        if not done:
            fail.append(f"{it['group']}/{it['file']}")
        time.sleep(0.3)  # 温和限速

    manifest = {
        "voice": args.voice,
        "name": args.name,
        "speed": args.speed,
        "emotion": args.emotion,
        "model": "speech-02-turbo",
        "total": len(items),
        "icon": "icon.png",
        "items": items,
    }
    json.dump(manifest, open(os.path.join(out_dir, "manifest.json"), "w"), ensure_ascii=False, indent=2)
    print(f"== {args.name}({args.dir}) ok={ok} skip={skip} fail={len(fail)} ==")
    if fail:
        print("FAILED:", fail)
        sys.exit(1)

if __name__ == "__main__":
    main()
