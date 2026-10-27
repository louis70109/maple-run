#!/usr/bin/env python3
"""從 maplestory.io 抓楓之谷角色與怪物的逐格動畫，打包成 sprite sheet。

輸出（會 commit 進 repo，遊戲執行時不需要連 maplestory.io）：
  assets/sprites/<key>.png     每個角色／怪物一張橫向 sprite sheet
  assets/sprites/sprites.json  每一格在 sheet 裡的位置、腳底原點、顯示時間
  assets/sprites/preview/<key>.png  第一格（選單、圖示用）

需要 Python 3 與 Pillow（pip install pillow）。
用法：python3 scripts/fetch_sprites.py        # 已下載過的會用 .cache 裡的快取
"""
import base64
import io
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'sprites')
CACHE = os.path.join(ROOT, '.cache', 'sprites')
API = 'https://maplestory.io/api'
VERSION = '255'

# 職業外觀：身體、頭、臉、髮型、帽子、衣服、鞋子、武器
JOBS = {
    'warrior': ([2000, 12000, 20000, 30030, 1002003, 1050000, 1072015, 1302000], 'swingO1'),
    'magician': ([2000, 12000, 20001, 30000, 1002074, 1050003, 1072072, 1372005], 'swingO1'),
    'archer': ([2000, 12000, 21000, 31000, 1002158, 1040067, 1062001, 1072016, 1452002], 'shoot1'),
    'thief': ([2000, 12000, 20001, 30020, 1002110, 1040006, 1060005, 1072018, 1472000], 'swingO1'),
    'pirate': ([2000, 12000, 21001, 31010, 1002080, 1050185, 1072064, 1482000], 'swingO1'),
}
# 遊戲動作 → (楓之谷動作, 格數, 每格毫秒)
JOB_ACTIONS = {
    'walk': ('walk1', 4, 150),
    'jump': ('jump', 1, 200),
    'prone': ('prone', 1, 200),
    'alert': ('alert', 3, 160),
    'stand': ('stand1', 3, 400),
}

# 怪物：id → 要抓的動作（第一個是預設動畫）
MOBS = {
    # 一般怪（地面／高大／飛行）
    1210102: ['move', 'hit1'], 1110100: ['move', 'hit1'], 2110200: ['move', 'hit1'], 2300100: ['fly', 'hit1'],
    210100: ['move', 'hit1'], 130100: ['move', 'hit1'], 1130100: ['move', 'hit1'], 2230100: ['move', 'hit1'],
    2230102: ['move', 'hit1'], 2230110: ['move', 'hit1'], 2230111: ['move', 'hit1'], 5130101: ['move', 'hit1'], 5200002: ['move', 'hit1'],
    1120100: ['move', 'hit1'], 3110100: ['move', 'hit1'], 5130103: ['move', 'hit1'],
    2230101: ['move', 'hit1'], 5130100: ['move', 'hit1'], 6130100: ['move', 'hit1'],
    3230101: ['move', 'hit1'], 4230102: ['move', 'hit1'], 3230100: ['move', 'hit1'],
    5140000: ['move', 'hit1'], 5130104: ['move', 'hit1'], 6300000: ['move', 'hit1'], 5200001: ['move', 'hit1'],
    3000005: ['move', 'hit1'], 3110101: ['move', 'hit1'], 3210203: ['move', 'hit1'], 4230111: ['move', 'hit1'],
    4230109: ['move', 'hit1'], 4230114: ['move', 'hit1'], 4230115: ['move', 'hit1'],
    8140110: ['move', 'hit1'], 8140111: ['move', 'hit1'], 8140101: ['move', 'hit1'], 8150302: ['move', 'hit1'], 8140001: ['move', 'hit1'],
    # 關底 BOSS
    6130101: ['move', 'attack1'], 5220002: ['move', 'attack1'], 3220000: ['move', 'attack1'], 6220000: ['move', 'skill1'],
    8130100: ['move', 'attack1'], 8220000: ['move', 'attack1'], 5220003: ['move', 'attack1'], 8180000: ['move', 'attack1'],
}
# 職業攻擊特效：effect＝出招特效（以角色腳底為原點）、hit＝打中時的火花、ball＝飛行道具
SKILL = 'Skill/{}.img/skill/{}'
FX = {
    'warrior': {'icon': SKILL.format(100, 1001005) + '/icon', 'effect': SKILL.format(100, 1001005) + '/effect', 'hit': SKILL.format(100, 1001005) + '/hit/0'},  # Slash Blast
    'magician': {'icon': SKILL.format(200, 2001008) + '/icon', 'effect': SKILL.format(200, 2001008) + '/effect', 'ball': SKILL.format(200, 2001008) + '/ball',
                 'hit': SKILL.format(200, 2001008) + '/hit/0'},  # Energy Bolt
    'archer': {'icon': SKILL.format(300, 3001004) + '/icon', 'effect': SKILL.format(300, 3001004) + '/effect', 'ball': 'Item/Consume/0206.img/02060000/bullet',
               'hit': SKILL.format(300, 3001004) + '/hit/0'},  # Arrow Blow ＋ 箭矢
    'thief': {'icon': SKILL.format(400, 4001344) + '/icon', 'effect': SKILL.format(400, 4001344) + '/effect', 'ball': 'Item/Consume/0207.img/02070000/bullet',
              'hit': SKILL.format(400, 4001344) + '/hit/0'},  # Lucky Seven ＋ 飛鏢
    'pirate': {'icon': SKILL.format(500, 5001002) + '/icon', 'effect': SKILL.format(500, 5001002) + '/effect', 'hit': SKILL.format(500, 5001002) + '/hit/0'},  # Sommersault Kick
}
# 大絕招（sk-<職業>）：icon 放第一個，預覽圖就是技能圖示（給按鈕用）
SIGNATURE = {
    'warrior': {'icon': SKILL.format(131, 1311012) + '/icon', 'effect': SKILL.format(131, 1311012) + '/effect',
                'hit': SKILL.format(131, 1311012) + '/hit/0'},  # Rush 突進
    'magician': {'icon': SKILL.format(222, 2221007) + '/icon', 'effect': SKILL.format(222, 2221007) + '/effect0',
                 'tile': SKILL.format(222, 2221007) + '/tile/0', 'hit': SKILL.format(222, 2221007) + '/hit/0'},  # Blizzard 暴風雪
    'archer': {'icon': SKILL.format(312, 3121020) + '/icon', 'effect': SKILL.format(312, 3121020) + '/keydown',
               'ball': SKILL.format(312, 3121020) + '/ball', 'hit': SKILL.format(312, 3121020) + '/hit/0'},  # Hurricane 暴風神射
    'thief': {'icon': SKILL.format(421, 4211006) + '/icon', 'effect': SKILL.format(421, 4211006) + '/effect',
              'hit': SKILL.format(421, 4211006) + '/hit/0'},  # Meso Explosion 楓幣炸彈
    'pirate': {'icon': SKILL.format(530, 5301001) + '/icon', 'effect': SKILL.format(530, 5301001) + '/effect',
               'ball': SKILL.format(530, 5301001) + '/ball', 'hit': SKILL.format(530, 5301001) + '/hit/0'},  # Barrel Bomb 炸彈桶
}
# 其他道具圖示（存成 assets/items/<名稱>.png）
ITEMS = {'skillbook': 2280003}  # 技能升級券：楓之谷的技能書
MAX_FRAMES = 12  # 太長的攻擊動畫抽格，控制檔案大小


