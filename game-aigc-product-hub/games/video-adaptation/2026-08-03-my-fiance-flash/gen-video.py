#!/usr/bin/env python3
# 苏小雨 F1 说话视频 · 可灵 image2video
import sys, time, json, base64, hashlib, hmac, os
import urllib.request

ACCESS_KEY = "Af4hrCM4PENhJHrFDMLMEpptk8aYR8gJ"
SECRET_KEY = "Eymh99ameJ3QTDta89QtQDgkkd3ELmDR"
API_BASE   = "https://api-beijing.klingai.com"

def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()

def gen_jwt():
    now = int(time.time())
    header  = b64url(json.dumps({"alg":"HS256","typ":"JWT"}, separators=(',',':')).encode())
    payload = b64url(json.dumps({"iss":ACCESS_KEY,"exp":now+1800,"nbf":now-5}, separators=(',',':')).encode())
    sig = b64url(hmac.new(SECRET_KEY.encode(), f"{header}.{payload}".encode(), hashlib.sha256).digest())
    return f"{header}.{payload}.{sig}"

def req(method, path, body=None):
    url = API_BASE + path
    data = json.dumps(body).encode() if body else None
    r = urllib.request.Request(url, data=data, method=method,
        headers={"Authorization": f"Bearer {gen_jwt()}", "Content-Type":"application/json"})
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        print("HTTP", e.code, e.read().decode()[:500], file=sys.stderr); raise

def main():
    ref_img = sys.argv[1]
    out_path = sys.argv[2]
    prompt = sys.argv[3] if len(sys.argv) > 3 else "邻家女孩温柔微笑说话，嘴唇轻启，头轻微晃动，眼睛看向镜头，柔和光线，9:16竖屏"
    duration = sys.argv[4] if len(sys.argv) > 4 else "5"
    model = "kling-v1-6"  # v1-6 支持 image2video

    with open(ref_img, "rb") as f:
        img_b64 = base64.b64encode(f.read()).decode()

    body = {
        "model_name": model,
        "image": img_b64,
        "prompt": prompt,
        "negative_prompt": "扭曲, 变形, 多余肢体, 模糊, 低质量, 崩坏, 手部畸形",
        "cfg_scale": 0.5,
        "mode": "std",
        "duration": duration,
        "aspect_ratio": "9:16",
    }
    print("→ 提交 image2video 任务...")
    res = req("POST", "/v1/videos/image2video", body)
    print(json.dumps(res, ensure_ascii=False)[:500])
    task_id = res.get("data", {}).get("task_id")
    if not task_id:
        print("❌ 无 task_id"); sys.exit(1)
    print(f"→ task_id={task_id}, 轮询中...")

    while True:
        time.sleep(15)
        s = req("GET", f"/v1/videos/image2video/{task_id}")
        status = s.get("data", {}).get("task_status")
        print(f"  status={status}")
        if status == "succeed":
            vids = s["data"].get("task_result", {}).get("videos", [])
            if vids:
                url = vids[0]["url"]
                print(f"→ 下载 {url}")
                urllib.request.urlretrieve(url, out_path)
                sz = os.path.getsize(out_path)/1024
                print(f"✅ 保存 {out_path} ({sz:.1f} KB)")
                return
            print("❌ 无视频结果"); print(json.dumps(s, ensure_ascii=False)[:800]); sys.exit(1)
        if status == "failed":
            print("❌ 失败:", json.dumps(s, ensure_ascii=False)[:800]); sys.exit(1)

if __name__ == "__main__":
    main()
