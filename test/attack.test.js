// 職業攻擊：每個職業都打得到前方的怪、高大怪要打兩下、有冷卻時間、打倒的怪不會再傷人
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

globalThis.Image = class { set src(_) {} };
const { Game } = await import('../src/game.js');
const { defaultConfig, CHANNELS } = await import('../src/params.js');
const { JOBS, THEMES } = await import('../src/themes.js');
const { setSpriteMeta } = await import('../src/sprites.js');
const { PLAYER_X, GROUND_Y } = await import('../src/physics.js');
setSpriteMeta(JSON.parse(readFileSync(new URL('../assets/sprites/sprites.json', import.meta.url), 'utf8')));

function setup(job) {
  const g = new Game({ getContext: () => null }, { channel: CHANNELS[0], channelParams: defaultConfig().channels.easy, job, seed: 1 });
  g.update(1 / 60); // 產生開頭的平地（前 900px 沒有怪）
  g.gen.mobs = [];
  return g;
}

// 在角色前方 dist px 放一隻怪
function spawn(g, kind, dist) {
  const def = kind === 'fly' ? THEMES[0].fly_mobs[0] : kind === 'tall' ? THEMES[0].tall_mobs[0] : THEMES[0].ground_mobs[0];
  const m = { kind, key: def.key, x: g.worldX + PLAYER_X + dist, w: def.h * 0.9, h: def.h, bottom: kind === 'fly' ? GROUND_Y - 52 : GROUND_Y, phase: 0, bob: 0 };
  g.gen.mobs.push(m);
  return m;
}

const run = (g, seconds) => { for (let i = 0; i < seconds * 60; i++) g.update(1 / 60); };

for (const job of JOBS) {
  test(`${job.name}「${job.attack.name}」打得到前方的地面怪和飛行怪`, () => {
    for (const kind of ['ground', 'fly']) {
      const g = setup(job);
      const m = spawn(g, kind, 100);
      const hp = g.player.hp;
      assert.equal(g.attack(), true);
      run(g, 0.25);
      assert.notEqual(m.dying, undefined, `${kind} 應該被打倒`);
      assert.ok(g.player.hp > hp - 5, '打倒的怪不應該再造成傷害'); // 只有自然消耗
      assert.ok(g.gen.items.some((it) => it.type === 'bag' && Math.abs(it.x - (m.x + m.w / 2)) < 30), '應該掉楓幣袋');
    }
  });

  test(`${job.name} 有冷卻時間，按住可以連續攻擊`, () => {
    const g = setup(job);
    assert.equal(g.attack(), true);
    assert.equal(g.attack(), false, '冷卻中不能再打');
    g.setAttack(true);
    let attacks = 0;
    const orig = g.attack.bind(g);
    g.attack = () => { const ok = orig(); if (ok) attacks++; return ok; };
    run(g, 2);
    g.setAttack(false);
    const expected = Math.floor(2 / job.attack.cooldown);
    assert.ok(attacks >= expected - 1 && attacks <= expected + 1, `2 秒內應該打 ${expected} 下左右，實際 ${attacks}`);
  });
}

test('高大的怪：遠程職業要打兩下，劍士一下', () => {
  const mage = setup(JOBS.find((j) => j.id === 'magician'));
  const t1 = spawn(mage, 'tall', 160);
  mage.attack();
  run(mage, 0.3);
  assert.equal(t1.dying, undefined, '一下還不會倒');
  assert.equal(t1.hp, 1);
  mage.attackCd = 0;
  mage.attack();
  run(mage, 0.3);
  assert.notEqual(t1.dying, undefined, '兩下就倒');

  const warrior = setup(JOBS.find((j) => j.id === 'warrior'));
  const t2 = spawn(warrior, 'tall', 90);
  warrior.attack();
  assert.notEqual(t2.dying, undefined);
});

test('近戰打不到太遠的怪，滑行時不能攻擊', () => {
  const g = setup(JOBS.find((j) => j.id === 'warrior'));
  const far = spawn(g, 'ground', 400);
  g.attack();
  assert.equal(far.dying, undefined);
  g.attackCd = 0;
  g.setSlide(true);
  run(g, 0.05);
  assert.equal(g.attack(), false);
});

test('弓箭手的箭可以穿透一隻', () => {
  const g = setup(JOBS.find((j) => j.id === 'archer'));
  const a = spawn(g, 'ground', 120);
  const b = spawn(g, 'ground', 220);
  const c = spawn(g, 'ground', 320);
  g.attack();
  run(g, 0.3);
  assert.notEqual(a.dying, undefined);
  assert.notEqual(b.dying, undefined);
  assert.equal(c.dying, undefined, '只穿透一隻');
});