def get(url, binary=False):
    os.makedirs(CACHE, exist_ok=True)
    key = os.path.join(CACHE, urllib.parse.quote(url, safe='')[-180:])
    if os.path.exists(key):
        with open(key, 'rb') as f:
            data = f.read()
    else:
        for attempt in range(4):
            try:
                req = urllib.request.Request(url, headers={'User-Agent': 'maple-run-sprite-fetcher/1.0'})
                with urllib.request.urlopen(req, timeout=60) as r:
                    data = r.read()
                break
            except urllib.error.HTTPError as e:
                if e.code < 500 or attempt == 3:
                    raise
                time.sleep(2 ** attempt)
            except Exception as e:  # 網路不穩就重試
                if attempt == 3:
                    raise
                print('  retry', url[-60:], e)
                time.sleep(2 ** attempt)
        with open(key, 'wb') as f:
            f.write(data)
    return data if binary else json.loads(data)


def crop(img, ox, oy):
    """裁掉透明邊，原點跟著平移。"""
    bbox = img.getbbox() or (0, 0, 1, 1)
    return img.crop(bbox), ox - bbox[0], oy - bbox[1]


def sample(frames):
    if len(frames) <= MAX_FRAMES:
        return frames
    step = len(frames) / MAX_FRAMES
    picked = []
    for i in range(MAX_FRAMES):
        group = frames[int(i * step):int((i + 1) * step)]
        img, ox, oy, _ = group[0]
        picked.append((img, ox, oy, sum(g[3] for g in group)))
    return picked


