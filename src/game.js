// 遊戲本體：迴圈、物理、碰撞、繪圖。畫面以 960x540 邏輯解析度繪製，再依螢幕縮放。

import {
  VIEW_W, VIEW_H, GROUND_Y, PLAYER_X, PLAYER_H, PLAYER_SLIDE_H, PLAYER_W,
  GRAVITY, JUMP_V, DOUBLE_JUMP_V, FLY_CLEARANCE, makeRng,
} from './physics.js';
import { stageParams } from './params.js';
import { themeForStage, THEMES, ITEM_ICONS } from './themes.js';
import { LevelGen } from './level.js';
import { loadAll, getImage } from './assets.js';
import { drawSprite, refFrame, aspectOf, actionDuration, loadSheets, previewSrc } from './sprites.js';
import { sfx } from './audio.js';
import { initSkill, castSkill, updateSkill, drawSkill, onKill, skillReady } from './skills.js';

const POWER_TIME = { dash: 4, magnet: 8, giant: 5 };
const POWER_LABEL = { dash: '加速', magnet: '磁鐵', giant: '巨大化' };
const lerp = (a, b, t) => a + (b - a) * t;

const SPIN_TIME = 0.38; // 二段跳翻滾一圈的時間
export const MOVE_SPEED = 300; // 左右移動速度（相對畫面）
export const PX_MIN = 70;
export const PX_MAX = VIEW_W - 180;
const PLAYER_SCALE = 1.2;

export function preloadGameAssets(job) {
  const keys = [job.key, `fx-${job.id}`, `sk-${job.id}`];
  const srcs = ['assets/items/haste.png', previewSrc(`sk-${job.id}`), ...ITEM_ICONS];
  for (const t of THEMES) {
    for (const m of [...t.ground_mobs, ...t.tall_mobs, ...t.fly_mobs]) keys.push(m.key);
    keys.push(t.boss.key);
    srcs.push(previewSrc(t.boss.key));
  }
  return Promise.all([loadSheets([...new Set(keys)]), loadAll(srcs)]);
}

export class Game {
  constructor(canvas, { channel, channelParams, job, onEnd, seed }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.channel = channel;
    this.cp = channelParams;
    this.job = job;
    this.onEnd = onEnd;
    this.rng = makeRng(seed ?? (Math.random() * 2 ** 32) >>> 0);

    this.stage = 1;
    this.sp = stageParams(this.cp, 1);
    this.theme = themeForStage(1);
    this.prevTheme = null;
    this.themeFade = 1;

    this.worldX = 0;
    this.distance = 0;
    this.stageStart = 0;
    this.time = 0;
    this.score = 0;
    this.meso = 0;
    this.smashed = 0;

    const hpMax = Math.round(this.sp.hpMax * (job.hpBonus || 1));
    this.player = {
      y: GROUND_Y, vy: 0, jumps: 0, onGround: true, sliding: false,
      hp: hpMax, hpMax, inv: 0, hurtFlash: 0,
      power: { dash: 0, magnet: 0, giant: 0 },
    };
    this.maxJumps = job.maxJumps || 2;

    this.phase = 'run'; // run | boss | clear | over
    this.boss = null;
    this.projectiles = [];
    this.particles = [];
    this.texts = [];
    this.banner = { text: `STAGE 1 ・ ${this.theme.name}`, t: 2.2 };

    this.gen = new LevelGen({ rng: this.rng, params: this.sp, theme: this.theme, aspect: aspectOf, startX: 0 });
    // 角色動畫狀態：目前動作、動作經過時間、翻滾／攻擊／受傷的剩餘時間
    this.anim = { action: 'walk', t: 0, spin: 0, attack: 0, hurt: 0 };
    this.fxKey = `fx-${job.id}`;
    this.attackCd = 0;
    this.shots = []; // 玩家的飛行道具（畫面座標）
    this.effects = []; // 技能特效、命中火花

    this.paused = false;
    this.running = false;
    this.keys = { slide: false, attack: false, left: false, right: false };
    this.px = PLAYER_X; // 角色在畫面上的 x，可以左右移動
    this.shakeT = 0;
    this.shakePower = 0;
    initSkill(this);
    this.last = 0;
    this.frame = this.frame.bind(this);
  }

