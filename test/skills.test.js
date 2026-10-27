// 左右移動與職業大絕招
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

globalThis.Image = class { set src(_) {} };
const { Game, PX_MIN, PX_MAX } = await import('../src/game.js');
const { defaultConfig, CHANNELS } = await import('../src/params.js');
const { JOBS, THEMES } = await import('../src/themes.js');
const { setSpriteMeta } = await import('../src/sprites.js');
const { PLAYER_X, GROUND_Y } = await import('../src/physics.js');
const meta = JSON.parse(readFileSync(new URL('../assets/sprites/sprites.json', import.meta.url), 'utf8'));
setSpriteMeta(meta);

const job = (id) => JOBS.find((j) => j.id === id);
const run = (g, s) => { for (let i = 0; i < s * 60; i++) g.update(1 / 60); };

function setup(id) {
  const g = new Game({ getContext: () => null }, { channel: CHANNELS[0], channelParams: defaultConfig().channels.easy, job: job(id), seed: 1 });
  g.update(1 / 60);
  g.gen.mobs = [];
  return g;
}
function spawn(g, kind, dist) {
  const def = kind === 'fly' ? THEMES[0].fly_mobs[0] : kind === 'tall' ? THEMES[0].tall_mobs[0] : THEMES[0].ground_mobs[0];
  const m = { kind, key: def.key, x: g.worldX + g.px + dist, w: def.h * 0.9, h: def.h, bottom: kind === 'fly' ? GROUND_Y - 52 : GROUND_Y, phase: 0, bob: 0 };
  g.gen.mobs.push(m);
  return m;
}
function toBoss(g) {
  g.distance = g.stageStart + g.sp.stageLength;
  g.gen.mobs = [];
  g.update(1 / 60);
  run(g, 1.1); // 等 BOSS 進場
}

test('左右移動有範圍限制', () => {
  const g = setup('warrior');
  assert.equal(g.px, PLAYER_X);
  g.setMove('right', true);
  run(g, 0.5);
  assert.ok(g.px > PLAYER_X + 100);
  run(g, 5);
  assert.equal(g.px, PX_MAX);
  g.setMove('right', false);
  g.setMove('left', true);
  run(g, 5);
  assert.equal(g.px, PX_MIN);
});

test('近戰主動走近 BOSS，BOSS 在遠處時也打得到', () => {
  const g = setup('warrior');
  toBoss(g);
  g.boss.mode = 'ranged'; g.boss.modeT = 99; g.boss.advance = 0;
  const bb = g.bossLayout().box;
  g.px = bb.x0 - 120; // 走到 BOSS 前面
  g.player.inv = 5;
  const hp = g.boss.hp;
  g.attack();
  assert.ok(g.boss.hp < hp);
});

test('撞到 BOSS 會受傷並被彈開', () => {
  const g = setup('warrior');
  toBoss(g);
  g.boss.mode = 'ranged'; g.boss.modeT = 99; g.boss.advance = 0;
  const bb = g.bossLayout().box;
  g.px = bb.x0 + 10;
  const hp = g.player.hp;
  g.update(1 / 60);
  assert.ok(g.player.hp < hp - 5);
  assert.ok(g.px < bb.x0 - 100);
});

for (const j of JOBS) {
  test(`${j.name}大絕招「${j.skill.name}」：有特效圖、冷卻、可以打倒畫面上的怪、打得到 BOSS`, () => {
    for (const a of ['icon', 'effect', 'hit']) assert.ok(meta[`sk-${j.id}`]?.[a]?.length, `缺少 sk-${j.id} ${a}`);
    const g = setup(j.id);
    assert.equal(g.castSkill(), false, '開場還沒充好');
    g.skill.cd = 0;
    if (j.id === 'thief') for (let i = 0; i < 8; i++) g.gen.items.push({ type: 'coin', x: g.worldX + g.px + 80 + i * 40, y: GROUND_Y - 40, r: 11 });
    const mobs = [spawn(g, 'ground', 140), spawn(g, 'tall', 260)];
    const meso = g.meso;
    assert.equal(g.castSkill(), true);
    assert.equal(g.castSkill(), false, '放完要冷卻');
    run(g, 3.5);
    for (const m of mobs) assert.notEqual(m.dying, undefined, `${j.skill.name} 應該打倒前方的怪`);
    if (j.id === 'thief') assert.ok(g.meso > meso + 8 * 10 * 2 - 1, '楓幣加倍收下');

    const b = setup(j.id);
    toBoss(b);
    b.skill.cd = 0;
    b.boss.mode = 'ranged'; b.boss.modeT = 99; b.boss.advance = 0;
    if (j.id === 'thief') for (let i = 0; i < 10; i++) b.gen.items.push({ type: 'coin', x: b.worldX + 600 + i * 30, y: GROUND_Y - 40, r: 11 });
    const hp = b.boss.hp;
    b.castSkill();
    for (let i = 0; i < 3.5 * 60; i++) { b.player.inv = 5; b.update(1 / 60); }
    assert.ok(b.boss.hp < hp - 15 || b.boss.defeated, `${j.skill.name} 對 BOSS 至少 15 傷害，實際 ${hp - b.boss.hp}`);
  });
}

test('劍士突進會把角色往前帶', () => {
  const g = setup('warrior');
  g.skill.cd = 0;
  const x = g.px;
  g.castSkill();
  run(g, 0.6);
  assert.ok(g.px > x + 300);
});

test('法師暴風雪凍住 BOSS：期間不出招', () => {
  const g = setup('magician');
  toBoss(g);
  g.skill.cd = 0;
  g.castSkill();
  const n = g.projectiles.length;
  run(g, 2.5);
  assert.ok(g.boss.frozen > 0);
  assert.equal(g.projectiles.length, n);
});

test('打倒怪物會縮短大絕招冷卻', () => {
  const g = setup('archer');
  g.skill.cd = 10;
  spawn(g, 'ground', 120);
  g.attack();
  run(g, 0.3);
  assert.ok(g.skill.cd < 10 - 0.3 - 0.5);
});
