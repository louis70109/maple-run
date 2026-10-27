// BOSS 戰：近戰是打王主力（BOSS 衝過來時輸出、可以格擋），遠程只能慢慢磨
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

globalThis.Image = class { set src(_) {} };
const { Game } = await import('../src/game.js');
const { defaultConfig, CHANNELS } = await import('../src/params.js');
const { JOBS } = await import('../src/themes.js');
const { setSpriteMeta } = await import('../src/sprites.js');
const { PLAYER_X, GROUND_Y } = await import('../src/physics.js');
setSpriteMeta(JSON.parse(readFileSync(new URL('../assets/sprites/sprites.json', import.meta.url), 'utf8')));

const job = (id) => JOBS.find((j) => j.id === id);

// 直接進入 BOSS 戰；角色無敵（只看輸出），按住攻擊鍵
// strat：stay＝待在原位（只有 BOSS 衝過來時打得到）、close＝主動貼近 BOSS；skill＝大絕招好了就放
function bossFight(jobId, channel = 'normal', { strat = 'stay', skill = false } = {}) {
  const g = new Game({ getContext: () => null }, { channel: CHANNELS[1], channelParams: defaultConfig().channels[channel], job: job(jobId), seed: 1 });
  g.update(1 / 60);
  g.distance = g.sp.stageLength; // 跑到關底
  g.gen.mobs = [];
  g.update(1 / 60);
  assert.equal(g.phase, 'boss');
  g.setAttack(true);
  g.skill.cd = skill ? 0 : 999;
  let t = 0;
  while (g.phase === 'boss' && t < 30) {
    g.player.inv = 10;
    g.player.hp = g.player.hpMax;
    g.gen.mobs = [];
    if (strat === 'stay' && !g.skill.active) g.px = PLAYER_X;
    if (strat === 'close' && g.boss.t > 1) g.px = Math.min(g.bossLayout().box.x0 - 110, 780);
    if (skill && g.skillReady >= 1) g.castSkill();
    g.update(1 / 60);
    t += 1 / 60;
  }
  return { defeated: !!g.boss.defeated, t, hpLeft: g.boss.hp, maxHp: g.boss.maxHp };
}

test('近戰主動貼近 BOSS＋大絕招，三個頻道都打得倒', () => {
  for (const id of ['warrior', 'pirate']) {
    for (const ch of ['easy', 'normal', 'hard']) {
      const r = bossFight(id, ch, { strat: 'close', skill: true });
      assert.ok(r.defeated, `${id} ${ch}：BOSS 還剩 ${r.hpLeft}/${r.maxHp}`);
    }
  }
});

test('近戰待在原位只靠 BOSS 衝過來打，打不倒（要主動靠近才有優勢）', () => {
  for (const id of ['warrior', 'pirate']) {
    const r = bossFight(id, 'normal', { strat: 'stay' });
    assert.ok(!r.defeated && r.hpLeft < r.maxHp, `${id}：剩 ${r.hpLeft}`);
  }
});

test('遠程就算放大絕招也打不倒 BOSS（通常撐到時間到），近戰明顯比較會打王', () => {
  for (const id of ['magician', 'archer', 'thief']) {
    for (const strat of ['stay', 'close']) {
      const r = bossFight(id, 'normal', { strat, skill: true });
      assert.ok(!r.defeated, `${id} ${strat} 不應該打倒 BOSS`);
      assert.ok(r.hpLeft < r.maxHp * 0.9, `${id} 至少要打得到 BOSS`);
    }
  }
});

test('BOSS 站在遠處時近戰打不到，衝過來時打得到', () => {
  const g = new Game({ getContext: () => null }, { channel: CHANNELS[1], channelParams: defaultConfig().channels.normal, job: job('warrior'), seed: 1 });
  g.update(1 / 60);
  g.distance = g.sp.stageLength;
  g.update(1 / 60);
  const b = g.boss;
  for (let i = 0; i < 60; i++) g.update(1 / 60); // 進場完成
  b.mode = 'ranged'; b.advance = 0;
  g.attack();
  assert.equal(b.hp, b.maxHp, '遠處打不到');
  b.advance = 1; g.attackCd = 0;
  g.attack();
  assert.equal(b.hp, b.maxHp - job('warrior').attack.bossDmg, '衝過來時打得到');
});

test('近戰可以格擋 BOSS 的攻擊，遠程不行', () => {
  for (const [id, canParry] of [['warrior', true], ['archer', false]]) {
    const g = new Game({ getContext: () => null }, { channel: CHANNELS[1], channelParams: defaultConfig().channels.normal, job: job(id), seed: 1 });
    g.update(1 / 60);
    g.projectiles.push({ x: PLAYER_X + 90, y: GROUND_Y - 24, vx: -400, r: 20, high: false });
    g.attack();
    g.update(1 / 60);
    const left = g.projectiles.length;
    assert.equal(left === 0, canParry, `${id} 格擋結果不對`);
  }
});

test('打倒 BOSS 提早過關，獎勵比撐過時間多', () => {
  const g = new Game({ getContext: () => null }, { channel: CHANNELS[1], channelParams: defaultConfig().channels.normal, job: job('warrior'), seed: 1 });
  g.update(1 / 60);
  g.distance = g.sp.stageLength;
  g.update(1 / 60);
  const before = g.score;
  g.boss.hp = 1;
  g.hitBoss(10);
  assert.equal(g.phase, 'clear');
  assert.equal(g.boss.defeated, true);
  assert.ok(g.score - before >= 2000 * g.sp.scoreMultiplier);
});

test('貼近 BOSS 會被震波攻擊，震波不能格擋', () => {
  const g = new Game({ getContext: () => null }, { channel: CHANNELS[1], channelParams: defaultConfig().channels.normal, job: job('warrior'), seed: 1 });
  g.update(1 / 60);
  g.distance = g.sp.stageLength;
  g.update(1 / 60);
  for (let i = 0; i < 80; i++) g.update(1 / 60);
  g.boss.mode = 'ranged'; g.boss.modeT = 99; g.boss.fire = 99;
  g.px = g.bossLayout().box.x0 - 150;
  let wave = null;
  for (let i = 0; i < 120 && !wave; i++) { g.player.inv = 5; g.update(1 / 60); wave = g.projectiles.find((p) => p.wave); }
  assert.ok(wave, '貼近時應該出現震波');
  wave.x = g.px + 60;
  g.attackCd = 0;
  g.attack();
  assert.ok(!wave.hit, '震波不能被格擋');
});
