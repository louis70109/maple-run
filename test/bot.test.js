// 用一個簡單的自動玩家跑真正的遊戲邏輯（不畫圖），確認每個頻道都「玩得過」好幾關。
// 自動玩家只看前方的怪、坑洞和 BOSS 攻擊決定跳或滑；如果它都過得去，代表地形沒有無解的組合。
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.Image = class { set src(_) {} }; // assets.js 在 node 底下不需要真的載圖
const { readFileSync } = await import('node:fs');
const { setSpriteMeta } = await import('../src/sprites.js');
setSpriteMeta(JSON.parse(readFileSync(new URL('../assets/sprites/sprites.json', import.meta.url), 'utf8'))); // 用真實的怪物尺寸
const { Game } = await import('../src/game.js');
const { defaultConfig, CHANNELS } = await import('../src/params.js');
const { JOBS } = await import('../src/themes.js');
const { PLAYER_W } = await import('../src/physics.js');

function botStep(g) {
  const p = g.player;
  const speed = g.currentSpeed();
  const px = g.playerWorldX;
  const front = px + PLAYER_W / 2;
  let slide = false;
  let wantJump = false;
  let needHigh = false;
  let airborneHazard = false;

  for (const m of g.gen.mobs) {
    if (m.dead) continue;
    const x0 = m.x + m.w * 0.18 - front;
    const x1 = m.x + m.w * 0.82 - (px - PLAYER_W / 2);
    if (x1 < 0) continue;
    if (m.kind === 'fly') {
      if (x0 < speed * 0.25 && p.onGround) slide = true;
      continue;
    }
    if (x0 < speed * 0.3) airborneHazard = true;
    if (x0 < speed * (m.kind === 'tall' ? 0.16 : 0.1)) { wantJump = true; if (m.kind === 'tall') needHigh = true; }
  }
  for (const pit of g.gen.pits) {
    if (pit.x1 < px - PLAYER_W / 2) continue;
    const d = pit.x0 - front;
    if (d < speed * 0.4) airborneHazard = true;
    if (d < speed * 0.05) { wantJump = true; needHigh = needHigh || pit.x1 - pit.x0 > speed * 0.45; }
  }
  for (const pr of g.projectiles) {
    if (pr.x + pr.r < g.px - PLAYER_W / 2) continue; // 已經過去了
    const t = Math.max(0, (pr.x - pr.r - (g.px + PLAYER_W / 2)) / -pr.vx);
    if (pr.high && t < 0.35 && p.onGround) slide = true;
    if (!pr.high && t < 0.2) wantJump = true;
  }

  g.setSlide(slide && !wantJump);
  if (wantJump && p.onGround) g.jump();
  // 二段跳：需要高度時在接近最高點補跳；或掉進坑時補跳
  else if (!p.onGround && p.jumps < g.maxJumps && ((needHigh && p.vy > -150) || (airborneHazard && p.vy > 250))) g.jump();
}

function play(channelId, seed, seconds) {
  const ch = CHANNELS.find((c) => c.id === channelId);
  let ended = null;
  const g = new Game({ getContext: () => null }, {
    channel: ch, channelParams: defaultConfig().channels[channelId], job: JOBS[0], seed, onEnd: (r) => { ended = r; },
  });
  const dt = 1 / 60;
  for (let i = 0; i < seconds * 60 && g.phase !== 'over'; i++) {
    botStep(g);
    g.update(dt);
  }
  return { stage: g.stage, hp: g.player.hp, over: g.phase === 'over', ended };
}

// 簡單／普通：4 分鐘內至少到第 5 關；困難：至少過 2 關（自動玩家會漏吃藥水，真人應該更遠）
const MIN_STAGE = { easy: 5, normal: 5, hard: 3 };
for (const ch of CHANNELS) {
  test(`自動玩家在 ${ch.short}${ch.tag} 至少能到第 ${MIN_STAGE[ch.id]} 關`, () => {
    for (const seed of [1, 2, 3]) {
      const r = play(ch.id, seed, 240);
      assert.ok(r.stage >= MIN_STAGE[ch.id], `seed ${seed}: 只到第 ${r.stage} 關（over=${r.over}）`);
    }
  });
}

test('困難頻道比簡單頻道更早結束', () => {
  const avg = (id) => [1, 2, 3].reduce((s, seed) => s + play(id, seed, 240).stage, 0) / 3;
  assert.ok(avg('hard') < avg('easy'));
});
