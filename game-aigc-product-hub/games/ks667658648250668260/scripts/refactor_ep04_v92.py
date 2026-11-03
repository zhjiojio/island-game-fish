#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""EP04 重构 · 按用户 3 条指示 + 最终执行清单一次性落地"""
import json, collections

EP04 = 'content/episodes/EP04.json'
EP99 = 'content/episodes/EP99.json'
CDN5 = 'https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks667658648250668260/'

d = json.load(open(EP04), object_pairs_hook=collections.OrderedDict)
e99 = json.load(open(EP99), object_pairs_hook=collections.OrderedDict)

# ── A. 删除拖沓/花屏/孤岛节点 ──────────────────────────────────
DEL = ['e4s2', 'e4s5',
    'f_e4s6', 'r_fe4s6_a', 'r_fe4s6_b', 'r_fe4s6_c',
    'e4_escape_bridge', 'f_e4_escape', 'r_fee_b', 'r_fee_c', 'r_fee_d',
    'k3', 'r_k3_1', 'r_k3_2', 'r_k3_3',
    'to_be_continued']
for k in DEL:
    if k in d:
        del d[k]
        print('DEL', k)

# ── B. 改道：e4s1 直连 e4s3（跳过花屏 e4s2）────────────────────
d['e4s1']['next'] = 'e4s3'
print('REWIRE e4s1 -> e4s3')

# ── C. f3 改造：删孤岛「联盟李老憨」，「护婉儿身后」→ 死亡 BE ──
f3 = d['f3']
opts = [o for o in f3['options'] if o.get('id') != 'f3_opt_1']   # 删联盟李老憨
for o in opts:
    if o.get('id') == 'f3_opt_2':      # 「绕路回屋抱住婉儿·先退一步」
        o['text'] = '把婉儿护在身后·先退一步'
        o['icon'] = 'hide'
        o['stat'] = {'wei': -99, 'qing': 5}
        o['next'] = 'BE_BEATEN'
        o['roastKey'] = 'roast_beaten'
        o['roast'] = ('现场勘验：受害人把嫂子往身后一拉，自己两手空空迎上五个壮汉。'
                      '法医结论：护人的心是真的，打不过也是真的。'
        '婉儿是踩着他的血跑出院门喊人的——喊回来的时候，只剩一口气。')
f3['options'] = opts
print('f3 options ->', [o['id'] for o in opts])

# r_f3_2 已无人引用（原「绕路回屋」的反应节点），删掉
if 'r_f3_2' in d:
    del d['r_f3_2']
    print('DEL r_f3_2 (orphaned by BE_BEATEN rewire)')

# ── D. 主线改道：r_fe4s4_* → e4_muscle → s_muscle → e4s6 ──────
for k in ['r_fe4s4_a', 'r_fe4s4_b', 'r_fe4s4_c']:
    d[k]['next'] = 'e4_muscle'
    print('REWIRE', k, '-> e4_muscle')

# 新增：变身猛男激活场景（铁律 40 · skillcard 前必须有视频/图片过场）
d['e4_muscle'] = collections.OrderedDict([
    ('ep', 'EP04'), ('scene', 'house'),
    ('media', collections.OrderedDict([
        ('kind', 'image'),
        ('file', CDN5 + 'skill_muscle_activate.c.jpg'),
        ('label', '掌心发烫·筋骨暴起'),
    ])),
    ('char', 'narrator'), ('speaker', '旁白'),
    ('forceCaption', True),
    ('text', '掌心忽然发烫，两条胳膊上的筋一根根鼓起来——这身力气，是这荒年欠你的。'),
    ('next', 's_muscle'),
])
print('ADD e4_muscle (image)')

# 新增：技能卡节点
d['s_muscle'] = collections.OrderedDict([
    ('ep', 'EP04'), ('scene', 'house'),
    ('media', collections.OrderedDict([
        ('kind', 'skillcard'),
        ('name', '变身猛男·Lv1'),
        ('desc', '一身蛮力从天上掉下来·五个人也拦不住'),
        ('achvId', 'skill_muscle'),
    ])),
    ('char', 'system'), ('speaker', '系统'),
    ('text', '叮——技能激活：变身猛男。'),
    ('next', 'e4s6'),
])
print('ADD s_muscle (skillcard)')

# ── E. e4s6 打完直接倒地服软（删 f_e4s6 后改道）────────────────
d['e4s6']['next'] = 'e4s7'
print('REWIRE e4s6 -> e4s7')

# e4s7 倒地服软 → 温情（删 e4_escape_bridge 后改道）
d['e4s7']['next'] = 'e4s8'
print('REWIRE e4s7 -> e4s8')

# ── F. f_e4s8 三个反应 → 新旁白过场桥 e4_to_e5 ─────────────────
for k in ['r_fe4s8_b', 'r_fe4s8_c', 'r_fe4s8_d']:
    d[k]['next'] = 'e4_to_e5'
    print('REWIRE', k, '-> e4_to_e5')

# 新增跨集旁白过场桥（铁律 39 · 跨集必须加 narrator 过场桥）
d['e4_to_e5'] = collections.OrderedDict([
    ('ep', 'EP04'), ('scene', 'trans'),
    ('media', collections.OrderedDict([
    ('kind', 'image'),
        ('file', CDN5 + 'e4s7_v82.jpg'),
        ('label', '赵铁牛被架走'),
    ])),
    ('char', 'narrator'), ('speaker', '旁白'),
    ('forceCaption', True),
    ('text', '当夜赵铁牛被他那几个兄弟架走了。这一架，把村里的风向也架转了——第二天起，来敲你家门的，就不再是来讨债的了。'),
    ('next', 'e5s0a'),
])
print('ADD e4_to_e5 (bridge -> e5s0a)')

json.dump(d, open(EP04, 'w'), ensure_ascii=False, indent=1)
print('\nEP04 nodes now:', len(d))

# ── G. EP99 新增 BE_BEATEN 死亡结局 ────────────────────────────
e99['BE_BEATEN'] = collections.OrderedDict([
    ('ep', 'EP99'), ('scene', 'house'),
    ('type', 'end'), ('ending', 'BE15'),
    ('media', collections.OrderedDict([
        ('kind', 'image'),
        ('file', CDN5 + 'BE_BEATEN_frame.c.jpg'),
        ('label', '五个人围住·你倒在院里'),
    ])),
    ('char', 'narrator'), ('speaker', '旁白'),
    ('forceCaption', True),
    ('text', '你把她护在身后，却拦不住五双拳头。她跑出去喊人，回来时你已经不会说话了。'),
])
json.dump(e99, open(EP99, 'w'), ensure_ascii=False, indent=1)
print('ADD BE_BEATEN (BE15), EP99 nodes now:', len(e99))
