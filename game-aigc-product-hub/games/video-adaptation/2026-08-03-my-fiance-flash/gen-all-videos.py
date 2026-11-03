#!/usr/bin/env python3
"""批量生成苏小雨 F2-F30 kling-3-pro 视频 + mux 音频 + 复制到 minigame"""
import json, os, subprocess, sys, shutil
from pathlib import Path

RUN_DIR = Path.home() / "work/minigame/game-aigc-product-hub/games/video-adaptation/2026-08-03-my-fiance-flash"
WF      = Path.home() / "work/minigame/game-aigc-workflow"
REF     = RUN_DIR / "assets/reference/su-xiaoyu-master.png"
CACHE   = RUN_DIR / ".cache"
OUT     = RUN_DIR / "assets/video"
AUDIO   = RUN_DIR / "assets/audio"
MG_VID  = RUN_DIR / "minigame/assets/video"
for d in (CACHE, OUT, MG_VID):
    d.mkdir(parents=True, exist_ok=True)

os.environ["KWALI_CREDENTIALS_FILE"] = str(Path.home() / ".config/kwali-video-gen/credentials.json")

# 每帧: (name, line, scene_desc)
FRAMES = {
    "f2":  ("我等了一个多小时，你手是不是很冷？",  "白毛衣温柔女孩关切地看着镜头，指尖冰凉递饭盒，室内暖光"),
    "f3":  ("味道有变吗？我记得你说过要甜一点、姜少一点。", "木餐桌前温柔女孩期待地看镜头，暖黄灯光下"),
    "f4":  ("你先去楼上休息吧，我打扫过了。",         "袖口卷起洗碗的温柔女孩抬头笑着说话，厨房场景"),
    "f5":  ("这个别听了，扔了扔了……",              "阁楼昏黄灯光，温柔女孩握着旧磁带脸红慌乱地说话"),
    "f6":  ("你不要偷看哦，我要换成家里的睡衣了。", "门缝里温柔女孩害羞地探头，脸颊微红说话"),
    "f7":  ("我今天学的新菜——",                    "厨房温柔女孩端着盘子期待地看镜头笑说话"),
    "f8":  ("你先吃吧，我不饿。",                   "眼眶微红的温柔女孩低头说话，餐桌旁"),
    "f9":  ("是，我未婚夫。",                       "菜市场温柔女孩害羞地小声说，眼神躲闪"),
    "f10": ("你走的那 13 年，我每天都想你回来敲我家门。", "夜晚阳台竹椅，温柔女孩捧着温牛奶轻声诉说，眼角有泪"),
    "f11": ("当时我妈问我为什么，我说要在这里等他回来。", "温柔女孩坐桌前望着志愿表苦笑说话"),
    "f12": ("你别看我，头发还没吹干。",             "沙发上湿发抱枕的温柔女孩脸红说话，粉色睡衣"),
    "f13": ("我心跳好快，你别听。",                 "沙发上温柔女孩低声耳语，眼神羞涩"),
    "f14": ("别理他，我们回家。",                   "幼儿园门口温柔女孩拉着镜头说话，背景有人送花"),
    "f15": ("别理他，我们回家。",                   "温柔女孩眼含泪水坚定地对镜头说话，晚风吹起头发"),
    "f16": ("我没事，你不用管。",                   "发烧微弱的温柔女孩躺床上虚弱地说话，被子拉到下巴"),
    "f17": ("原来叔叔真的知道。",                   "温柔女孩翻着旧信惊讶看镜头说话，阁楼阳光下"),
    "f18": ("帮我拿一下毛巾，好冷。",               "浴袍湿发的温柔女孩发抖地伸手说话，浴室门口"),
    "f19": ("你走得慢点，伞不够大。",               "雨夜温柔女孩撑伞小声说，头发被雨打湿"),
    "f20": ("你想说什么？",                        "樱花树下温柔女孩笑着看镜头，粉色花瓣落肩"),
    "f21": ("这个是备用的，你在飞机上吃。",         "机场大厅温柔女孩递保温饭盒说话，眼中不舍"),
    "f22": ("欢迎回家小弟弟。",                     "机场出口温柔女孩举 A4 纸红着脸说话，笑意盈盈"),
    "f23": ("你干嘛。",                            "车内红灯温柔女孩转头看镜头脸颊发红说话"),
    "f24": ("什么时候把婚事办了？",                 "饭桌旁中年温柔妈妈笑着敬酒说话"),
    "f25": ("哎哎导演你演过头了。",                 "温柔女孩笑着假装配合演戏说话，客厅"),
    "f26": ("我该怎么办。",                        "沙发上温柔女孩哭着抬头说话，眼泪含在眼眶"),
    "f27": ("你还要我吗？",                        "温柔女孩哽咽看镜头询问，眼神脆弱"),
    "f28": ("好看吗？我妈说这条最像我。",           "婚纱店温柔女孩穿白色婚纱转圈说话"),
    "f29": ("明天我就是你的新娘啦。",               "阳台夜色温柔女孩穿白睡衣回眸微笑说话"),
    "f30": ("我们的故事，走到这里了。",             "夕阳下温柔女孩望镜头温柔告别说话"),
}

