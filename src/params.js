// 難度參數定義：遊戲本體、GM 設定介面、驗證都共用這一份。
// 每個參數有「基礎值」，部分參數另有「每關成長量」，關卡越後面數值越高（再以上限/下限夾住）。

export const CHANNELS = [
  { id: 'easy', name: '頻道 1・新手', short: 'CH.1', tag: '簡單', color: '#5cb85c' },
  { id: 'normal', name: '頻道 2・冒險者', short: 'CH.2', tag: '普通', color: '#f0ad4e' },
  { id: 'hard', name: '頻道 3・勇者', short: 'CH.3', tag: '困難', color: '#d9534f' },
];

// group 只用來在 GM 介面分區顯示
export const PARAMS = [
  { key: 'baseSpeed', label: '起始速度', unit: 'px/s', min: 200, max: 700, step: 10, group: '速度',
    desc: '第 1 關的奔跑速度', def: { easy: 330, normal: 390, hard: 450 } },
  { key: 'speedPerStage', label: '每關加速', unit: 'px/s', min: 0, max: 120, step: 5, group: '速度',
    desc: '每過一關增加的速度', def: { easy: 22, normal: 32, hard: 42 } },
  { key: 'maxSpeed', label: '速度上限', unit: 'px/s', min: 300, max: 1200, step: 10, group: '速度',
    desc: '速度不會超過這個值', def: { easy: 650, normal: 780, hard: 900 } },

  { key: 'hpMax', label: '最大 HP', unit: '', min: 50, max: 300, step: 5, group: '體力',
    desc: '角色的最大 HP（戰士另有加成）', def: { easy: 120, normal: 100, hard: 90 } },
  { key: 'hpDrain', label: 'HP 自然消耗', unit: '/s', min: 0, max: 15, step: 0.1, group: '體力',
    desc: '每秒自動減少的 HP（類似薑餅人的能量條）', def: { easy: 2.2, normal: 3, hard: 3.2 } },
  { key: 'hpDrainPerStage', label: '每關消耗增加', unit: '/s', min: 0, max: 3, step: 0.05, group: '體力',
    desc: '每過一關 HP 消耗增加多少', def: { easy: 0.2, normal: 0.3, hard: 0.35 } },
  { key: 'potionInterval', label: '藥水間隔', unit: 'px', min: 800, max: 8000, step: 100, group: '體力',
    desc: '大約每跑多遠出現一瓶藥水', def: { easy: 1800, normal: 2300, hard: 2500 } },

  { key: 'obstacleDensity', label: '障礙密度', unit: '', min: 0.1, max: 1, step: 0.01, group: '障礙',
    desc: '0.1＝很稀疏，1＝很密集', def: { easy: 0.4, normal: 0.55, hard: 0.7 } },
  { key: 'densityPerStage', label: '每關密度增加', unit: '', min: 0, max: 0.2, step: 0.01, group: '障礙',
    desc: '每過一關障礙密度增加多少（上限 1）', def: { easy: 0.03, normal: 0.04, hard: 0.05 } },
  { key: 'obstacleDamage', label: '撞怪傷害', unit: 'HP', min: 0, max: 100, step: 1, group: '障礙',
    desc: '撞到怪物扣多少 HP', def: { easy: 14, normal: 20, hard: 26 } },
  { key: 'pitChance', label: '坑洞機率', unit: '', min: 0, max: 0.6, step: 0.01, group: '障礙',
    desc: '每段地形出現坑洞的機率', def: { easy: 0.08, normal: 0.14, hard: 0.2 } },
  { key: 'pitDamage', label: '掉坑傷害', unit: 'HP', min: 0, max: 100, step: 1, group: '障礙',
    desc: '掉進坑洞扣多少 HP（之後會在下一塊地面復活）', def: { easy: 20, normal: 28, hard: 36 } },

  { key: 'stageLength', label: '關卡長度', unit: 'px', min: 3000, max: 40000, step: 500, group: '關卡',
    desc: '跑多遠會遇到關底 BOSS', def: { easy: 9000, normal: 10000, hard: 11000 } },
  { key: 'bossDuration', label: 'BOSS 時間', unit: '秒', min: 3, max: 30, step: 1, group: '關卡',
    desc: '撐過 BOSS 攻擊的秒數', def: { easy: 7, normal: 9, hard: 11 } },
  { key: 'bossFireRate', label: 'BOSS 攻擊頻率', unit: '次/s', min: 0.2, max: 3, step: 0.1, group: '關卡',
    desc: '第 1 關 BOSS 每秒丟幾發攻擊（每關 +10%）', def: { easy: 0.7, normal: 0.9, hard: 1.2 } },
  { key: 'bossHp', label: 'BOSS 耐久', unit: '', min: 10, max: 500, step: 5, group: '關卡',
    desc: 'BOSS 的血量（每關 +12%）。時間內打倒可提早過關、獎勵加倍；近戰每下 11～13，遠程約 1～1.5', def: { easy: 50, normal: 60, hard: 75 } },
  { key: 'powerupChance', label: '道具機率', unit: '', min: 0, max: 0.5, step: 0.01, group: '關卡',
    desc: '每段地形出現加速／磁鐵／巨大化的機率', def: { easy: 0.12, normal: 0.09, hard: 0.07 } },
  { key: 'skillUpChance', label: '技能升級券機率', unit: '', min: 0, max: 0.3, step: 0.01, group: '關卡',
    desc: '每段地形出現技能升級券（技能書）的機率；吃到大絕招升一級（最高 Lv.5）。提早打倒 BOSS 必掉一本', def: { easy: 0.1, normal: 0.09, hard: 0.07 } },
  { key: 'scoreMultiplier', label: '分數倍率', unit: '×', min: 0.5, max: 5, step: 0.1, group: '關卡',
    desc: '這個頻道的分數乘數', def: { easy: 1, normal: 1.5, hard: 2 } },
];

