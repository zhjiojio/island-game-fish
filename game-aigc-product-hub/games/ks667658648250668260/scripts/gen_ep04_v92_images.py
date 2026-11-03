#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""EP04 重构 · 3 张 AIGC 图并发生成（铁律 45 并发 / 铁律 51 安全边界 / 铁律 53 成本意识）

1. skill_muscle.png            — 变身猛男技能卡图（后续 rembg 抠透明底）
2. skill_muscle_activate.c.jpg — 傲天变身猛男激活场景（e4_muscle 节点）
3. BE_BEATEN_frame.c.jpg       — 空手护她被五人打倒的死亡帧（BE_BEATEN 节点）

安全边界：全部男性主角，无女性身体描述 → 规避 gpt-image-2 女性尺度红线。
暴力表述用「戏剧化古装武打剧照」措辞，不写血腥细节。
"""
import os, sys, json, base64, pathlib
import urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor
from PIL import Image

ENV = pathlib.Path('/Users/fat/.codeflicker/remote-personal-skills/agw-work-mode/tools/config/.env.local')
if ENV.exists():
    for line in ENV.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, v = line.split('=', 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

API_KEY = os.environ.get('OPENROUTER_API_KEY')
if not API_KEY:
    sys.exit('missing OPENROUTER_API_KEY')

OUT = pathlib.Path('/Users/fat/weihunqi/work/ep04_images')
OUT.mkdir(parents=True, exist_ok=True)
MODEL = 'openai/gpt-5.4-image-2'

# 傲天角色锁（对齐 avatars/aotian-avatar-v2.png 立绘设定）
AOTIAN = """CHARACTER — a Han Chinese man, age 28 to 32, unmistakably East Asian.
Broad honest square face, thick straight brows, deep-set determined eyes, high cheekbones,
strong jaw, short cropped black hair, weathered sun-tanned farmer's skin.
He wears a coarse hand-woven dark indigo cotton short jacket (traditional 1960s-70s rural
Chinese peasant clothing), sleeves pushed up above the elbows, a cloth waist sash,
loose ankle-length coarse trousers, worn cloth shoes.
Rugged, muscular working-man build from years of field labour.
No Western, European or Caucasian facial structure."""

ERA = """SETTING ERA — rural Northern China, famine years, roughly 1960s-70s.
Mud-brick courtyard walls, thatched and tile roofing, packed dirt ground, wooden farm tools,
a stone millstone, dry corn stalks stacked against a wall. Dusty earthy palette:
ochre, umber, faded indigo, dry straw yellow. Overcast late-afternoon light."""

REALISM = """PHOTOGRAPHIC REALISM — must look like a REAL film still from a gritty Chinese
period drama, shot on real cinema camera, NOT rendered, illustrated, CGI or AI-generated.
Real skin with visible pores, sweat, dust and grime, natural texture unevenness,
authentic fabric weave and worn creases in the clothing, real dust motes in the air.
Shot on ARRI Alexa with a 35mm anamorphic lens, available light only, natural film grain,
mild lens vignetting, authentic unmodified colour science, slight handheld imperfection.
NO beauty filter, NO skin smoothing, NO plastic CGI sheen, NO wax-doll skin."""

STYLE = """Absolutely no text, no letters, no Chinese characters, no logos, no watermark,
no subtitles anywhere in the image.

Avoid: Caucasian features, European face, Western bone structure, modern clothing,
modern buildings, wristwatch, eyeglasses, deformed hands, extra fingers, extra limbs,
merged faces, distorted anatomy, plastic waxy skin, uncanny doll face, cropped head,
black bars, letterboxing, split-screen, collage, comic panels, text overlay."""

SHOTS = {
    'skill_muscle': {
        'aspect': '1:1',
        'prompt': f"""Create a SQUARE 1:1 heroic character key-art icon for a mobile game
skill card — a single Chinese peasant man discovering sudden superhuman physical strength.

{AOTIAN}

POSE AND ACTION — he stands centred, facing camera, chest out, both fists clenched and
raised at his sides in a powerful flexing stance. His jacket sleeves are rolled high,
revealing thick corded forearm and bicep muscles bulging with visible veins and tendons.
His head is tilted slightly down, brows lowered, eyes blazing with fierce resolve,
teeth clenched in a low growl. Faint warm golden energy glows from his palms and
traces the ridges of his arm muscles — a supernatural surge of raw power awakening.
Dust and small stones lift off the ground around his feet from the force.

COMPOSITION — tight heroic medium shot from the waist up, subject dead centre,
filling the frame, dramatic low camera angle looking slightly up at him to convey power.
Clean simple dark background so the figure reads clearly as a game icon:
deep umber-to-black radial gradient with a soft warm golden rim light behind his shoulders.
Strong rim lighting separates his silhouette crisply from the background.
Full head and both arms fully inside the frame with comfortable margin.

