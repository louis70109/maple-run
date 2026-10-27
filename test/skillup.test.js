// 技能升級券：吃到大絕招升級，等級越高越強
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

globalThis.Image = class { set src(_) {} };
const { Game } = await import('../src/game.js');
const { defaultConfig, CHANNELS, stageParams } = await import('../src/params.js');
const { JOBS, THEMES } = await import('../src/themes.js');
const { setSpriteMeta } = await import('../src/sprites.js');
const { MAX_LEVEL, skillCooldown } = await import('../src/skills.js');
const { LevelGen } = await import('../src/level.js');
const { makeRng, GROUND_Y } = await import('../src/physics.js');
setSpriteMeta(JSON.parse(readFileSync(new URL('../assets/sprites/sprites.json', import.meta.url), 'utf8')));

const job = (id) => JOBS.find((j) => j.id === id);
const run = (g, s, each) => { for (let i = 0; i < s * 60; i++) { each?.(g); g.update(1 / 60); } };
function setup(id) {
  const g = new Game({ getContext: () => null }, { channel: CHANNELS[1], channelParams: defaultConfig().channels.normal, job: job(id), seed: 1 });
  g.update(1 / 60);
  g.gen.mobs = [];
  return g;
}
// 吃一張升級券（直接放在角色身上）
function eat(g) {
  g.gen.items.push({ type: 'skillup', x: g.worldX + g.px, y: g.player.y - 40, r: 18 });
  g.update(1 / 60);
}
// 在 BOSS 戰放一次大絕招，回傳對 BOSS 的傷害
function bossDamage(id, level) {
  const g = setup(id);
  g.distance = g.stageStart + g.sp.stageLength; g.update(1 / 60);
  run(g, 1.1);
  g.boss.mode = 'ranged'; g.boss.modeT = 99; g.boss.fire = 99; g.boss.hp = g.boss.maxHp = 999;
  g.skill.level = level;
  if (id === 'thief') for (let i = 0; i < 10; i++) g.gen.items.push({ type: 'coin', x: g.worldX + 600 + i * 30, y: GROUND_Y - 40, r: 11 });
  g.skill.cd = 0;
  g.castSkill();
  run(g, 5, (x) => { x.player.inv = 5; x.boss.stomp = 99; });
  return 999 - g.boss.hp;
}

test('吃到技能升級券會升級，最高 Lv.5，滿級再吃會重置冷卻', () => {
  const g = setup('warrior');
  assert.equal(g.skill.level, 1);
  for (let i = 2; i <= MAX_LEVEL; i++) { eat(g); assert.equal(g.skill.level, i); }
  g.skill.cd = 10;
  eat(g);
  assert.equal(g.skill.level, MAX_LEVEL);
  assert.equal(g.skill.cd, 0);
});

test('等級越高冷卻越短', () => {
  const g = setup('archer');
  const c1 = skillCooldown(g);
  g.skill.level = 5;
  assert.ok(skillCooldown(g) < c1 * 0.75);
});

for (const j of JOBS) {
  test(`${j.name}「${j.skill.name}」Lv.5 對 BOSS 的傷害比 Lv.1 高很多`, () => {
    const d1 = bossDamage(j.id, 1), d5 = bossDamage(j.id, 5);
    assert.ok(d1 > 0, 'Lv.1 要打得到');
    assert.ok(d5 > d1 * 1.5, `Lv.1 ${d1.toFixed(1)} → Lv.5 ${d5.toFixed(1)}`);
  });
}

test('Lv.3 / Lv.5 解鎖新效果：弓箭手多排箭、海盜多個炸彈桶、劍士衝擊波、法師持續更久', () => {
  const count = (id, level, fn) => { const g = setup(id); g.skill.level = level; g.skill.cd = 0; g.castSkill(); return fn(g); };
  // 弓箭手：第一輪同時射出的箭數
  assert.equal(count('archer', 1, (g) => { g.update(1 / 60); return g.shots.length; }), 1);
  assert.equal(count('archer', 3, (g) => { g.update(1 / 60); return g.shots.length; }), 2);
  assert.equal(count('archer', 5, (g) => { g.update(1 / 60); return g.shots.length; }), 3);
  // 海盜：丟出的炸彈桶數
  for (const [lv, n] of [[1, 1], [3, 2], [5, 3]]) {
    assert.equal(count('pirate', lv, (g) => { run(g, 1); return g.skill.active.barrels.length; }), n);
  }
  // 劍士：Lv.3 衝擊波打得到衝刺終點前方的怪
  for (const [lv, hit] of [[1, false], [3, true]]) {
    const g = setup('warrior');
    g.skill.level = lv; g.skill.cd = 0;
    const def = THEMES[0].ground_mobs[0];
    const m = { kind: 'ground', key: def.key, x: g.worldX + g.px + 380 + 260, w: 50, h: def.h, bottom: GROUND_Y, phase: 0, bob: 0 };
    g.gen.mobs.push(m);
    g.castSkill();
    run(g, 0.4);
    assert.equal(m.dying !== undefined, hit, `Lv.${lv} 衝擊波`);
  }
  // 法師：持續時間
  const d1 = count('magician', 1, (g) => g.skill.active.dur), d5 = count('magician', 5, (g) => g.skill.active.dur);
  assert.ok(d5 >= d1 + 2);
});

test('關卡裡會出現技能升級券，而且要跳才吃得到', () => {
  // 平均每關大約一張
  const sp = stageParams(defaultConfig().channels.normal, 1);
  let total = 0;
  for (let seed = 1; seed <= 10; seed++) {
    const gen = new LevelGen({ rng: makeRng(seed), params: sp, theme: THEMES[0] });
    gen.generateUntil(sp.stageLength);
    const ups = gen.items.filter((it) => it.type === 'skillup');
    for (const it of ups) assert.ok(it.y < GROUND_Y - 90, '要跳才吃得到');
    total += ups.length;
  }
  assert.ok(total / 10 >= 0.7 && total / 10 <= 2, `每關平均 ${total / 10} 張`);
});

test('提早打倒 BOSS 必掉一張技能升級券', () => {
  const g = setup('warrior');
  g.distance = g.stageStart + g.sp.stageLength; g.update(1 / 60);
  g.boss.hp = 1;
  g.hitBoss(10);
  assert.ok(g.gen.items.some((it) => it.type === 'skillup' && !it.taken));
});
