// 程序化地形產生器：以「段落」為單位往前產生地面、坑洞、平台、怪物與楓幣。
// 不碰畫面與圖片，只產生資料，方便測試。

import { GROUND_Y, GRAVITY, JUMP_V, FLY_CLEARANCE, SINGLE_AIR, maxPitWidth } from './physics.js';
import { ITEM_ICONS } from './themes.js';

const lerp = (a, b, t) => a + (b - a) * t;

export class LevelGen {
  // aspect(key) 回傳怪物動畫的寬高比，用來算碰撞框寬度
  constructor({ rng, params, theme, aspect = () => 1, startX = 0 }) {
    this.rng = rng;
    this.params = params;
    this.theme = theme;
    this.aspect = aspect;
    this.cursor = startX;
    this.groundStart = startX;
    this.lastPotion = startX;
    this.calm = true; // 開頭一段不放障礙
    this.boss = false;
    this.grounds = [];
    this.platforms = [];
    this.items = [];
    this.mobs = [];
    this.pits = []; // 測試與除錯用
  }

  setStage(params, theme) {
    this.params = params;
    this.theme = theme;
  }

  pick(arr) { return arr[Math.floor(this.rng() * arr.length)]; }

  // 產生到 xEnd 為止
  generateUntil(xEnd) {
    while (this.cursor < xEnd) this.chunk();
  }

  // 丟掉畫面左邊已經看不到的東西
  prune(xMin) {
    const keep = (e) => (e.x1 ?? e.x + (e.w || 40)) > xMin;
    this.grounds = this.grounds.filter(keep);
    this.platforms = this.platforms.filter(keep);
    this.items = this.items.filter((e) => !e.taken && keep(e));
    this.mobs = this.mobs.filter(keep);
    this.pits = this.pits.filter((p) => p.x1 > xMin);
  }

  // 目前開著的地面段在 cursor 處結束，接著留一個坑
  closeGround(at) {
    if (at > this.groundStart) this.grounds.push({ x0: this.groundStart, x1: at, y: GROUND_Y });
  }

  // 已確定、可以拿來碰撞的地面（含尚未封口的那段）
  allGrounds() {
    return [...this.grounds, { x0: this.groundStart, x1: this.cursor, y: GROUND_Y }];
  }

  get speed() { return this.params.speed; }

  coin(x, y) {
    const r = this.rng();
    if (r < 0.03) this.items.push({ type: 'item', icon: this.pick(ITEM_ICONS), x, y, r: 16 });
    else if (r < 0.07) this.items.push({ type: 'bag', x, y, r: 15 });
    else this.items.push({ type: 'coin', x, y, r: 11 });
  }

  coinLine(x0, x1, y) {
    for (let x = x0; x <= x1; x += 44) this.coin(x, y);
  }

  // 沿著單跳拋物線排楓幣（起跳點 x0）
  coinArc(x0, height = 1) {
    const s = this.speed;
    const steps = 9;
    for (let i = 1; i < steps; i++) {
      const t = (SINGLE_AIR * i) / steps;
      const y = GROUND_Y - (JUMP_V * t - (GRAVITY * t * t) / 2) * height - 38;
      this.coin(x0 + s * t, y);
    }
  }

  addMob(kind, x) {
    const t = this.theme;
    const list = kind === 'fly' ? t.fly_mobs : kind === 'tall' ? t.tall_mobs : t.ground_mobs;
    const m = this.pick(list);
    const h = m.h;
    const w = Math.min(h * 1.8, h * this.aspect(m.key));
    const bottom = kind === 'fly' ? GROUND_Y - FLY_CLEARANCE : GROUND_Y;
    this.mobs.push({ kind, key: m.key, x, w, h, bottom, phase: this.rng() * 10, bob: this.rng() * Math.PI * 2 });
    return w;
  }

