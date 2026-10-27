// 職業大絕招：每個職業一招，放下去畫面會有明顯變化（震動、變色、滿畫面特效）。
// 特效圖是 sk-<職業>（scripts/fetch_sprites.py 從楓之谷資料下載）：icon、effect、hit，以及各招需要的 tile / ball。
// 冷卻時間到才能再放；打倒怪物會縮短冷卻。
// 吃到「技能升級券」大絕招升一級（Lv.1～5）：冷卻 -8%、對 BOSS 傷害 +20%、特效變大，Lv.3 / Lv.5 解鎖新效果（見 LEVEL_PERKS）。

import { VIEW_W, GROUND_Y } from './physics.js';
import { actionDuration } from './sprites.js';
import { sfx } from './audio.js';

const KILL = 9; // 一般怪、高大怪都一招打倒
export const MAX_LEVEL = 5;
const lerp = (a, b, t) => a + (b - a) * t;

// 每個職業升級後多了什麼（顯示在升級提示與說明）
export const LEVEL_PERKS = {
  warrior: { 3: '衝刺終點放出衝擊波', 5: '衝擊波範圍變大、衝得更遠' },
  magician: { 3: '冰柱落得更快、凍更久', 5: '暴風雪持續更久' },
  archer: { 3: '同時射出 2 排箭', 5: '同時射出 3 排箭' },
  thief: { 3: '爆炸範圍變大、楓幣 3 倍', 5: '楓幣 4 倍' },
  pirate: { 3: '一次丟出 2 個炸彈桶', 5: '一次丟出 3 個炸彈桶' },
};

export function initSkill(g) {
  // 開場就先充一部分，不用等滿一整輪
  g.skill = { level: 1, cd: g.job.skill.cooldown * 0.4, active: null, queue: [], tint: null, flash: 0 };
}

const lv = (g) => g.skill.level;
export const skillCooldown = (g) => g.job.skill.cooldown * (1 - 0.08 * (lv(g) - 1));
const bossMul = (g) => 1 + 0.2 * (lv(g) - 1);
const fxMul = (g) => 1 + 0.1 * (lv(g) - 1);

export const skillReady = (g) => 1 - g.skill.cd / skillCooldown(g);

// 吃到技能升級券
export function levelUp(g) {
  const s = g.skill;
  if (s.level >= MAX_LEVEL) {
    s.cd = 0;
    g.text(g.px, g.player.y - 150, '已滿級！冷卻重置', '#ffe082', 1.4);
  } else {
    s.level++;
    s.cd = Math.min(s.cd, skillCooldown(g));
    const perk = LEVEL_PERKS[g.job.id][s.level];
    g.banner = { text: `${g.job.skill.name} 升到 Lv.${s.level}！${perk ? ` ${perk}` : ''}`, t: 2 };
    g.text(g.px, g.player.y - 150, `技能 Lv.${s.level}`, '#ffe082', 1.4);
  }
  g.burst(g.px, g.player.y - 50, '#ffd54f', 16);
  sfx.levelUp();
}

export function castSkill(g) {
  const s = g.skill;
  if (!s || g.phase === 'over' || g.paused || s.cd > 0 || s.active || g.player.sliding) return false;
  s.cd = skillCooldown(g);
  s.active = { t: 0, dur: 0.5, hit: new Set() };
  g.anim.attack = actionDuration(g.job.key, 'attack') || 0.33;
  g.anim.action = 'attack';
  g.anim.t = 0;
  g.text(g.px, g.player.y - 140, `${g.job.skill.name}${s.level > 1 ? ` Lv.${s.level}` : ''}！`, '#fff59d', 1.3);
  sfx.skill();
  CAST[g.job.id](g, s.active, s.level);
  return true;
}

// 打倒怪會縮短大絕招冷卻
export function onKill(g) {
  if (g.skill && !g.skill.active) g.skill.cd = Math.max(0, g.skill.cd - 0.8);
}

const later = (g, delay, fn) => g.skill.queue.push({ at: g.skill.active.t + delay, fn });
const screenMobs = (g) => g.gen.mobs.filter((m) => g.alive(m) && m.x - g.worldX < VIEW_W + 20 && m.x + m.w - g.worldX > 0);
const skFx = (g, action, x, y, scale, extra = {}) =>
  g.effects.push({ key: `sk-${g.job.id}`, action, t: 0, x, y, scale: scale * fxMul(g), flip: true, ...extra });