export function defaultChannelParams(id) {
  const o = {};
  for (const p of PARAMS) o[p.key] = p.def[id];
  return o;
}

export function defaultConfig() {
  const channels = {};
  for (const c of CHANNELS) channels[c.id] = defaultChannelParams(c.id);
  return { version: 1, updatedAt: null, announcement: '', channels };
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// 把外部（config.json、GM 匯入）的設定整理成合法數值；缺的補預設、超出範圍的夾住。
export function sanitizeConfig(raw) {
  const base = defaultConfig();
  if (!raw || typeof raw !== 'object') return base;
  base.updatedAt = typeof raw.updatedAt === 'string' ? raw.updatedAt : null;
  base.announcement = typeof raw.announcement === 'string' ? raw.announcement.slice(0, 200) : '';
  for (const c of CHANNELS) {
    const src = (raw.channels && raw.channels[c.id]) || {};
    for (const p of PARAMS) {
      const v = Number(src[p.key]);
      if (Number.isFinite(v)) base.channels[c.id][p.key] = clamp(v, p.min, p.max);
    }
  }
  return base;
}

// 依關卡（從 1 開始）算出該關實際使用的數值。
export function stageParams(ch, stage) {
  const n = Math.max(0, stage - 1);
  return {
    speed: Math.min(ch.maxSpeed, ch.baseSpeed + ch.speedPerStage * n),
    hpMax: ch.hpMax,
    hpDrain: ch.hpDrain + ch.hpDrainPerStage * n,
    density: Math.min(1, ch.obstacleDensity + ch.densityPerStage * n),
    damage: ch.obstacleDamage * (1 + 0.05 * n),
    pitChance: Math.min(0.6, ch.pitChance * (1 + 0.12 * n)),
    pitDamage: ch.pitDamage,
    potionInterval: ch.potionInterval * (1 + 0.04 * n),
    stageLength: ch.stageLength * (1 + 0.08 * n),
    bossDuration: ch.bossDuration + Math.min(10, n),
    bossFireRate: ch.bossFireRate * (1 + 0.1 * n),
    bossHp: Math.round(ch.bossHp * (1 + 0.12 * n)),
    powerupChance: ch.powerupChance,
    skillUpChance: ch.skillUpChance,
    scoreMultiplier: ch.scoreMultiplier,
  };
}
