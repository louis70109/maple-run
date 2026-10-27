import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LevelGen } from '../src/level.js';
import { makeRng, maxPitWidth, DOUBLE_AIR, SINGLE_AIR, GROUND_Y } from '../src/physics.js';
import { defaultConfig, stageParams, CHANNELS } from '../src/params.js';
import { THEMES } from '../src/themes.js';

function run(channel, stage, seed, length = 60000) {
  const sp = stageParams(defaultConfig().channels[channel], stage);
  const gen = new LevelGen({ rng: makeRng(seed), params: sp, theme: THEMES[(stage - 1) % THEMES.length] });
  gen.generateUntil(length);
  return { gen, sp };
}

test('坑洞一定跳得過（寬度小於二段跳距離）', () => {
  for (const c of CHANNELS) {
    for (const stage of [1, 5, 12]) {
      for (let seed = 1; seed <= 5; seed++) {
        const { gen, sp } = run(c.id, stage, seed);
        for (const p of gen.pits) {
          const w = p.x1 - p.x0;
          assert.ok(w <= maxPitWidth(sp.speed) + 1e-6, `pit ${w}`);
          assert.ok(w < sp.speed * DOUBLE_AIR, 'pit wider than double-jump distance');
        }
      }
    }
  }
});

test('坑洞前後都有地面可以起跳與落地', () => {
  const { gen } = run('hard', 10, 42);
  const grounds = gen.allGrounds();
  for (const p of gen.pits) {
    assert.ok(grounds.some((g) => Math.abs(g.x1 - p.x0) < 1), 'ground before pit');
    assert.ok(grounds.some((g) => Math.abs(g.x0 - p.x1) < 1), 'ground after pit');
  }
});

test('地上的怪之間留有落地反應距離', () => {
  for (const c of CHANNELS) {
    const { gen, sp } = run(c.id, 8, 7);
    const ground = gen.mobs.filter((m) => m.kind !== 'fly').sort((a, b) => a.x - b.x);
    for (let i = 1; i < ground.length; i++) {
      const gap = ground[i].x - (ground[i - 1].x + ground[i - 1].w);
      assert.ok(gap >= sp.speed * SINGLE_AIR * 0.5, `gap ${gap.toFixed(0)} too small`);
    }
  }
});

test('開頭一段沒有障礙，難度越高障礙越多', () => {
  const easy = run('easy', 1, 3).gen;
  const hard = run('hard', 1, 3).gen;
  assert.ok(easy.mobs.every((m) => m.x > 800));
  assert.ok(hard.mobs.length + hard.pits.length > easy.mobs.length + easy.pits.length);
});

test('飛行怪浮在空中，地面怪站在地上', () => {
  const { gen } = run('normal', 3, 9);
  for (const m of gen.mobs) {
    if (m.kind === 'fly') assert.ok(m.bottom < GROUND_Y);
    else assert.equal(m.bottom, GROUND_Y);
  }
});

test('BOSS 階段只產生平地', () => {
  const { gen } = run('hard', 6, 11, 5000);
  const mobs = gen.mobs.length, pits = gen.pits.length;
  gen.boss = true;
  gen.generateUntil(20000);
  assert.equal(gen.mobs.length, mobs);
  assert.equal(gen.pits.length, pits);
});