  // ---------- 生命週期 ----------
  start() {
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this.frame);
  }

  stop() { this.running = false; }

  setPaused(v) {
    this.paused = v;
    if (!v) this.last = performance.now();
  }

  frame(now) {
    if (!this.running) return;
    const dt = Math.min(0.033, (now - this.last) / 1000);
    this.last = now;
    if (!this.paused) this.update(dt);
    this.draw();
    this.onFrame?.(this);
    requestAnimationFrame(this.frame);
  }

  // ---------- 輸入 ----------
  jump() {
    if (this.phase === 'over' || this.paused) return;
    const p = this.player;
    if (p.jumps >= this.maxJumps) return;
    const bonus = this.job.jumpBonus || 1;
    p.vy = -(p.jumps === 0 ? JUMP_V : DOUBLE_JUMP_V) * bonus;
    p.jumps++;
    p.onGround = false;
    sfx.jump();
    if (p.jumps > 1) {
      this.burst(this.px, p.y, '#ffffff', 6);
      this.anim.spin = SPIN_TIME;
    }
  }

  setSlide(v) { this.keys.slide = v; }

  // 大絕招（K / L 或「技能」按鈕）
  castSkill() { return castSkill(this); }
  get skillReady() { return skillReady(this); }

  // 左右移動：往右可以主動靠近 BOSS（風險是反應時間變短、可能撞到 BOSS）
  setMove(dir, v) { this.keys[dir] = v; }

  shake(t, power) {
    this.shakeT = Math.max(this.shakeT, t);
    this.shakePower = Math.max(this.shakePower, power);
  }

  // 按住攻擊鍵會依冷卻時間連續攻擊（跟楓之谷一樣）
  setAttack(v) {
    this.keys.attack = v;
    if (v) this.attack();
  }

  attack() {
    const p = this.player;
    const atk = this.job.attack;
    if (!atk || this.phase === 'over' || this.paused || this.attackCd > 0 || p.sliding) return false;
    this.attackCd = atk.cooldown;
    this.anim.attack = actionDuration(this.job.key, 'attack') || 0.33;
    this.anim.t = 0;
    this.anim.action = 'attack';
    sfx[atk.sound]?.();
    const big = this.giant ? 1.8 : 1;
    this.effects.push({ key: this.fxKey, action: 'effect', t: 0, x: 0, y: 0, follow: true, scale: atk.fxScale * big, flip: true });
    if (atk.type === 'melee') {
      this.meleeHit(atk, big);
    } else {
      const count = atk.count || 1;
      for (let i = 0; i < count; i++) {
        this.shots.push({
          x: this.px + 20, y: p.y - 46 * big + (count > 1 ? (i - 0.5) * 16 : 0), delay: i * 0.08,
          vx: atk.speed, left: atk.range, pierce: atk.pierce || 0, hit: new Set(), r: atk.ballR * big,
        });
      }
    }
    return true;
  }

  // 怪物在畫面上的碰撞框（比圖小一點，比較不會「明明沒碰到卻受傷」）
  mobBox(m) {
    const sx = m.x - this.worldX;
    const bob = m.kind === 'fly' ? Math.sin(this.time * 4 + m.bob) * 6 : 0;
    return { x0: sx + m.w * 0.18, x1: sx + m.w * 0.82, y0: m.bottom - m.h * 0.85 + bob, y1: m.bottom - m.h * 0.05 + bob };
  }

  alive(m) { return !m.dead && m.dying == null; }

  meleeHit(atk, big) {
    const p = this.player;
    const area = { x0: this.px - 20, x1: this.px + atk.range * big, y0: p.y - atk.top * big, y1: p.y + 12 };
    const targets = this.gen.mobs
      .filter((m) => this.alive(m) && overlap(area, this.mobBox(m)))
      .sort((a, b) => a.x - b.x)
      .slice(0, atk.targets);
    for (const m of targets) this.hitMob(m, atk.power);
    const bb = this.boss && this.bossLayout().box;
    if (bb && !this.boss.leaving && overlap(area, bb)) this.hitBoss(atk.bossDmg);
    // 格擋：揮砍範圍內的 BOSS 攻擊直接打掉
    for (const pr of this.projectiles) {
      if (pr.hit || pr.wave || !overlap(area, { x0: pr.x - pr.r, x1: pr.x + pr.r, y0: pr.y - pr.r, y1: pr.y + pr.r })) continue;
      pr.hit = true;
      this.parried = (this.parried || 0) + 1;
      this.effects.push({ key: this.fxKey, action: 'hit', t: 0, x: pr.x, y: pr.y + 20, scale: atk.hitScale * 0.8, flip: true });
      this.text(pr.x, pr.y - 30, '格擋！', '#80d8ff', 0.7);
      this.addScore(50 * this.stage);
    }
  }

  // 傷害數字只是好看：依關卡變大，偶爾暴擊
  rollDamage() {
    const atk = this.job.attack;
    const crit = this.rng() < 0.2;
    const v = Math.round(atk.dmg * (1 + 0.18 * (this.stage - 1)) * lerp(0.85, 1.15, this.rng()) * (crit ? 1.6 : 1));
    return { v, crit };
  }

  damageNumber(x, y) {
    const { v, crit } = this.rollDamage();
    this.texts.push({ x: x + (this.rng() - 0.5) * 16, y, str: String(v), color: crit ? '#ff6ec7' : '#ffb320', life: 0.8, max: 0.8, dmg: true, crit });
  }

  // fx：命中火花的圖（預設是普通攻擊的；大絕招會帶自己的）
  hitMob(m, power, fx) {
    const b = this.mobBox(m);
    const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    this.effects.push({ key: fx ? fx.key : this.fxKey, action: 'hit', t: 0, x: cx, y: cy + 20, scale: fx ? fx.scale : this.job.attack.hitScale, flip: true });
    this.damageNumber(cx, b.y0 - 10);
    m.hp = (m.hp ?? (m.kind === 'tall' ? 2 : 1)) - power;
    if (m.hp > 0) {
      m.hitT = 0.3;
      m.x += 22; // 被打退一點
      sfx.mobHit();
      return;
    }
    m.dying = 0;
    this.smashed++;
    onKill(this);
    this.addScore(150 * this.stage);
    sfx.smash();
    // 打倒的怪掉一袋楓幣
    this.gen.items.push({ type: 'bag', x: m.x + m.w / 2, y: GROUND_Y - 30, r: 15 });
  }

  hitBoss(dmg, fx) {
    if (!this.boss || this.boss.leaving) return;
    const bb = this.bossLayout().box;
    const cx = bb.x0 + (bb.x1 - bb.x0) * 0.35, cy = (bb.y0 + bb.y1) / 2;
    this.effects.push({ key: fx ? fx.key : this.fxKey, action: 'hit', t: 0, x: cx, y: cy + 20, scale: fx ? fx.scale : this.job.attack.hitScale, flip: true });
    this.damageNumber(cx, bb.y0 + 20);
    this.boss.hitT = 0.2;
    this.boss.hp -= dmg;
    this.addScore(40 * this.stage);
    sfx.mobHit();
    if (this.boss.hp <= 0) this.clearStage(true);
  }

  // BOSS 在畫面上的位置（腳底 x、縮放、碰撞框），繪圖和攻擊判定共用
  bossLayout() {
    const b = this.boss;
    const ref = refFrame(b.key);
    const scale = ref ? b.h / ref.h : 1;
    const right = ref ? (ref.w - ref.ox) * scale : b.h / 2;
    const left = ref ? ref.ox * scale : b.h / 2;
    const home = VIEW_W - 24 - right;
    const near = this.px + 105 + left * 0.8; // 衝過來時停在角色前方，剛好在近戰範圍內
    const fx = lerp(home, near, b.advance || 0) + (1 - Math.min(1, b.t)) * 300 + (b.leaving && !b.defeated ? b.leaving * 500 : 0);
    return { fx, scale, box: { x0: fx - left * 0.8, x1: fx + right * 0.8, y0: GROUND_Y - b.h * 0.9, y1: GROUND_Y } };
  }

  updateShots(dt) {
    const atk = this.job.attack;
    for (const s of this.shots) {
      if (s.delay > 0) { s.delay -= dt; continue; }
      const step = s.vx * dt;
      s.x += step;
      s.left -= step;
      const box = { x0: s.x - s.r, x1: s.x + s.r, y0: s.y - s.r, y1: s.y + s.r };
      for (const m of this.gen.mobs) {
        if (!this.alive(m) || s.hit.has(m) || !overlap(box, this.mobBox(m))) continue;
        s.hit.add(m);
        this.hitMob(m, s.power ?? atk.power, s.hitFx);
        if (s.pierce-- <= 0) { s.left = 0; break; }
      }
      const bb = this.boss && this.bossLayout().box;
      if (s.left > 0 && bb && !this.boss.leaving && overlap(box, bb)) { this.hitBoss(s.bossDmg ?? atk.bossDmg, s.hitFx); s.left = 0; }
    }
    this.shots = this.shots.filter((s) => s.left > 0 && s.x < VIEW_W + 40);
  }

  // ---------- 狀態 ----------
  get giant() { return this.player.power.giant > 0; }
  get playerWorldX() { return this.worldX + this.px; }
  get stageProgress() { return Math.min(1, (this.distance - this.stageStart) / this.sp.stageLength); }

  currentSpeed() {
    // 同一關裡也會慢慢加速，跑到關底時剛好接近下一關的速度
    const next = stageParams(this.cp, this.stage + 1);
    let s = lerp(this.sp.speed, next.speed, this.phase === 'run' ? this.stageProgress : 1);
    if (this.player.power.dash > 0) s *= 1.6;
    return s;
  }

  playerBox() {
    const p = this.player;
    const scale = this.giant ? 1.8 : 1;
    const h = (p.sliding ? PLAYER_SLIDE_H : PLAYER_H) * scale;
    const w = PLAYER_W * scale * (p.sliding ? 1.25 : 1);
    return { x0: this.px - w / 2, x1: this.px + w / 2, y0: p.y - h, y1: p.y };
  }

  // ---------- 更新 ----------
  update(dt) {
    this.time += dt;
    const p = this.player;
    if (this.banner) { this.banner.t -= dt; if (this.banner.t <= 0) this.banner = null; }
    if (this.themeFade < 1) this.themeFade = Math.min(1, this.themeFade + dt * 0.8);
    this.shakeT = Math.max(0, this.shakeT - dt);
    if (this.shakeT <= 0) this.shakePower = 0;
    this.updateFx(dt);
    if (this.phase === 'over') return;

    const speed = this.currentSpeed();
    const dx = speed * dt;
    this.worldX += dx;
    this.distance += dx;
    this.score += dx * 0.1 * this.sp.scoreMultiplier;

    this.gen.generateUntil(this.worldX + VIEW_W + 500);
    this.gen.prune(this.worldX - 300);

    for (const k of Object.keys(p.power)) p.power[k] = Math.max(0, p.power[k] - dt);
    p.inv = Math.max(0, p.inv - dt);
    p.hurtFlash = Math.max(0, p.hurtFlash - dt);

    this.attackCd = Math.max(0, this.attackCd - dt);
    if (this.keys.attack) this.attack();
    const move = (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0);
    if (move) this.px = Math.min(PX_MAX, Math.max(PX_MIN, this.px + move * MOVE_SPEED * dt));

    this.updatePlayer(dt);
    updateSkill(this, dt);
    this.updateShots(dt);
    this.updateMobs(dt);
    this.updateItems(dt);
    this.updatePhase(dt, speed);

    this.updateAnim(dt, speed);

    p.hp -= this.sp.hpDrain * dt;
    if (p.hp <= 0) this.gameOver('HP 歸零');
  }

  updatePlayer(dt) {
    const p = this.player;
    const prevY = p.y;
    p.vy += GRAVITY * dt;
    p.y += p.vy * dt;
    p.sliding = this.keys.slide && p.onGround;

    // 落地判定：地面與單向平台
    const wx0 = this.playerWorldX - PLAYER_W / 2 + 10;
    const wx1 = this.playerWorldX + PLAYER_W / 2 - 10;
    p.onGround = false;
    if (p.vy >= 0) {
      const surfaces = [...this.gen.allGrounds(), ...this.gen.platforms];
      for (const s of surfaces) {
        if (wx1 < s.x0 || wx0 > s.x1) continue;
        if (prevY <= s.y + 1 && p.y >= s.y) {
          p.y = s.y;
          p.vy = 0;
          p.jumps = 0;
          p.onGround = true;
          break;
        }
      }
    }

    if (p.y > VIEW_H + 120) this.fellInPit();
  }

  // 決定角色現在要播哪個動作：受傷 > 攻擊 > 趴下 > 跳躍 > 跑步
  playerAction() {
    const p = this.player, a = this.anim;
    if (this.phase === 'over' || a.hurt > 0) return 'alert';
    if (a.attack > 0) return 'attack';
    if (p.sliding) return 'prone';
    if (!p.onGround) return 'jump';
    return 'walk';
  }

  updateAnim(dt, speed) {
    const a = this.anim;
    a.spin = Math.max(0, a.spin - dt);
    a.attack = Math.max(0, a.attack - dt);
    a.hurt = Math.max(0, a.hurt - dt);
    const action = this.playerAction();
    if (action !== a.action) { a.action = action; a.t = 0; }
    // 跑越快腳步越快
    a.t += action === 'walk' ? dt * Math.max(1, speed / 330) : dt;
    if (this.boss) this.boss.attackT = Math.max(0, (this.boss.attackT || 0) - dt);
  }

  // 標題畫面的展示：角色在平地上一直跑，不會受傷
  demo(dt) {
    this.time += dt;
    this.worldX += 170 * dt;
    this.gen.boss = true;
    this.gen.generateUntil(this.worldX + VIEW_W + 500);
    this.gen.prune(this.worldX - 300);
    this.updateAnim(dt, 330);
  }

  fellInPit() {
    const p = this.player;
    this.damage(this.sp.pitDamage, true);
    if (this.phase === 'over') return;
    // 在下一塊地面上復活
    const next = this.gen.allGrounds().find((g) => g.x1 > this.playerWorldX + 60);
    if (next) {
      const target = Math.max(next.x0 + 40, this.playerWorldX);
      this.worldX = target - this.px;
    }
    p.y = GROUND_Y - 220;
    p.vy = 0;
    p.jumps = 1;
    p.inv = Math.max(p.inv, 1.8);
  }

  damage(amount, force = false) {
    const p = this.player;
    if (!force && (p.inv > 0 || this.giant || p.power.dash > 0)) return;
    p.hp -= amount;
    p.inv = 1.3;
    p.hurtFlash = 0.3;
    this.anim.hurt = 0.45;
    sfx.hit();
    this.text(this.px, p.y - 100, `-${Math.round(amount)}`, '#ff5252');
    if (p.hp <= 0) this.gameOver(force ? '掉進坑洞' : '被怪物打倒');
  }

  updateMobs() {
    const box = this.playerBox();
    for (const m of this.gen.mobs) {
      if (!this.alive(m)) continue;
      const sx = m.x - this.worldX;
      if (sx > VIEW_W || sx + m.w < 0) continue;
      if (!overlap(box, this.mobBox(m))) continue;
      if (this.giant || this.player.power.dash > 0) {
        m.dead = true;
        m.vx = 500; m.vy = -600; m.rot = 0;
        this.smashed++;
        this.addScore(200);
        if (this.anim.attack <= 0) this.anim.attack = actionDuration(this.job.key, 'attack') || 0.33;
        sfx.smash();
        this.burst(sx + m.w / 2, m.bottom - m.h / 2, '#ffd54f', 10);
      } else {
        this.damage(this.sp.damage);
      }
    }
  }

  updateItems(dt) {
    const p = this.player;
    const box = this.playerBox();
    const cx = this.playerWorldX;
    const cy = (box.y0 + box.y1) / 2;
    const magnet = p.power.magnet > 0;
    for (const it of this.gen.items) {
      if (it.taken) continue;
      if (magnet && it.type !== 'power') {
        const dx = cx - it.x, dy = cy - it.y;
        const d = Math.hypot(dx, dy);
        if (d < 280) {
          const pull = Math.min(d, 900 * dt);
          it.x += (dx / d) * pull;
          it.y += (dy / d) * pull;
        }
      }
      const sx = it.x - this.worldX;
      if (sx + it.r < box.x0 || sx - it.r > box.x1 || it.y + it.r < box.y0 || it.y - it.r > box.y1) continue;
      it.taken = true;
      this.collect(it, sx);
    }
  }

  collect(it, sx) {
    const p = this.player;
    const mesoBonus = this.job.mesoBonus || 1;
    switch (it.type) {
      case 'coin': {
        const v = Math.round(10 * this.stage * mesoBonus);
        this.meso += v;
        this.addScore(v);
        sfx.coin();
        break;
      }
      case 'bag': {
        const v = Math.round(100 * this.stage * mesoBonus);
        this.meso += v;
        this.addScore(v);
        this.text(sx, it.y - 20, `+${v} 楓幣`, '#ffe082');
        sfx.item();
        break;
      }
      case 'item':
        this.addScore(300);
        this.text(sx, it.y - 20, '+300', '#80deea');
        sfx.item();
        break;
      case 'potion': {
        const heal = it.kind === 'blue' ? 45 : 25;
        p.hp = Math.min(p.hpMax, p.hp + heal);
        this.text(sx, it.y - 20, `HP +${heal}`, '#ff8a80');
        sfx.potion();
        break;
      }
      case 'power': {
        p.power[it.kind] = POWER_TIME[it.kind] * (this.job.powerupBonus || 1);
        this.text(sx, it.y - 24, POWER_LABEL[it.kind] + '!', '#fff59d');
        sfx.power();
        break;
      }
    }
    this.burst(sx, it.y, it.type === 'potion' ? '#ff8a80' : '#ffe082', it.type === 'coin' ? 3 : 8);
  }

  addScore(v) { this.score += v * this.sp.scoreMultiplier; }

  updatePhase(dt, speed) {
    if (this.phase === 'run' && this.distance - this.stageStart >= this.sp.stageLength) {
      this.phase = 'boss';
      this.gen.boss = true;
      const t = this.theme;
      // mode：ranged＝站在遠處丟攻擊；charge＝衝到角色前方停一下（近戰的輸出機會）
      this.boss = {
        ...t.boss, t: 0, dur: this.sp.bossDuration, fire: 1.6, leaving: 0, attackT: 0,
        hp: this.sp.bossHp, maxHp: this.sp.bossHp, mode: 'ranged', modeT: 1.8, advance: 0,
      };
      this.banner = { text: `BOSS 出現！ ${t.boss.name}`, t: 2 };
    }

    if (this.phase === 'boss') {
      const b = this.boss;
      b.t += dt;
      if (b.t < b.dur && b.frozen > 0) {
        // 被法師的暴風雪凍住：不能移動也不能出招
      } else if (b.t < b.dur) {
        this.updateBossMode(b, dt);
        b.fire -= dt;
        // 角色貼太近：BOSS 放地面震波（不能格擋，只能跳過）
        const bbox = this.bossLayout().box;
        b.stomp = (b.stomp ?? 1) - dt;
        if (b.mode === 'ranged' && b.t > 1.2 && bbox.x0 - this.px < 230 && b.stomp <= 0) {
          b.stomp = 1.3;
          b.attackT = actionDuration(b.key, 'attack') || 0.6;
          this.projectiles.push({ x: bbox.x0 - 10, y: GROUND_Y - 14, vx: -520, r: 16, wave: true });
          this.shake(0.15, 3);
        }
        if (b.mode === 'ranged' && b.fire <= 0 && b.t > 1.2 && b.t < b.dur - 0.8) {
          b.fire = 1 / this.sp.bossFireRate * lerp(0.7, 1.3, this.rng());
          const high = this.rng() < 0.45;
          b.attackT = actionDuration(b.key, 'attack') || 0.6;
          this.projectiles.push({
            x: VIEW_W - 60 - b.h * 0.55, y: high ? GROUND_Y - FLY_CLEARANCE - 22 : GROUND_Y - 24,
            vx: -(speed * 0.6 + 260), r: 20, high,
          });
        }
      } else if (!b.leaving) {
        this.clearStage(false);
      }
    }

    if (this.phase === 'clear') {
      this.boss.leaving += dt;
      this.clearT -= dt;
      if (this.clearT <= 0) this.nextStage();
    }

    // BOSS 攻擊
    const box = this.playerBox();
    if (this.boss && !this.boss.leaving && this.phase === 'boss' && overlap(box, this.bossLayout().box)) {
      // 撞到 BOSS：受傷並被彈開
      const before = this.player.inv;
      this.damage(this.sp.damage);
      if (before <= 0) this.px = Math.max(PX_MIN, this.px - 150);
    }
    for (const pr of this.projectiles) {
      pr.x += pr.vx * dt;
      if (pr.hit) continue;
      if (pr.x + pr.r > box.x0 + 6 && pr.x - pr.r < box.x1 - 6 && pr.y + pr.r > box.y0 + 6 && pr.y - pr.r < box.y1) {
        pr.hit = true;
        this.damage(this.sp.damage);
      }
    }
    this.projectiles = this.projectiles.filter((p) => p.x > -50 && !p.hit);
  }

  // BOSS 的行動循環：遠處丟攻擊 1.6～2.2 秒 → 衝到前方停 1.5 秒 → 退回去
  updateBossMode(b, dt) {
    const IN = 0.35, HOLD = 1.5, TOTAL = IN * 2 + HOLD;
    b.modeT -= dt;
    if (b.mode === 'ranged') {
      if (b.modeT <= 0 && b.t > 1.5 && b.t < b.dur - 1) {
        b.mode = 'charge';
        b.modeT = TOTAL;
        this.text(VIEW_W - 220, 170, '衝過來了！', '#ff8a65', 1.2);
      }
    } else {
      const e = TOTAL - b.modeT;
      b.advance = e < IN ? e / IN : e < IN + HOLD ? 1 : Math.max(0, (TOTAL - e) / IN);
      if (e >= IN && e - dt < IN) b.attackT = actionDuration(b.key, 'attack') || 0.6; // 衝到定點時出招
      if (b.modeT <= 0) {
        b.mode = 'ranged';
        b.advance = 0;
        b.modeT = lerp(1.6, 2.2, this.rng());
        b.fire = 0.6;
      }
    }
  }

  // 過關：撐過時間，或提早打倒 BOSS（獎勵加倍）
  clearStage(defeated) {
    const b = this.boss;
    b.leaving = 0.01;
    b.defeated = defeated;
    b.advance = defeated ? b.advance : 0;
    this.projectiles = [];
    const bonus = (defeated ? 2000 : 1000) * this.stage;
    this.addScore(bonus);
    const label = defeated ? `擊敗 ${b.name}！` : 'STAGE CLEAR';
    this.text(VIEW_W / 2, 200, `${label}  +${Math.round(bonus * this.sp.scoreMultiplier)}`, '#fff176', 2);
    if (defeated) this.bossKills = (this.bossKills || 0) + 1;
    this.player.hp = Math.min(this.player.hpMax, this.player.hp + this.player.hpMax * 0.3);
    sfx.clear();
    this.phase = 'clear';
    this.clearT = 2;
  }

  nextStage() {
    this.stage++;
    this.sp = stageParams(this.cp, this.stage);
    this.prevTheme = this.theme;
    this.theme = themeForStage(this.stage);
    this.themeFade = 0;
    this.gen.setStage(this.sp, this.theme);
    this.gen.boss = false;
    this.stageStart = this.distance;
    this.phase = 'run';
    this.boss = null;
    const lap = Math.floor((this.stage - 1) / THEMES.length);
    this.banner = { text: `STAGE ${this.stage} ・ ${this.theme.name}${lap ? `（第 ${lap + 1} 輪）` : ''}`, t: 2.2 };
  }

  gameOver(reason) {
    if (this.phase === 'over') return;
    this.phase = 'over';
    this.player.hp = 0;
    sfx.over();
    setTimeout(() => {
      this.stop();
      this.onEnd?.({
        score: Math.round(this.score), meso: this.meso, stage: this.stage,
        distance: Math.round(this.distance / 10), smashed: this.smashed, bossKills: this.bossKills || 0, reason,
      });
    }, 1200);
  }

  // ---------- 特效 ----------
  burst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = this.rng() * Math.PI * 2, s = 80 + this.rng() * 200;
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 100, life: 0.5, color });
    }
  }

  text(x, y, str, color, life = 0.9) { this.texts.push({ x, y, str, color, life, max: life }); }

  updateFx(dt) {
    for (const q of this.particles) { q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 600 * dt; q.life -= dt; }
    this.particles = this.particles.filter((q) => q.life > 0);
    for (const t of this.texts) { t.y -= 40 * dt; t.life -= dt; }
    this.texts = this.texts.filter((t) => t.life > 0);
    for (const e of this.effects) e.t += dt;
    this.effects = this.effects.filter((e) => e.t < (e.loopUntil ?? (actionDuration(e.key, e.action) || 0.3)));
    if (this.boss) this.boss.hitT = Math.max(0, (this.boss.hitT || 0) - dt);
    for (const m of this.gen.mobs) {
      if (m.hitT > 0) m.hitT -= dt;
      if (m.dying != null) m.dying += dt;
      if (!m.dead) continue;
      m.x += m.vx * dt; m.bottom += m.vy * dt; m.vy += 1800 * dt; m.rot += 8 * dt;
    }
  }

  // ---------- 繪圖 ----------
  draw() {
    const c = this.ctx;
    const { canvas } = this;
    const scale = canvas.width / VIEW_W;
    let sx = 0, sy = 0;
    if (this.shakeT > 0) {
      sx = (Math.random() - 0.5) * this.shakePower * 2;
      sy = (Math.random() - 0.5) * this.shakePower * 2;
    }
    c.setTransform(scale, 0, 0, scale, sx * scale, sy * scale);
    c.imageSmoothingEnabled = true;

    this.drawBackground(this.theme, 1);
    if (this.prevTheme && this.themeFade < 1) {
      c.globalAlpha = 1 - this.themeFade;
      this.drawBackground(this.prevTheme, 1);
      c.globalAlpha = 1;
    }
    this.drawTerrain();
    this.drawItems();
    this.drawMobs();
    this.drawBoss();
    this.drawPlayer();
    this.drawShots();
    this.drawEffects();
    drawSkill(this, this.ctx, drawSprite);
    this.drawFx();
    this.drawHud();
  }

  drawBackground(t, alpha) {
    const c = this.ctx;
    const g = c.createLinearGradient(0, 0, 0, VIEW_H);
    g.addColorStop(0, t.sky[0]);
    g.addColorStop(1, t.sky[1]);
    c.fillStyle = g;
    c.fillRect(0, 0, VIEW_W, VIEW_H);

    // 雲
    c.fillStyle = 'rgba(255,255,255,0.55)';
    const cloudOff = (this.worldX * 0.05) % 1200;
    for (let i = 0; i < 5; i++) {
      const x = ((i * 260 - cloudOff) % 1200 + 1200) % 1200 - 120;
      const y = 50 + (i * 37) % 90;
      this.cloud(x, y, 1 + (i % 3) * 0.3);
    }

    // 遠景山丘
    c.fillStyle = t.far;
    c.beginPath();
    c.moveTo(0, VIEW_H);
    const off1 = this.worldX * 0.12;
    for (let x = 0; x <= VIEW_W; x += 16) {
      const wx = x + off1;
      c.lineTo(x, 300 - Math.sin(wx / 210) * 40 - Math.sin(wx / 87) * 14);
    }
    c.lineTo(VIEW_W, VIEW_H);
    c.fill();

    // 中景裝飾
    this.drawDeco(t);
  }

  cloud(x, y, s) {
    const c = this.ctx;
    c.beginPath();
    c.arc(x, y, 22 * s, 0, Math.PI * 2);
    c.arc(x + 26 * s, y - 10 * s, 28 * s, 0, Math.PI * 2);
    c.arc(x + 56 * s, y, 22 * s, 0, Math.PI * 2);
    c.fill();
  }

  drawDeco(t) {
    const c = this.ctx;
    const spacing = 180;
    const off = this.worldX * 0.35;
    const start = Math.floor(off / spacing) - 1;
    c.fillStyle = t.mid;
    for (let i = start; i < start + VIEW_W / spacing + 3; i++) {
      const x = i * spacing - off;
      const h = 60 + ((i * 7919) % 5) * 22;
      const base = GROUND_Y + 10;
      switch (t.deco) {
        case 'trees':
          c.fillRect(x + 36, base - h, 10, h);
          c.beginPath(); c.arc(x + 41, base - h, 38, 0, Math.PI * 2); c.fill();
          break;
        case 'tallTrees':
          c.fillRect(x + 30, base - h - 120, 18, h + 120);
          c.beginPath(); c.ellipse(x + 39, base - h - 130, 50, 70, 0, 0, Math.PI * 2); c.fill();
          break;
        case 'rocks':
          c.beginPath(); c.moveTo(x, base); c.lineTo(x + 50, base - h - 40); c.lineTo(x + 110, base - h); c.lineTo(x + 150, base); c.fill();
          break;
        case 'buildings':
          c.fillRect(x + 10, base - h - 90, 120, h + 90);
          c.fillStyle = 'rgba(255,230,120,0.5)';
          for (let wy = base - h - 75; wy < base - 20; wy += 28) for (let wx = x + 22; wx < x + 120; wx += 26) if (((wx + wy + i) | 0) % 3) c.fillRect(wx, wy, 12, 14);
          c.fillStyle = t.mid;
          break;
        case 'stalactites':
          c.beginPath(); c.moveTo(x, 0); c.lineTo(x + 30, 60 + h); c.lineTo(x + 60, 0); c.fill();
          c.beginPath(); c.moveTo(x + 80, base); c.lineTo(x + 105, base - h); c.lineTo(x + 130, base); c.fill();
          break;
        case 'snowPeaks':
          c.beginPath(); c.moveTo(x - 40, base); c.lineTo(x + 70, base - h - 80); c.lineTo(x + 180, base); c.fill();
          c.fillStyle = '#ffffff';
          c.beginPath(); c.moveTo(x + 48, base - h - 52); c.lineTo(x + 70, base - h - 80); c.lineTo(x + 92, base - h - 52); c.fill();
          c.fillStyle = t.mid;
          break;
        case 'blocks': {
          const colors = ['#ff9fce', '#9fd6ff', '#fff09f', '#c9a6ff'];
          for (let k = 0; k < 3; k++) {
            c.fillStyle = colors[(i + k) & 3];
            c.fillRect(x + 20 + k * 8, base - (k + 1) * 44 - (h % 40), 60, 40);
          }
          c.fillStyle = t.mid;
          break;
        }
      }
    }
  }

  drawTerrain() {
    const c = this.ctx;
    const t = this.theme;
    for (const g of this.gen.allGrounds()) {
      const x0 = g.x0 - this.worldX, x1 = g.x1 - this.worldX;
      if (x1 < 0 || x0 > VIEW_W) continue;
      c.fillStyle = t.ground;
      c.fillRect(x0, g.y, x1 - x0, VIEW_H - g.y);
      c.fillStyle = 'rgba(0,0,0,0.12)';
      const tileOff = this.worldX % 48;
      for (let x = x0 - ((x0 + tileOff) % 48); x < x1; x += 48) if (x > x0) c.fillRect(x, g.y + 14, 2, VIEW_H - g.y);
      c.fillStyle = t.grass;
      c.fillRect(x0, g.y - 4, x1 - x0, 16);
      c.fillStyle = 'rgba(0,0,0,0.15)';
      c.fillRect(x0, g.y + 12, x1 - x0, 3);
    }
    for (const pl of this.gen.platforms) {
      const x0 = pl.x0 - this.worldX, x1 = pl.x1 - this.worldX;
      if (x1 < 0 || x0 > VIEW_W) continue;
      c.fillStyle = t.ground;
      roundRect(c, x0, pl.y, x1 - x0, 24, 8);
      c.fill();
      c.fillStyle = t.grass;
      roundRect(c, x0 - 4, pl.y - 4, x1 - x0 + 8, 12, 6);
      c.fill();
    }
  }

  drawItems() {
    const c = this.ctx;
    for (const it of this.gen.items) {
      if (it.taken) continue;
      const x = it.x - this.worldX;
      if (x < -40 || x > VIEW_W + 40) continue;
      const y = it.y + Math.sin(this.time * 5 + it.x * 0.01) * 3;
      if (it.type === 'coin') drawCoin(c, x, y, it.r, this.time + it.x * 0.003);
      else if (it.type === 'bag') drawBag(c, x, y);
      else if (it.type === 'potion') drawPotion(c, x, y, it.kind);
      else if (it.type === 'item') {
        const img = getImage(it.icon);
        if (img) c.drawImage(img, x - 15, y - 15, 30, 30);
      } else if (it.type === 'power') this.drawPowerIcon(x, y, it.kind, 20);
    }
  }

  drawPowerIcon(x, y, kind, r) {
    const c = this.ctx;
    const pulse = 1 + Math.sin(this.time * 6) * 0.08;
    c.save();
    c.translate(x, y);
    c.scale(pulse, pulse);
    c.fillStyle = 'rgba(255,255,255,0.35)';
    c.beginPath(); c.arc(0, 0, r + 6, 0, Math.PI * 2); c.fill();
    const colors = { dash: '#29b6f6', magnet: '#ef5350', giant: '#ab47bc' };
    c.fillStyle = colors[kind];
    c.strokeStyle = '#fff';
    c.lineWidth = 3;
    c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill(); c.stroke();
    const img = kind === 'dash' && getImage('assets/items/haste.png');
    if (img) c.drawImage(img, -r * 0.7, -r * 0.7, r * 1.4, r * 1.4);
    else {
      c.fillStyle = '#fff';
      c.font = `bold ${r}px sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(kind === 'magnet' ? '磁' : kind === 'giant' ? '巨' : '速', 0, 1);
    }
    c.restore();
  }

  drawMobs() {
    const c = this.ctx;
    for (const m of this.gen.mobs) {
      const x = m.x - this.worldX;
      if (x > VIEW_W + 20 || x + m.w < -200) continue;
      const ref = refFrame(m.key);
      const s = ref ? m.h / ref.h : 1;
      const bob = m.kind === 'fly' && !m.dead ? Math.sin(this.time * 4 + m.bob) * 6 : 0;
      // 腳底位置：讓參考格剛好填滿碰撞框
      const fx = x + (ref ? ref.ox * s : m.w / 2);
      const fy = m.bottom - (ref ? (ref.h - ref.oy) * s : 0) + bob;
      if (m.dying != null) {
        // 被打倒：播放楓之谷的死亡動畫，播完淡出
        const dur = actionDuration(m.key, 'die') || 0.4;
        if (m.dying > dur + 0.25) continue;
        drawSprite(c, m.key, 'die', m.dying, fx, fy, s, { loop: false, alpha: Math.max(0, 1 - Math.max(0, m.dying - dur) / 0.25) });
        continue;
      }
      if (!m.dead && m.kind !== 'fly') {
        c.fillStyle = 'rgba(0,0,0,0.18)';
        c.beginPath(); c.ellipse(x + m.w / 2, m.bottom, m.w * 0.4, 6, 0, 0, Math.PI * 2); c.fill();
      }
      const action = m.dead || m.hitT > 0 ? 'hit' : 'move';
      const drawn = drawSprite(c, m.key, action, this.time + m.phase, fx, fy, s, {
        rotate: m.dead ? m.rot : 0, pivot: ref ? ref.oy - ref.h / 2 : 0,
      });
      if (!drawn) { c.fillStyle = '#c62828'; c.fillRect(x, m.bottom - m.h, m.w, m.h); }
    }
  }

  drawBoss() {
    const c = this.ctx;
    for (const pr of this.projectiles) {
      if (pr.wave) {
        // 地面震波：橘色的弧形
        c.fillStyle = 'rgba(255,152,0,0.75)';
        c.beginPath(); c.ellipse(pr.x, GROUND_Y, 26, 22, 0, Math.PI, 0); c.fill();
        c.fillStyle = 'rgba(255,236,179,0.9)';
        c.beginPath(); c.ellipse(pr.x, GROUND_Y, 14, 12, 0, Math.PI, 0); c.fill();
        continue;
      }
      const g = c.createRadialGradient(pr.x, pr.y, 2, pr.x, pr.y, pr.r + 8);
      g.addColorStop(0, '#fffde7');
      g.addColorStop(0.4, pr.high ? '#7c4dff' : '#ff7043');
      g.addColorStop(1, 'rgba(255,87,34,0)');
      c.fillStyle = g;
      c.beginPath(); c.arc(pr.x, pr.y, pr.r + 8, 0, Math.PI * 2); c.fill();
    }
    const b = this.boss;
    if (!b) return;
    const { fx, scale } = this.bossLayout();
    const attacking = b.attackT > 0;
    const atkDur = actionDuration(b.key, 'attack');
    const opts = { loop: !attacking, alpha: b.leaving ? Math.max(0, 1 - b.leaving * (b.defeated ? 0.7 : 1)) : 1 };
    const action = attacking ? 'attack' : 'move', t = attacking ? atkDur - b.attackT : this.time;
    drawSprite(c, b.key, action, t, fx, GROUND_Y, scale, opts);
    const flicker = b.defeated && Math.floor(this.time * 16) % 2;
    if (b.hitT > 0 || flicker) drawSprite(c, b.key, action, t, fx, GROUND_Y, scale, { ...opts, tint: true, alpha: 0.5 * opts.alpha });
    if (!b.leaving) {
      // BOSS 血條＋剩餘時間：撐過時間就過關，提早打倒獎勵加倍
      const left = Math.max(0, b.dur - b.t);
      const bw = 300, bx = VIEW_W / 2 - bw / 2;
      c.fillStyle = 'rgba(0,0,0,0.55)';
      roundRect(c, bx - 6, 74, bw + 12, 46, 9); c.fill();
      c.fillStyle = '#3a0d0d';
      roundRect(c, bx, 80, bw, 18, 5); c.fill();
      const hg = c.createLinearGradient(0, 80, 0, 98);
      hg.addColorStop(0, '#ff8a80'); hg.addColorStop(1, '#c62828');
      c.fillStyle = hg;
      if (b.hp > 0) { roundRect(c, bx, 80, bw * (b.hp / b.maxHp), 18, 5); c.fill(); }
      c.fillStyle = '#7e57c2';
      roundRect(c, bx, 104, bw * (left / b.dur), 8, 4); c.fill();
      c.fillStyle = '#fff';
      c.font = 'bold 13px sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(`${b.name}  ${Math.max(0, Math.ceil(b.hp))} / ${b.maxHp}`, VIEW_W / 2, 89);
      c.font = 'bold 11px sans-serif';
      c.fillText(b.mode === 'charge' ? '靠近了！近戰快打！' : `撐過 ${left.toFixed(1)} 秒，或打倒牠`, VIEW_W / 2, 128);
    }
  }

  drawPlayer() {
    const c = this.ctx;
    const p = this.player;
    const a = this.anim;
    const scale = PLAYER_SCALE * (this.giant ? 1.8 : 1);
    const key = this.job.key;

    // 影子
    c.fillStyle = 'rgba(0,0,0,0.2)';
    c.beginPath(); c.ellipse(this.px, GROUND_Y + 2, 22 * scale, 6, 0, 0, Math.PI * 2); c.fill();

    // 加速時的殘影
    if (p.power.dash > 0) {
      for (let i = 3; i >= 1; i--) {
        drawSprite(c, key, a.action, a.t - i * 0.05, this.px - i * 26, p.y, scale, { flip: true, alpha: 0.12 + 0.08 * (3 - i) });
      }
    }
    if (p.inv > 0 && Math.floor(this.time * 20) % 2 && !this.giant && this.phase !== 'over') return;

    const rotate = a.spin > 0 ? (1 - a.spin / SPIN_TIME) * Math.PI * 2 : 0;
    const opts = { flip: true, rotate, pivot: 32, loop: a.action !== 'attack' };
    if (this.giant) { c.save(); c.shadowColor = '#e040fb'; c.shadowBlur = 18; }
    const drawn = drawSprite(c, key, a.action, a.t, this.px, p.y, scale, opts);
    if (this.giant) c.restore();
    if (!drawn) { c.fillStyle = '#ffcc80'; c.fillRect(this.px - 20, p.y - PLAYER_H, 40, PLAYER_H); }
    if (p.hurtFlash > 0) drawSprite(c, key, a.action, a.t, this.px, p.y, scale, { ...opts, tint: true });

    if (p.power.magnet > 0) {
      c.strokeStyle = `rgba(239,83,80,${0.3 + Math.sin(this.time * 8) * 0.15})`;
      c.lineWidth = 3;
      c.beginPath(); c.arc(this.px, p.y - 36 * scale, 70, 0, Math.PI * 2); c.stroke();
    }
  }

  drawShots() {
    const c = this.ctx;
    const atk = this.job.attack;
    for (const s of this.shots) {
      if (s.delay > 0) continue;
      const ok = s.sk
        ? drawSprite(c, `sk-${this.job.id}`, 'ball', this.time * 3, s.x, s.y, 0.45, { flip: true })
        : drawSprite(c, this.fxKey, 'ball', this.time * 3, s.x, s.y, atk.ballScale, { flip: true, rotate: 0 });
      if (!ok) { c.fillStyle = '#fff59d'; c.beginPath(); c.arc(s.x, s.y, s.r, 0, Math.PI * 2); c.fill(); }
    }
  }

  drawEffects() {
    const c = this.ctx;
    for (const e of this.effects) {
      // follow：跟著角色走，x / y 是相對角色腳底的位移
      // wx：固定在世界座標（跟著地面捲動），例如暴風雪的冰柱、引爆的楓幣
      const x = e.follow ? this.px + (e.x || 0) : e.wx != null ? e.wx - this.worldX : e.x;
      const y = e.follow ? this.player.y + (e.y || 0) : e.y;
      drawSprite(c, e.key, e.action, e.t, x, y, e.scale, { flip: e.flip, loop: !!e.loopUntil });
    }
  }

  drawFx() {
    const c = this.ctx;
    for (const q of this.particles) {
      c.globalAlpha = Math.max(0, q.life * 2);
      c.fillStyle = q.color;
      c.fillRect(q.x - 3, q.y - 3, 6, 6);
    }
    c.globalAlpha = 1;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (const t of this.texts) {
      c.globalAlpha = Math.min(1, t.life / t.max * 2);
      if (t.dmg) { drawDamage(c, t); continue; }
      c.font = 'bold 20px sans-serif';
      c.lineWidth = 4;
      c.strokeStyle = 'rgba(0,0,0,0.6)';
      c.strokeText(t.str, t.x, t.y);
      c.fillStyle = t.color;
      c.fillText(t.str, t.x, t.y);
    }
    c.globalAlpha = 1;
  }

  drawHud() {
    const c = this.ctx;
    const p = this.player;
    // HP 條（楓之谷風格）
    const x = 16, y = 16, w = 260, h = 22;
    c.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(c, x - 4, y - 4, w + 52, h + 8, 8); c.fill();
    c.fillStyle = '#ffeb3b';
    c.font = 'bold 14px sans-serif';
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.fillText('HP', x + 4, y + h / 2 + 1);
    const ratio = Math.max(0, p.hp / p.hpMax);
    c.fillStyle = '#3a0d0d';
    roundRect(c, x + 34, y, w, h, 6); c.fill();
    const hg = c.createLinearGradient(0, y, 0, y + h);
    hg.addColorStop(0, ratio < 0.25 ? '#ff8a80' : '#ff6e6e');
    hg.addColorStop(1, ratio < 0.25 ? '#c62828' : '#d32f2f');
    c.fillStyle = hg;
    if (ratio > 0) { roundRect(c, x + 34, y, w * ratio, h, 6); c.fill(); }
    c.fillStyle = '#fff';
    c.textAlign = 'center';
    c.font = 'bold 13px sans-serif';
    c.fillText(`${Math.max(0, Math.ceil(p.hp))} / ${p.hpMax}`, x + 34 + w / 2, y + h / 2 + 1);

    // 楓幣與分數
    c.textAlign = 'left';
    drawCoin(c, x + 10, y + 44, 9, 0);
    c.font = 'bold 18px sans-serif';
    c.lineWidth = 4;
    c.strokeStyle = 'rgba(0,0,0,0.6)';
    c.strokeText(this.meso.toLocaleString(), x + 26, y + 45);
    c.fillStyle = '#ffe082';
    c.fillText(this.meso.toLocaleString(), x + 26, y + 45);

    c.textAlign = 'right';
    c.font = 'bold 26px sans-serif';
    const s = Math.round(this.score).toLocaleString();
    c.strokeText(s, VIEW_W - 70, y + 14);
    c.fillStyle = '#fff';
    c.fillText(s, VIEW_W - 70, y + 14);
    c.font = 'bold 13px sans-serif';
    const info = `${this.channel.short} ${this.channel.tag} ・ STAGE ${this.stage} ${this.theme.name}`;
    c.strokeText(info, VIEW_W - 70, y + 42);
    c.fillStyle = '#e3f2fd';
    c.fillText(info, VIEW_W - 70, y + 42);

    // 關卡進度
    const pw = 300, px = VIEW_W / 2 - pw / 2, py = 20;
    c.fillStyle = 'rgba(0,0,0,0.4)';
    roundRect(c, px, py, pw, 10, 5); c.fill();
    c.fillStyle = this.phase === 'run' ? '#81c784' : '#ba68c8';
    roundRect(c, px, py, pw * (this.phase === 'run' ? this.stageProgress : 1), 10, 5); c.fill();
    const bossImg = getImage(previewSrc(this.theme.boss.key));
    if (bossImg) c.drawImage(bossImg, px + pw - 8, py - 10, 30, 30 * bossImg.naturalHeight / bossImg.naturalWidth);

    // 道具剩餘時間
    let bx = x + 16;
    for (const k of ['dash', 'magnet', 'giant']) {
      if (p.power[k] <= 0) continue;
      this.drawPowerIcon(bx, y + 80, k, 13);
      c.fillStyle = '#fff';
      c.font = 'bold 12px sans-serif';
      c.textAlign = 'center';
      c.fillText(p.power[k].toFixed(1), bx, y + 104);
      bx += 40;
    }

    if (this.banner) {
      const a = Math.min(1, this.banner.t * 2);
      c.globalAlpha = a;
      c.fillStyle = 'rgba(0,0,0,0.5)';
      roundRect(c, VIEW_W / 2 - 230, 150, 460, 56, 14); c.fill();
      c.fillStyle = '#fff59d';
      c.font = 'bold 26px sans-serif';
      c.textAlign = 'center';
      c.fillText(this.banner.text, VIEW_W / 2, 179);
      c.globalAlpha = 1;
    }
  }
}

// ---------- 小型繪圖工具 ----------
function overlap(a, b) {
  return a.x1 > b.x0 && a.x0 < b.x1 && a.y1 > b.y0 && a.y0 < b.y1;
}

// 楓之谷風格的傷害數字：粗斜體、橘黃漸層、深色描邊；暴擊是粉紅色而且比較大
function drawDamage(c, t) {
  const size = t.crit ? 34 : 28;
  const pop = 1 + Math.max(0, t.life - t.max + 0.12) * 4; // 剛出現時放大一下
  c.save();
  c.translate(t.x, t.y);
  c.scale(pop, pop);
  c.font = `italic 900 ${size}px "Arial Black", Impact, sans-serif`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.lineJoin = 'round';
  c.lineWidth = 6;
  c.strokeStyle = t.crit ? '#4a0030' : '#3a1600';
  c.strokeText(t.str, 0, 0);
  const g = c.createLinearGradient(0, -size / 2, 0, size / 2);
  g.addColorStop(0, t.crit ? '#ffd1f0' : '#fff3a0');
  g.addColorStop(1, t.color);
  c.fillStyle = g;
  c.fillText(t.str, 0, 0);
  c.restore();
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  const rr = Math.min(r, w / 2, h / 2);
  c.moveTo(x + rr, y);
  c.arcTo(x + w, y, x + w, y + h, rr);
  c.arcTo(x + w, y + h, x, y + h, rr);
  c.arcTo(x, y + h, x, y, rr);
  c.arcTo(x, y, x + w, y, rr);
  c.closePath();
}

// 楓幣：會轉的金幣
function drawCoin(c, x, y, r, t) {
  const sx = Math.abs(Math.cos(t * 4));
  c.save();
  c.translate(x, y);
  c.scale(Math.max(0.25, sx), 1);
  c.fillStyle = '#c98a0c';
  c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#ffd54f';
  c.beginPath(); c.arc(0, 0, r * 0.78, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#c98a0c';
  c.fillRect(-r * 0.15, -r * 0.45, r * 0.3, r * 0.9);
  c.restore();
}

function drawBag(c, x, y) {
  c.fillStyle = '#8d5a2b';
  c.beginPath(); c.ellipse(x, y + 3, 14, 12, 0, 0, Math.PI * 2); c.fill();
  c.fillRect(x - 6, y - 14, 12, 8);
  c.fillStyle = '#ffd54f';
  c.font = 'bold 13px sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText('$', x, y + 4);
}

function drawPotion(c, x, y, kind) {
  const col = kind === 'blue' ? '#42a5f5' : '#ef5350';
  c.fillStyle = 'rgba(255,255,255,0.85)';
  c.fillRect(x - 5, y - 18, 10, 8);
  c.fillStyle = '#8d6e63';
  c.fillRect(x - 6, y - 22, 12, 5);
  c.fillStyle = col;
  c.beginPath(); c.arc(x, y + 2, 13, 0, Math.PI * 2); c.fill();
  c.fillStyle = 'rgba(255,255,255,0.6)';
  c.beginPath(); c.arc(x - 4, y - 2, 4, 0, Math.PI * 2); c.fill();
}