{ERA}

{REALISM}

{STYLE}""",
    },

    'skill_muscle_activate': {
        'aspect': '9:16',
        'prompt': f"""Create a VERTICAL 9:16 cinematic film still — the exact moment a Chinese
peasant man's body surges with sudden supernatural strength in his own farmyard.

{AOTIAN}

POSE AND ACTION — he is caught mid-transformation, standing in the courtyard.
Both arms are flexed downward and outward at his sides, fists balled tight.
His forearms and biceps are visibly swelling, every tendon and vein standing out sharp
under dust-streaked skin. His shirt sleeves strain at the seams. His head is thrown
slightly back, jaw clenched, eyes wide and burning, mouth open in a roar.
Warm golden light radiates from inside his clenched palms and runs in thin glowing
lines up the muscles of his arms. A ring of dust and dry straw blows outward from
his feet. Behind him, a heavy iron hoe leans against the mud wall within reach.

COMPOSITION — vertical full-body-to-thigh shot, subject slightly left of centre,
low camera angle looking up to convey rising power, shallow depth of field with the
courtyard wall softly out of focus behind him. Full head inside frame with headroom.

{ERA}

{REALISM}

{STYLE}""",
    },

    'BE_BEATEN_frame': {
        'aspect': '9:16',
        'prompt': f"""Create a VERTICAL 9:16 cinematic film still for a tragic scene in a
gritty Chinese period drama — an outnumbered farmer who has just lost a courtyard brawl.
Dramatic, restrained and sombre — a tragedy beat, NOT graphic or gory.

{AOTIAN}

SCENE AND ACTION — he has fallen to his knees on the packed dirt of his own courtyard,
one hand braced on the ground, the other arm hanging limp at his side, head bowed low,
shoulders slumped in total exhaustion and defeat. His indigo jacket is torn at the
shoulder and grey with dust, his hair dishevelled and matted with sweat and dirt,
a smear of dust and a shallow scrape across one cheekbone. His eyes are half-closed,
unfocused, spent — he is beaten but still upright on his knees.

Surrounding him in a loose semicircle, seen mostly as dark backlit silhouettes and
partial figures at the edges of frame, stand FIVE thickset rural men in coarse dark
padded jackets, their backs and shoulders turned toward camera, faces not visible,
one holding a wooden cudgel loosely at his side. They tower over him, static and
looming. No blows are in motion, no wounds, no blood shown.

MOOD AND LIGHT — cold overcast dusk, the light draining from the sky, long flat
shadows across the dirt. Desaturated cold palette of grey, dust brown and faded
indigo, with one weak warm glow from an oil lamp in the doorway behind them.
Heavy, quiet, hopeless atmosphere.

COMPOSITION — vertical shot, the kneeling man low and centred in the lower third of
frame, the five dark standing silhouettes framing him on both sides and above,
camera at low eye level near the ground looking slightly up past him.
Full figure of the kneeling man inside frame.

{ERA}

{REALISM}

{STYLE}""",
    },
}


def call(tag, prompt, aspect):
    body = {
        'model': MODEL,
        'messages': [{'role': 'user', 'content': [{'type': 'text', 'text': prompt}]}],
        'modalities': ['image', 'text'],
        'image_config': {'aspect_ratio': aspect},
    }
    req = urllib.request.Request(
        'https://openrouter.ai/api/v1/chat/completions',
     data=json.dumps(body).encode(),
        headers={'Authorization': 'Bearer ' + API_KEY, 'Content-Type': 'application/json'},
    )
    try:
        with urllib.request.urlopen(req, timeout=900) as r:
            data = json.load(r)
    except urllib.error.HTTPError as e:
        print('[%s] HTTP %s :: %s' % (tag, e.code, e.read().decode()[:400]), flush=True)
        return None
    except Exception as e:
        print('[%s] EX %s' % (tag, e), flush=True)
        return None

    msg = data['choices'][0]['message']
    imgs = msg.get('images') or []
    if not imgs:
        print('[%s] REFUSED :: %s' % (tag, str(msg.get('content'))[:300]), flush=True)
        return None

    b64 = imgs[0]['image_url']['url'].split(',', 1)[1]
    p = OUT / (tag + '.png')
    p.write_bytes(base64.b64decode(b64))
    im = Image.open(p)
    print('[%s] %s | %.0f KB -> %s' % (tag, im.size, p.stat().st_size / 1024, p), flush=True)
    return p


if __name__ == '__main__':
    keys = sys.argv[1:] or list(SHOTS.keys())
    with ThreadPoolExecutor(max_workers=3) as ex:
        futs = {k: ex.submit(call, k, SHOTS[k]['prompt'], SHOTS[k]['aspect']) for k in keys}
        for k, f in futs.items():
            r = f.result()
            print('RESULT', k, 'OK' if r else 'FAIL', flush=True)