const hitSk = (g, m) => g.hitMob(m, KILL, { key: `sk-${g.job.id}`, scale: 0.45 });
const hitBossSk = (g, dmg, scale) => g.hitBoss(dmg * bossMul(g), { key: `sk-${g.job.id}`, scale });
const bossBox = (g) => (g.boss && !g.boss.leaving ? g.bossLayout().box : null);
const near = (box, x, r) => box && x + r > box.x0 && x - r < box.x1;
const killAround = (g, x, r) => {
  for (const m of screenMobs(g)) {
    const b = g.mobBox(m);
    if (Math.abs((b.x0 + b.x1) / 2 - x) < r) hitSk(g, m);
  }
};

const CAST = {
  // 劍士「突進」：往前衝過大半個畫面，沿途的怪全部撞飛，衝完人就停在前面（可以直接貼近 BOSS）
  // Lv.3 起衝刺終點放出衝擊波，Lv.5 衝得更遠、衝擊波更大
  warrior(g, a, level) {
    a.dur = 0.55;
    a.from = g.px;
    const bb = bossBox(g);
    const dist = 380 + 60 * (level - 1);
    a.to = Math.min(VIEW_W - 180, bb ? Math.max(g.px + 200, bb.x0 - 70) : g.px + dist);
    a.wave = level >= 5 ? 260 : level >= 3 ? 180 : 0;
    g.player.inv = Math.max(g.player.inv, 0.9);
    g.shake(0.45, 9);
    skFx(g, 'effect', 0, 0, 0.75, { follow: true });
  },
  // 法師「暴風雪」：畫面變冰藍、下雪，冰柱一根根砸在怪物身上；BOSS 被凍住不能行動，BOSS 的招式全碎
  // 每級持續 +0.5 秒、冰柱更密
  magician(g, a, level) {
    a.dur = 3 + 0.5 * (level - 1);
    a.next = 0.15;
    a.every = 0.22 - 0.025 * (level - 1);
    g.skill.tint = { color: '120,200,255', alpha: 0.32, t: 0, dur: a.dur + 0.2 };
    g.projectiles = [];
    if (g.boss && !g.boss.leaving) g.boss.frozen = a.dur;
    skFx(g, 'effect', 0, 0, 0.55, { follow: true });
    g.shake(0.3, 5);
  },
  // 弓箭手「暴風神射」：連射穿透箭，每級持續 +0.5 秒；Lv.3 兩排、Lv.5 三排
  archer(g, a, level) {
    a.dur = 3 + 0.5 * (level - 1);
    a.next = 0;
    a.rows = level >= 5 ? [-46, -20, -72] : level >= 3 ? [-34, -60] : [-46];
    g.skill.tint = { color: '180,255,200', alpha: 0.1, t: 0, dur: a.dur, wind: true };
    skFx(g, 'effect', 40, -50, 0.42, { follow: true, loopUntil: a.dur });
  },
  // 盜賊「楓幣炸彈」：畫面上所有楓幣同時引爆（楓幣照收而且加倍），炸到附近的怪；楓幣越多傷害越高
  // Lv.3 起爆炸範圍變大、楓幣 3 倍，Lv.5 楓幣 4 倍
  thief(g, a, level) {
    a.dur = 1;
    g.skill.flash = 0.25;
    g.skill.flashColor = '200,120,255';
    g.shake(0.4, 7);
    skFx(g, 'effect', 0, 0, 0.6, { follow: true });
    const radius = 110 + 20 * (level - 1);
    const mul = level >= 5 ? 4 : level >= 3 ? 3 : 2;
    const coins = g.gen.items.filter((it) => !it.taken && it.type !== 'power' && it.type !== 'potion' && it.type !== 'skillup'
      && it.x - g.worldX > -20 && it.x - g.worldX < VIEW_W + 20);
    const mesoBonus = g.job.mesoBonus || 1;
    let bossDmg = 0;
    for (const it of coins) {
      it.taken = true;
      const sx = it.x - g.worldX;
      const v = Math.round((it.type === 'bag' ? 100 : it.type === 'item' ? 30 : 10) * g.stage * mesoBonus * mul);
      g.meso += v;
      g.addScore(v);
      const delay = Math.max(0, sx - g.px) / 1800; // 從角色往前一路炸過去
      const wx = it.x;
      later(g, delay, () => {
        const cx = wx - g.worldX;
        skFx(g, 'hit', 0, it.y + 30, 0.4, { wx });
        for (const m of screenMobs(g)) {
          const b = g.mobBox(m);
          if (Math.abs((b.x0 + b.x1) / 2 - cx) < radius && Math.abs((b.y0 + b.y1) / 2 - it.y) < radius + 20) hitSk(g, m);
        }
      });
      if (near(bossBox(g), sx, 200)) bossDmg += 1;
    }
    if (bossBox(g)) later(g, 0.35, () => hitBossSk(g, Math.min(30, 6 + bossDmg), 0.6));
    g.text(g.px + 60, g.player.y - 110, `引爆 ${coins.length} 枚楓幣（×${mul}）`, '#e1bee7', 1.2);
  },
  // 海盜「炸彈桶」：丟出燃燒的大木桶在地上滾，撞飛沿途的怪，碰到 BOSS 或滾到畫面邊緣時大爆炸
  // Lv.3 兩個、Lv.5 三個（一個接一個丟）
  pirate(g, a, level) {
    a.dur = 4;
    a.barrels = [];
    a.radius = 230 + 20 * (level - 1);
    const n = level >= 5 ? 3 : level >= 3 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      later(g, i * 0.35, () => {
        a.barrels.push({ x: g.px + 50, vx: 620, hit: new Set() });
        skFx(g, 'effect', 0, 0, 0.55, { follow: true });
      });
    }
    a.total = n;
  },
};