def job_frames(items, action, count):
    q = urllib.parse.quote(','.join(json.dumps({'itemId': i, 'version': VERSION, 'region': 'GMS'}, separators=(',', ':')) for i in items), safe='')
    frames = []
    for f in range(count):
        try:
            data = get(f'{API}/character/{q}/{action}/{f}?renderMode=FeetCenter&showears=false', binary=True)
        except Exception:
            if f == 0:
                raise
            break  # 這個動作的格數比預期少
        img = Image.open(io.BytesIO(data)).convert('RGBA')
        # FeetCenter：腳底剛好在圖片正中央
        frames.append(crop(img, img.width // 2, img.height // 2))
    return frames


def wz_frame(path):
    """讀一格 wz 圖片：path 例如 'Mob/0210100.img/move/0'。回傳 (圖, 原點x, 原點y, 毫秒)"""
    base = f'{API}/wz/GMS/{VERSION}/{path}'
    node = get(base)
    children = node.get('children', [])
    if not node.get('value') and '_inlink' in children:
        link = get(base + '/_inlink')['value']  # 相對於 .img 的路徑，例如 "stand/0"
        root = path[:path.index('.img/') + 4]
        return wz_frame(f'{root}/{link}')
    img = Image.open(io.BytesIO(base64.b64decode(node['value']))).convert('RGBA')
    o = get(base + '/origin')['value'] if 'origin' in children else {'x': img.width // 2, 'y': img.height // 2}
    delay = int(get(base + '/delay')['value']) if 'delay' in children else 100
    return img, o['x'], o['y'], max(30, delay)


def wz_frames(path):
    """讀一整個動作（底下是 0, 1, 2… 的格子），裁邊並抽格。"""
    listing = get(f'{API}/wz/GMS/{VERSION}/{path}')
    if listing.get('type') == 12:  # 單張圖（例如技能圖示）
        img, ox, oy, d = wz_frame(path)
        c, cx, cy = crop(img, ox, oy)
        return [(c, cx, cy, d)]
    idxs = sorted(int(c) for c in listing.get('children', []) if c.isdigit())
    frames = []
    for i in idxs:
        img, ox, oy, d = wz_frame(f'{path}/{i}')
        c, cx, cy = crop(img, ox, oy)
        frames.append((c, cx, cy, d))
    return sample(frames)


def mob_frames(mob, action):
    return wz_frames(f'Mob/{int(mob):07d}.img/{action}')


def pack(key, actions, meta):
    """把所有動作的格子排成一張橫向 sheet。actions: {name: [(img, ox, oy, delay)]}"""
    flat = [(name, fr) for name, frs in actions.items() for fr in frs]
    w = sum(fr[0].width for _, fr in flat) + 2 * len(flat)
    h = max(fr[0].height for _, fr in flat)
    sheet = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    x = 0
    entry = {}
    for name, (img, ox, oy, d) in flat:
        sheet.alpha_composite(img, (x, 0))
        entry.setdefault(name, []).append({'x': x, 'y': 0, 'w': img.width, 'h': img.height, 'ox': ox, 'oy': oy, 'd': d})
        x += img.width + 2
    if key.startswith(('fx-', 'sk-')):
        # 技能特效很大，轉成 256 色（保留透明度）縮小檔案
        sheet = sheet.quantize(256, method=Image.Quantize.FASTOCTREE)
    sheet.save(os.path.join(OUT, f'{key}.png'), optimize=True)
    first = next(iter(actions.values()))[0][0]
    first.save(os.path.join(OUT, 'preview', f'{key}.png'), optimize=True)
    meta[key] = entry


def main():
    os.makedirs(os.path.join(OUT, 'preview'), exist_ok=True)
    meta = {}
    for job, (items, attack) in JOBS.items():
        print('job', job)
        acts = {}
        for name, (action, count, delay) in JOB_ACTIONS.items():
            acts[name] = [(img, ox, oy, delay) for img, ox, oy in job_frames(items, action, count)]
        acts['attack'] = [(img, ox, oy, 110) for img, ox, oy in job_frames(items, attack, 3)]
        # 選單用站姿當預覽
        acts = {'stand': acts.pop('stand'), **acts}
        pack(f'job-{job}', acts, meta)
    for mob, actions in MOBS.items():
        print('mob', mob)
        acts = {}
        if 'hit1' in actions:
            actions = actions + ['die1']  # 被打倒的動畫
        for action in actions:
            frames = mob_frames(mob, action)
            # 遊戲裡統一叫 move / hit / attack
            name = {'fly': 'move', 'hit1': 'hit', 'skill1': 'attack', 'attack1': 'attack', 'die1': 'die'}.get(action, action)
            acts[name] = frames
        pack(f'mob-{mob}', acts, meta)
    for job, parts in FX.items():
        print('fx', job)
        pack(f'fx-{job}', {name: wz_frames(path) for name, path in parts.items()}, meta)
    for job, parts in SIGNATURE.items():
        print('sk', job)
        pack(f'sk-{job}', {name: wz_frames(path) for name, path in parts.items()}, meta)
    for name, item in ITEMS.items():
        print('item', name)
        data = get(f'{API}/GMS/{VERSION}/item/{item}/icon', binary=True)
        Image.open(io.BytesIO(data)).convert('RGBA').save(os.path.join(ROOT, 'assets', 'items', f'{name}.png'), optimize=True)
    with open(os.path.join(OUT, 'sprites.json'), 'w') as f:
        json.dump(meta, f, separators=(',', ':'))
    total = sum(os.path.getsize(os.path.join(OUT, n)) for n in os.listdir(OUT) if n.endswith('.png'))
    print(f'done: {len(meta)} sprites, {total / 1024:.0f} KB')


if __name__ == '__main__':
    sys.exit(main())