MODES = {
    "anchors": ["f5", "f10", "f15", "f20", "f25"],
    "rest":    ["f2","f3","f4","f6","f7","f8","f9","f11","f12","f13","f14","f16","f17","f18","f19","f21","f22","f23","f24","f26","f27","f28","f29","f30"],
}
MODES["all"] = MODES["anchors"] + MODES["rest"]

def gen_one(name: str) -> bool:
    if name not in FRAMES:
        print(f"  ⚠️  {name} 不在 FRAMES 表中，跳过"); return False
    line, desc = FRAMES[name]
    req_p = CACHE / f"{name}-req.json"
    job_p = CACHE / f"{name}-job.json"
    raw_p = OUT / f"{name}-raw.mp4"
    fin_p = OUT / f"{name}-final.mp4"

    if fin_p.exists():
        print(f"  ✓ {name} 已存在，复制到 minigame"); shutil.copy(fin_p, MG_VID / fin_p.name); return True

    prompt = (
        f"{desc}。她正对镜头轻声说话：\"{line}\"，嘴唇自然张合与台词同步，"
        f"眼神与镜头交流。9:16 竖屏电影特写。镜头保持稳定，不要旋转，"
        f"不要变换背景或服装，保持人物同一性。"
    )
    req = {
        "prompt": prompt,
        "aspectRatio": "9:16",
        "resolution": "720p",
        "durationSec": 5,
        "image": str(REF),
    }
    req_p.write_text(json.dumps(req, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"\n── {name} ── {line[:20]}...")
    r = subprocess.run(
        ["python3", "tools/make_videos/kling.py", str(req_p),
         "--profile", "kling-3-pro",
         "--job-file", str(job_p),
         "--output", str(raw_p)],
        cwd=WF, capture_output=True, text=True, timeout=600
    )
    tail = "\n".join((r.stdout + r.stderr).strip().splitlines()[-3:])
    print(f"  kling: {tail}")

    if not raw_p.exists() or raw_p.stat().st_size < 100000:
        print(f"  ❌ {name} 生成失败"); return False

    # mux 音频
    audio_p = AUDIO / f"voice-{name}.mp3"
    if audio_p.exists():
        subprocess.run(["ffmpeg", "-y", "-i", str(raw_p), "-i", str(audio_p),
                        "-c:v", "copy", "-c:a", "aac", "-b:a", "128k",
                        "-map", "0:v:0", "-map", "1:a:0", "-shortest",
                        str(fin_p)], capture_output=True, check=True)
        print(f"  ✅ mux 音频")
    else:
        shutil.copy(raw_p, fin_p); print(f"  ⚠️  无音频，直接复制")

    # 复制到 minigame
    shutil.copy(fin_p, MG_VID / fin_p.name)
    print(f"  ✅ 已复制到 minigame/assets/video/{fin_p.name}")
    return True

def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "anchors"
    if mode in MODES:
        picks = MODES[mode]
    else:
        picks = sys.argv[1:]
    print(f"▶ MODE={mode} 待生成 {len(picks)} 段: {picks}")
    print(f"▶ 参考图: {REF}")
    ok, fail = 0, 0
    for n in picks:
        try:
            if gen_one(n): ok += 1
            else: fail += 1
        except Exception as e:
            print(f"  ❌ {n} 异常: {e}"); fail += 1
    print(f"\n══ 完成 ok={ok} fail={fail} ══")

if __name__ == "__main__":
    main()
