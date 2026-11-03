#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""BE 死因鉴定 说书人 mp3 批量生成 · Minimax Humorous_Elder
用法: python3 scripts/gen_be_audio.py [--only roast_xxx] [--force]
输出: work/be_audio/<key>.mp3
凭证: lihui26 本机默认（与 bgm-music-gen skill 同）
"""
import os, sys, json, time, urllib.request

API_KEY = os.environ.get("MINIMAX_API_KEY", "sk-cp-f-rxe3hcdNB4I_kFui-rri0daIlraMmK6gtw2Yzi8LQBUm1X_AVdClkrYHfCMpq0H81RV0nFOclODyID89PKc6ks_62yjS41ZzYI4vV1U6GjovEqHcNKwdE")
GROUP_ID = os.environ.get("MINIMAX_GROUP_ID", "2038909098828767900")

VOICE = "Chinese (Mandarin)_Humorous_Elder"

TEXTS = {
    # f5_fix 冒雨爬房顶坠亡
    "roast_roof_fall": "你踩着湿泥往房顶爬，雷一闪，脚下一滑——七尺高的土坯房，落地那声闷响，婉儿在院里听得清清楚楚。",
    # f5_fix2 天亮还是爬房顶
    "roast_roof_fall2": "天亮了你还是不信邪，踩着湿瓦往上爬。一脚踏空，七尺高的房檐——这回婉儿连尖叫都没来得及。",
    # f5_biz 种玉米大旱
    "roast_drought": "三个月没下一滴雨。三百亩玉米全烤成了柴火，村里人蹲在地头看着你，谁也没说话。",
    # f5_biz 拒绝带全村
    "roast_alone": "她一句话没说，第二天早上人就不见了。桌上留着一根木簪。七十里山路，她走了一天一夜。",
    # f5_rub 冷淡打发·腰间盘突出·成光棍
    "roast_rub_alone": "你嫌麻烦，没给她揉那下腰。日子一天天过，她的腰再没直起来过——落下了病根。开春她娘家来人把她接走了，你守着这座新屋，成了十里八乡有名的老光棍。",
    # f3 把婉儿护在身后·空手迎五人·被打死
    "roast_beaten": "你把嫂子往身后一拉，自己两手空空迎上五个壮汉。护人的心是真的，打不过也是真的。婉儿是踩着你的血跑出院门喊人的——喊回来的时候，只剩一口气了。",
}

OUT_DIR = "work/be_audio"
os.makedirs(OUT_DIR, exist_ok=True)

only = None
force = "--force" in sys.argv
if "--only" in sys.argv:
    only = sys.argv[sys.argv.index("--only") + 1]

def synth(key, text):
    out = os.path.join(OUT_DIR, key + ".mp3")
    if os.path.exists(out) and os.path.getsize(out) > 1000 and not force:
        print("SKIP (exists):", key); return
    url = "https://api.minimax.chat/v1/t2a_v2?GroupId=" + GROUP_ID
    body = {
        "model": "speech-02-hd",
        "text": text,
        "stream": False,
        "voice_setting": {"voice_id": VOICE, "speed": 1.10, "vol": 1.0, "pitch": 0, "emotion": "happy"},
        "audio_setting": {"sample_rate": 32000, "bitrate": 128000, "format": "mp3", "channel": 1},
    }
    req = urllib.request.Request(url, data=json.dumps(body).encode("utf-8"),
        headers={"Authorization": "Bearer " + API_KEY, "Content-Type": "application/json"})
    r = urllib.request.urlopen(req, timeout=60)
    d = json.loads(r.read().decode("utf-8"))
    audio_hex = (d.get("data") or {}).get("audio")
    if not audio_hex:
        print("❌ FAIL:", key, json.dumps(d.get("base_resp", d), ensure_ascii=False)); return
    with open(out, "wb") as f:
        f.write(bytes.fromhex(audio_hex))
    print("✅ OK:", key, "->", out, os.path.getsize(out), "bytes")

for k, t in TEXTS.items():
    if only and k != only:
        continue
    synth(k, t)
    time.sleep(0.4)
print("DONE")