const UPDATE = {
  warrior(g, a) {
    const k = Math.min(1, a.t / 0.35);
    const prev = g.px;
    g.px = lerp(a.from, a.to, 1 - (1 - k) * (1 - k));
    const area = { x0: Math.min(prev, a.from) - 20, x1: g.px + 70, y0: g.player.y - 160, y1: g.player.y + 12 };
    for (const m of screenMobs(g)) {
      if (!a.hit.has(m) && overlapBox(area, g.mobBox(m))) { a.hit.add(m); hitSk(g, m); }
    }
    for (const pr of g.projectiles) if (pr.x > area.x0 && pr.x < area.x1 + 40) pr.hit = true;
    const bb = bossBox(g);
    if (!a.bossHit && bb && area.x1 + 60 > bb.x0) {
      a.bossHit = true;
      hitBossSk(g, 25, 0.7);
    }
    // Lv.3 起：衝到終點放出衝擊波
    if (a.wave && k >= 1 && !a.waved) {
      a.waved = true;
      const x = g.px + 90;
      g.shake(0.35, 10);
      skFx(g, 'hit', x, g.player.y - 20, a.wave / 200);
      killAround(g, x, a.wave);
      for (const pr of g.projectiles) if (Math.abs(pr.x - x) < a.wave) pr.hit = true;
      if (near(bossBox(g), x, a.wave)) hitBossSk(g, 10, 0.6);
    }
  },
  magician(g, a, dt) {
    a.next -= dt;
    if (a.next <= 0 && a.t < a.dur - 0.3) {
      a.next = a.every;
      // 優先砸還沒被砸的怪，其次砸 BOSS，都沒有就隨機
      const target = screenMobs(g).find((m) => !a.hit.has(m));
      const bb = bossBox(g);
      let x, onBoss = false;
      if (target) { a.hit.add(target); x = target.x + target.w / 2 - g.worldX; }
      else if (bb && (a.bossTurn = !a.bossTurn)) { x = lerp(bb.x0, bb.x1, 0.3 + Math.random() * 0.4); onBoss = true; }
      else x = g.px + 80 + Math.random() * (VIEW_W - g.px - 120);
      // 冰柱落在地面上（世界座標），BOSS 不會跟著地面捲動，所以打 BOSS 的用畫面座標
      const wx = x + g.worldX;
      skFx(g, 'tile', onBoss ? x : 0, GROUND_Y + 10, 0.5, onBoss ? {} : { wx });
      later(g, 0.3, () => {
        g.shake(0.12, 3);
        const cx = onBoss ? x : wx - g.worldX;
        if (target && g.alive(target)) hitSk(g, target);
        killAround(g, cx, 80);
        if (near(bossBox(g), cx, 40)) hitBossSk(g, 4, 0.5);
      });
    }
  },
  archer(g, a, dt) {
    a.next -= dt;
    if (a.next <= 0 && a.t < a.dur) {
      a.next = 0.07;
      for (const dy of a.rows) {
        g.shots.push({
          x: g.px + 30, y: g.player.y + dy + (Math.random() - 0.5) * 8, delay: 0, vx: 1600, left: 900,
          pierce: 99, hit: new Set(), r: 16, sk: true, power: 1, bossDmg: 0.6 * bossMul(g) / a.rows.length,
          hitFx: { key: 'sk-archer', scale: 0.35 },
        });
      }
    }
  },
  thief() {},
  pirate(g, a, dt) {
    for (const b of a.barrels) {
      if (b.done) continue;
      b.x += b.vx * dt;
      const area = { x0: b.x - 55, x1: b.x + 55, y0: GROUND_Y - 130, y1: GROUND_Y };
      for (const m of screenMobs(g)) {
        if (!b.hit.has(m) && overlapBox(area, g.mobBox(m))) { b.hit.add(m); hitSk(g, m); }
      }
      for (const pr of g.projectiles) if (Math.abs(pr.x - b.x) < 60) pr.hit = true;
      const bb = bossBox(g);
      if ((bb && b.x + 50 > bb.x0) || b.x > VIEW_W - 60) {
        // 大爆炸
        b.done = true;
        g.shake(0.6, 12);
        g.skill.flash = 0.2;
        g.skill.flashColor = '255,170,80';
        skFx(g, 'hit', b.x, GROUND_Y - 20, 1.4);
        killAround(g, b.x, a.radius);
        for (const pr of g.projectiles) if (Math.abs(pr.x - b.x) < a.radius) pr.hit = true;
        if (near(bossBox(g), b.x, a.radius + 30)) hitBossSk(g, 30 / Math.sqrt(a.total), 0.8);
      }
    }
    if (a.barrels.length === a.total && a.barrels.every((b) => b.done)) a.dur = Math.min(a.dur, a.t + 0.6);
  },
};

