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
function bossFight(jobId, channel = 'normal', seed = 1) {
  const g = new Game({ getContext: () => null }, { channel: CHANNELS[1], channelParams: defaultConfig().channels[channel], job: job(jobId), seed });
  g.update(1 / 60);
  g.distance = g.sp.stageLength; // 跑到關底
  g.gen.mobs = [];
  g.update(1 / 60);
  assert.equal(g.phase, 'boss');
  g.setAttack(true);
  let t = 0;
  while (g.phase === 'boss' && t < 30) {
    g.player.inv = 10;
    g.player.hp = g.player.hpMax;
    g.gen.mobs = [];
    g.update(1 / 60);
    t += 1 / 60;
  }
  return { defeated: !!g.boss.defeated, t, hpLeft: g.boss.hp, maxHp: g.boss.maxHp, parried: g.parried || 0 };
}

test('近戰職業可以在時間內打倒 BOSS', () => {
  for (const id of ['warrior', 'pirate']) {
    for (const ch of ['easy', 'normal', 'hard']) {
      const r = bossFight(id, ch);
      assert.ok(r.defeated, `${id} ${ch}：BOSS 還剩 ${r.hpLeft}/${r.maxHp}`);
    }
  }
});

test('遠程職業打 BOSS 比近戰慢很多（通常撐到時間到）', () => {
  const melee = bossFight('warrior');
  for (const id of ['magician', 'archer', 'thief']) {
    const r = bossFight(id);
    assert.ok(!r.defeated || r.t > melee.t * 1.5, `${id} 太快：${r.t.toFixed(1)}s vs 劍士 ${melee.t.toFixed(1)}s`);
    assert.ok(r.hpLeft < r.maxHp, `${id} 至少要打得到 BOSS`);
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