  // 平地一段，可能放藥水 / 道具
  flat(len) {
    const x0 = this.cursor;
    const x1 = x0 + len;
    const p = this.params;
    if (!this.calm && x0 - this.lastPotion > p.potionInterval) {
      this.items.push({ type: 'potion', kind: this.rng() < 0.75 ? 'red' : 'blue', x: x0 + len / 2, y: GROUND_Y - 50, r: 16 });
      this.lastPotion = x0;
      this.coinLine(x0 + 40, x0 + len / 2 - 50, GROUND_Y - 40);
      this.coinLine(x0 + len / 2 + 50, x1 - 40, GROUND_Y - 40);
    } else if (!this.calm && this.rng() < p.powerupChance) {
      this.items.push({ type: 'power', kind: this.pick(['dash', 'magnet', 'giant']), x: x0 + len / 2, y: GROUND_Y - 120, r: 20 });
      this.coinLine(x0 + 40, x1 - 40, GROUND_Y - 40);
    } else if (!this.calm && this.rng() < (p.skillUpChance || 0)) {
      // 技能升級券放在要跳起來才吃得到的高度
      this.items.push({ type: 'skillup', x: x0 + len / 2, y: GROUND_Y - 115, r: 18 });
      this.coinLine(x0 + 40, x1 - 40, GROUND_Y - 40);
    } else {
      this.coinLine(x0 + 40, x1 - 40, GROUND_Y - 40);
    }
    this.cursor = x1;
  }

  // 兩個障礙之間的平地長度：越密越短，越快越長（反應時間固定）
  spacing() {
    const p = this.params;
    const base = lerp(950, 330, p.density) * (p.speed / 400);
    return Math.max(SINGLE_AIR * p.speed * 1.1, base * lerp(0.8, 1.25, this.rng()));
  }

  chunk() {
    const p = this.params;
    if (this.calm) {
      this.flat(900);
      this.calm = false;
      return;
    }
    if (this.boss) {
      this.flat(600);
      return;
    }
    const r = this.rng();
    if (r < p.pitChance) this.pit();
    else {
      const d = p.density;
      const options = [
        ['mob', 3],
        ['fly', 2],
        ['tall', 1 + d * 2],
        ['plat', 1.2],
        ['combo', d * 3],
        ['double', d * 2],
      ];
      const total = options.reduce((s, o) => s + o[1], 0);
      let k = this.rng() * total;
      const pick = options.find((o) => (k -= o[1]) < 0)[0];
      this[pick]();
    }
    this.flat(this.spacing());
  }

  pit() {
    const s = this.speed;
    const maxW = maxPitWidth(s);
    const w = lerp(Math.min(120, maxW), maxW, Math.pow(this.rng(), 1.3) * (0.4 + 0.6 * this.params.density));
    const x0 = this.cursor;
    this.closeGround(x0);
    this.pits.push({ x0, x1: x0 + w });
    // 楓幣排成跳過坑的弧線（起跳點在坑前一點）
    this.coinArc(x0 - s * 0.12, w > s * SINGLE_AIR * 0.8 ? 1.5 : 1);
    this.cursor = x0 + w;
    this.groundStart = this.cursor;
    this.flat(160);
  }

  mob() {
    const x = this.cursor + 40;
    const w = this.addMob('ground', x);
    this.coinArc(x + w / 2 - (this.speed * SINGLE_AIR) / 2);
    this.cursor = x + w + 40;
  }

  tall() {
    const x = this.cursor + 40;
    const w = this.addMob('tall', x);
    this.coinArc(x + w / 2 - (this.speed * SINGLE_AIR) / 2, 1.6);
    this.cursor = x + w + 40;
  }

  fly() {
    const x = this.cursor + 40;
    const w = this.addMob('fly', x);
    this.coinLine(x - 60, x + w + 60, GROUND_Y - 22);
    this.cursor = x + w + 40;
  }

  combo() {
    this.mob();
    this.flat(Math.max(this.speed * 0.9, 260));
    this.fly();
  }

  double() {
    this.mob();
    this.flat(Math.max(this.speed * SINGLE_AIR * 1.05, 220));
    this.mob();
  }

  // 一階一階的浮空平台，下面偶爾有怪
  plat() {
    const x0 = this.cursor + 60;
    const len = 260;
    const steps = [GROUND_Y - 120, GROUND_Y - 200, GROUND_Y - 140];
    let x = x0;
    for (const y of steps) {
      this.platforms.push({ x0: x, x1: x + len, y });
      this.coinLine(x + 30, x + len - 30, y - 34);
      x += len + 70;
    }
    if (this.rng() < this.params.density) this.addMob('ground', x0 + len + 60);
    this.cursor = x;
  }
}
