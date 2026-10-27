// 關卡主題：依序經過楓之谷的各個地區，跑完一輪後從頭開始（第二輪起更快更難）。
// 怪物圖片取自 rms-data 的 assets（leech / forum/bosses / wb）。

const mob = (f, h) => ({ src: `assets/mobs/${f}`, h });

export const THEMES = [
  {
    id: 'henesys', name: '弓箭手村',
    sky: ['#8fd3ff', '#d9f2ff'], far: '#a7d98a', mid: '#6fbf4a', ground: '#8a5a2b', grass: '#5fcf3a',
    deco: 'trees',
    ground_mobs: [mob('m1210103.png', 48), mob('horny-mushroom.png', 64)],
    tall_mobs: [mob('horny-mushroom.png', 105)],
    fly_mobs: [mob('m8140001.png', 52)],
    boss: { src: 'assets/bosses/009.png', name: '菇菇王', h: 200 },
  },
  {
    id: 'ellinia', name: '魔法森林',
    sky: ['#4e8f6a', '#bfe8c8'], far: '#2f6b4a', mid: '#3f8a52', ground: '#5b3d22', grass: '#3fbf6a',
    deco: 'tallTrees',
    ground_mobs: [mob('m4250000.png', 66), mob('m4250001.png', 70)],
    tall_mobs: [mob('m4250001.png', 110)],
    fly_mobs: [mob('m8140002.png', 54)],
    boss: { src: 'assets/bosses/002.gif', name: '樹妖王', h: 210 },
  },
  {
    id: 'perion', name: '勇士之村',
    sky: ['#f2a65a', '#fbe3b8'], far: '#c9875a', mid: '#a8643a', ground: '#7a4a2a', grass: '#c9a26b',
    deco: 'rocks',
    ground_mobs: [mob('m2230102.png', 56)],
    tall_mobs: [mob('m2230102.png', 100)],
    fly_mobs: [mob('fire-spirit.png', 56)],
    boss: { src: 'assets/bosses/034.png', name: '火焰牛魔', h: 200 },
  },
  {
    id: 'kerning', name: '墮落城市',
    sky: ['#3b3f5c', '#8a8fb0'], far: '#4c5170', mid: '#5f6585', ground: '#3a3a44', grass: '#7a7f90',
    deco: 'buildings',
    ground_mobs: [mob('m9420530.png', 70), mob('m9420533.png', 56), mob('m9420529.png', 54)],
    tall_mobs: [mob('m9420530.png', 112)],
    fly_mobs: [mob('m9420515.png', 56)],
    boss: { src: 'assets/bosses/012.png', name: '機器人', h: 200 },
  },
  {
    id: 'sleepywood', name: '奇幻村地下',
    sky: ['#1d1b2e', '#4a3f63'], far: '#2a2540', mid: '#3a3256', ground: '#3b2f3f', grass: '#6b5a7a',
    deco: 'stalactites',
    ground_mobs: [mob('m8190003.png', 70), mob('m8190004.png', 74)],
    tall_mobs: [mob('m8190004.png', 115)],
    fly_mobs: [mob('m3230101.png', 46), mob('m4230102.png', 56), mob('m4230114.png', 58)],
    boss: { src: 'assets/bosses/016.png', name: '巴洛古', h: 220 },
  },
  {
    id: 'elnath', name: '冰原雪域',
    sky: ['#9cc9e8', '#eef7ff'], far: '#d6e9f7', mid: '#b8d6ec', ground: '#7d93a8', grass: '#ffffff',
    deco: 'snowPeaks',
    ground_mobs: [mob('m7130102.png', 80)],
    tall_mobs: [mob('m6300000.png', 120)],
    fly_mobs: [mob('m7130020.png', 40)],
    boss: { src: 'assets/bosses/033.png', name: '冰獨角獸', h: 210 },
  },
  {
    id: 'ludibrium', name: '玩具城',
    sky: ['#ffb6d9', '#fff0f8'], far: '#ffd1e8', mid: '#c9a6ff', ground: '#6a7bd8', grass: '#ffd84d',
    deco: 'blocks',
    ground_mobs: [mob('m3000005.png', 56), mob('m3110101.png', 56), mob('m9420536.png', 74)],
    tall_mobs: [mob('m9420536.png', 112)],
    fly_mobs: [mob('m9420535.png', 60)],
    boss: { src: 'assets/bosses/018.png', name: '時鐘機器', h: 210 },
  },
  {
    id: 'leafre', name: '神木村',
    sky: ['#e8b96a', '#fff3d6'], far: '#b9a06a', mid: '#8a7a4a', ground: '#5a4630', grass: '#9acd5a',
    deco: 'tallTrees',
    ground_mobs: [mob('m8210002.png', 80), mob('m8210005.png', 76)],
    tall_mobs: [mob('m8210005.png', 118)],
    fly_mobs: [mob('m8150302.png', 62)],
    boss: { src: 'assets/bosses/023.gif', name: '紅龍', h: 220 },
  },
];

export const themeForStage = (stage) => THEMES[(stage - 1) % THEMES.length];

export const JOBS = [
  { id: 'warrior', name: '劍士', src: 'assets/chars/warrior.png', perk: '最大 HP +20%', hpBonus: 1.2 },
  { id: 'magician', name: '法師', src: 'assets/chars/magician.png', perk: '道具效果時間 +50%', powerupBonus: 1.5 },
  { id: 'archer', name: '弓箭手', src: 'assets/chars/archer.png', perk: '跳躍更高', jumpBonus: 1.08 },
  { id: 'thief', name: '盜賊', src: 'assets/chars/thief.png', perk: '可以三段跳', maxJumps: 3 },
  { id: 'pirate', name: '海盜', src: 'assets/chars/pirate.png', perk: '楓幣價值 +30%', mesoBonus: 1.3 },
];

export const ITEM_ICONS = Array.from({ length: 40 }, (_, i) => `assets/items/${4009800 + i}.webp`);