export function updateSkill(g, dt) {
  const s = g.skill;
  if (!s) return;
  if (s.tint) { s.tint.t += dt; if (s.tint.t >= s.tint.dur) s.tint = null; }
  s.flash = Math.max(0, s.flash - dt);
  if (g.boss && g.boss.frozen > 0) g.boss.frozen -= dt;
  const a = s.active;
  if (!a) { s.cd = Math.max(0, s.cd - dt); return; }
  a.t += dt;
  UPDATE[g.job.id](g, a, dt);
  for (const q of s.queue) if (!q.done && a.t >= q.at) { q.done = true; q.fn(); }
  s.queue = s.queue.filter((q) => !q.done);
  if (a.t >= a.dur && !s.queue.length) s.active = null;
}

// 畫面效果：染色、下雪、風、閃光、滾動的炸彈桶
export function drawSkill(g, c, drawSprite) {
  const s = g.skill;
  if (!s) return;
  const a = s.active;
  if (a && a.barrels) {
    for (const b of a.barrels) if (!b.done) drawSprite(c, 'sk-pirate', 'ball', a.t, b.x, GROUND_Y - 40, 0.55 * fxMul(g), { flip: true });
  }
  if (s.tint) {
    const k = Math.min(1, s.tint.t / 0.2, (s.tint.dur - s.tint.t) / 0.4);
    c.fillStyle = `rgba(${s.tint.color},${s.tint.alpha * k})`;
    c.fillRect(-20, -20, VIEW_W + 40, 600);
    if (g.job.id === 'magician') {
      // 下雪
      c.fillStyle = `rgba(255,255,255,${0.85 * k})`;
      for (let i = 0; i < 70; i++) {
        const x = (i * 137 + g.time * (30 + (i % 5) * 12)) % VIEW_W;
        const y = (i * 53 + g.time * (90 + (i % 7) * 20)) % 560 - 20;
        c.fillRect(x, y, 3 + (i % 3), 3 + (i % 3));
      }
    }
    if (s.tint.wind) {
      // 風的線條
      c.strokeStyle = `rgba(255,255,255,${0.5 * k})`;
      c.lineWidth = 2;
      for (let i = 0; i < 14; i++) {
        const y = 60 + ((i * 71) % 400);
        const x = VIEW_W - ((g.time * 1400 + i * 211) % (VIEW_W + 300));
        c.beginPath(); c.moveTo(x, y); c.lineTo(x + 120 + (i % 4) * 40, y); c.stroke();
      }
    }
  }
  if (s.flash > 0) {
    c.fillStyle = `rgba(${s.flashColor},${Math.min(0.55, s.flash * 2.2)})`;
    c.fillRect(-20, -20, VIEW_W + 40, 600);
  }
  if (g.boss && g.boss.frozen > 0 && !g.boss.leaving) {
    const bb = g.bossLayout().box;
    c.fillStyle = 'rgba(150,220,255,0.35)';
    c.fillRect(bb.x0, bb.y0, bb.x1 - bb.x0, bb.y1 - bb.y0);
    c.fillStyle = '#e1f5fe';
    c.font = 'bold 16px sans-serif';
    c.textAlign = 'center';
    c.fillText('冰凍中', (bb.x0 + bb.x1) / 2, bb.y0 - 6);
  }
}

function overlapBox(a, b) {
  return a.x1 > b.x0 && a.x0 < b.x1 && a.y1 > b.y0 && a.y0 < b.y1;
}
