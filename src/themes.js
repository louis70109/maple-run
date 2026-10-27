// 關卡主題：依序經過楓之谷的各個地區，跑完一輪後從頭開始（第二輪起更快更難）。
// 怪物與 BOSS 都是逐格動畫（assets/sprites，由 scripts/fetch_sprites.py 從 maplestory.io 產生）。
// h 是遊戲裡的顯示高度（同時決定碰撞框），寬度依原圖比例。

const mob = (id, h) => ({ key: `mob-${id}`, h });
const boss = (id, name, h) => ({ key: `mob-${id}`, name, h });

export const THEMES = [
  {
    id: 'henesys', name: '弓箭手村',
    sky: ['#8fd3ff', '#d9f2ff'], far: '#a7d98a', mid: '#6fbf4a', ground: '#8a5a2b', grass: '#5fcf3a',
    deco: 'trees',
    ground_mobs: [mob(1210102, 50), mob(1110100, 50)],
    tall_mobs: [mob(2110200, 100)],
    fly_mobs: [mob(2300100, 44)],
    boss: boss(6130101, '菇菇王', 190),
  },
  {
    id: 'ellinia', name: '魔法森林',
    sky: ['#4e8f6a', '#bfe8c8'], far: '#2f6b4a', mid: '#3f8a52', ground: '#5b3d22', grass: '#3fbf6a',
    deco: 'tallTrees',
    ground_mobs: [mob(210100, 46), mob(130100, 60)],
    tall_mobs: [mob(1130100, 105)],
    fly_mobs: [mob(2230100, 44)],
    boss: boss(5220002, '浮士德', 200),
  },
  {
    id: 'perion', name: '勇士之村',
    sky: ['#f2a65a', '#fbe3b8'], far: '#c9875a', mid: '#a8643a', ground: '#7a4a2a', grass: '#c9a26b',
    deco: 'rocks',
    ground_mobs: [mob(2230102, 54), mob(2230110, 64), mob(2230111, 64)],
    tall_mobs: [mob(5130101, 112)],
    fly_mobs: [mob(5200002, 50)],
    boss: boss(3220000, '樹妖王', 210),
  },
  {
    id: 'kerning', name: '墮落城市',
    sky: ['#3b3f5c', '#8a8fb0'], far: '#4c5170', mid: '#5f6585', ground: '#3a3a44', grass: '#7a7f90',
    deco: 'buildings',
    ground_mobs: [mob(1120100, 52), mob(3110100, 40)],
    tall_mobs: [mob(5130103, 100)],
    fly_mobs: [mob(2300100, 44)],
    boss: boss(6220000, '巨型鱷魚', 200),
  },
  {
    id: 'sleepywood', name: '奇幻村地下',
    sky: ['#1d1b2e', '#4a3f63'], far: '#2a2540', mid: '#3a3256', ground: '#3b2f3f', grass: '#6b5a7a',
    deco: 'stalactites',
    ground_mobs: [mob(2230101, 54), mob(5130100, 62)],
    tall_mobs: [mob(6130100, 110)],
    fly_mobs: [mob(3230101, 46), mob(4230102, 56), mob(3230100, 46)],
    boss: boss(8130100, '巴洛古', 220),
  },
  {
    id: 'elnath', name: '冰原雪域',
    sky: ['#9cc9e8', '#eef7ff'], far: '#d6e9f7', mid: '#b8d6ec', ground: '#7d93a8', grass: '#ffffff',
    deco: 'snowPeaks',
    ground_mobs: [mob(5140000, 52), mob(5130104, 52)],
    tall_mobs: [mob(6300000, 115)],
    fly_mobs: [mob(5200001, 50)],
    boss: boss(8220000, '艾莉莎', 200),
  },
  {
    id: 'ludibrium', name: '玩具城',
    sky: ['#ffb6d9', '#fff0f8'], far: '#ffd1e8', mid: '#c9a6ff', ground: '#6a7bd8', grass: '#ffd84d',
    deco: 'blocks',
    ground_mobs: [mob(3000005, 56), mob(3110101, 56), mob(3210203, 56), mob(4230111, 66)],
    tall_mobs: [mob(4230109, 112)],
    fly_mobs: [mob(4230114, 56), mob(4230115, 58)],
    boss: boss(5220003, '咕咕鐘', 210),
  },
  {
    id: 'leafre', name: '神木村',
    sky: ['#e8b96a', '#fff3d6'], far: '#b9a06a', mid: '#8a7a4a', ground: '#5a4630', grass: '#9acd5a',
    deco: 'tallTrees',
    ground_mobs: [mob(8140110, 58), mob(8140111, 62)],
    tall_mobs: [mob(8140101, 115)],
    fly_mobs: [mob(8150302, 58), mob(8140001, 54)],
    boss: boss(8180000, '火焰龍', 220),
  },
];

export const themeForStage = (stage) => THEMES[(stage - 1) % THEMES.length];

export const JOBS = [
  { id: 'warrior', name: '劍士', key: 'job-warrior', perk: '最大 HP +20%', hpBonus: 1.2 },
  { id: 'magician', name: '法師', key: 'job-magician', perk: '道具效果時間 +50%', powerupBonus: 1.5 },
  { id: 'archer', name: '弓箭手', key: 'job-archer', perk: '跳躍更高', jumpBonus: 1.08 },
  { id: 'thief', name: '盜賊', key: 'job-thief', perk: '可以三段跳', maxJumps: 3 },
  { id: 'pirate', name: '海盜', key: 'job-pirate', perk: '楓幣價值 +30%', mesoBonus: 1.3 },
];

export const ITEM_ICONS = Array.from({ length: 40 }, (_, i) => `assets/items/${4009800 + i}.webp`);
