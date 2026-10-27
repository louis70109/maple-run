// 畫面流程：標題 → 頻道 → 職業 → 遊戲 → 結果；以及 #gm 的 GM 設定介面
import { CHANNELS, stageParams } from './params.js';
import { JOBS } from './themes.js';
import { VIEW_W } from './physics.js';
import { Game, preloadGameAssets } from './game.js';
import { loadSpriteMeta, loadSheets, drawSprite } from './sprites.js';
import { isMuted, setMuted } from './audio.js';
import { loadPublishedConfig, activeConfig, isPreview, getScores, addScore, getPrefs, savePrefs } from './store.js';
import { openGm } from './gm.js';

const $ = (s) => document.querySelector(s);
const canvas = $('#canvas');
const screens = ['title', 'channel', 'job', 'pause', 'result', 'ranking', 'help'];

let game = null;
let lastResult = null;
const sel = { channel: CHANNELS[0], job: JOBS.find((j) => j.id === getPrefs().job) || JOBS[0] };

function show(name) {
  for (const s of screens) $(`#screen-${s}`).classList.toggle('hidden', s !== name);
  if (name === 'channel') renderChannels();
  if (name === 'job') { renderJobs(); requestAnimationFrame(animateJobs); }
  if (name === 'ranking') renderRanking(sel.channel.id);
  if (name === 'title') renderTitle();
}

document.addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]');
  if (!go) return;
  if (go.dataset.go === 'title') endGame();
  show(go.dataset.go);
});

// ---------- 畫布尺寸（跟著螢幕與 DPR） ----------
function resize() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(rect.width * dpr) || VIEW_W;
  canvas.height = Math.round(canvas.width * 9 / 16);
}
window.addEventListener('resize', resize);

// 選單背景：角色在弓箭手村一直往前跑（展示用，不會受傷）
let idle = null;
let idleRunning = false;
let idleLast = 0;
function idleFrame(now) {
  if (game || $('#stage').classList.contains('hidden')) { idle = null; idleRunning = false; return; }
  if (!idle) {
    idle = new Game(canvas, { channel: CHANNELS[0], channelParams: activeConfig().channels.easy, job: sel.job, seed: 7 });
    idle.banner = null;
    idle.drawHud = () => {};
    idleLast = now;
  }
  idle.demo(Math.min(0.05, (now - idleLast) / 1000));
  idleLast = now;
  idle.draw();
  requestAnimationFrame(idleFrame);
}
function drawIdle() {
  idle = null; // 下一格重新建立（例如換了職業）
  if (!idleRunning && !game) { idleRunning = true; requestAnimationFrame(idleFrame); }
}

// ---------- 標題 ----------
function renderTitle() {
  const cfg = activeConfig();
  const ann = $('#announce');
  ann.classList.toggle('hidden', !cfg.announcement);
  ann.querySelector('span').textContent = cfg.announcement ? `📢 GM：${cfg.announcement}` : '';
  $('#preview-badge').classList.toggle('hidden', !isPreview());
  $('#btn-mute').textContent = `音效：${isMuted() ? '關' : '開'}`;
}

$('#btn-mute').addEventListener('click', () => { setMuted(!isMuted()); renderTitle(); });

// service worker 把全部圖片下載好之後，標題畫面顯示「可離線遊玩」
async function checkOffline() {
  try {
    await navigator.serviceWorker.ready;
    for (let i = 0; i < 60; i++) {
      if (await caches.match('offline-ready')) { $('#offline-badge').classList.remove('hidden'); return; }
      await new Promise((r) => setTimeout(r, 2000));
    }
  } catch { /* 不支援就不顯示 */ }
}

let installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
  $('#btn-install').classList.remove('hidden');
});
$('#btn-install').addEventListener('click', async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  $('#btn-install').classList.add('hidden');
});

// ---------- 頻道 ----------
function renderChannels() {
  const cfg = activeConfig();
  const list = $('#channel-list');
  list.replaceChildren();
  for (const ch of CHANNELS) {
    const p = cfg.channels[ch.id];
    const s1 = stageParams(p, 1), s5 = stageParams(p, 5);
    const best = getScores(ch.id)[0];
    const el = document.createElement('button');
    el.className = 'card';
    el.innerHTML = `
      <span class="ch" style="background:${ch.color}">${ch.short}</span>
      <span><b>${ch.name}</b>・${ch.tag}<br>
        <span class="meta">速度 ${s1.speed}→${Math.round(s5.speed)}（第 5 關）・HP ${p.hpMax}・消耗 ${s1.hpDrain.toFixed(1)}/秒・分數 ×${p.scoreMultiplier}</span></span>
      <span class="best">最佳<b>${best ? best.score.toLocaleString() : '—'}</b></span>`;
    el.addEventListener('click', () => { sel.channel = ch; show('job'); });
    list.append(el);
  }
}

// ---------- 職業 ----------
function renderJobs() {
  $('#job-channel').textContent = `${sel.channel.short} ${sel.channel.name}（${sel.channel.tag}）`;
  const list = $('#job-list');
  list.replaceChildren();
  for (const j of JOBS) {
    const el = document.createElement('button');
    el.className = 'job';
    el.setAttribute('aria-pressed', String(j === sel.job));
    el.innerHTML = `<canvas width="120" height="110" aria-hidden="true"></canvas><b>${j.name}</b><small>${j.attack.name}<br>${j.perk}</small>`;
    el.addEventListener('click', () => {
      sel.job = j;
      savePrefs({ job: j.id });
      drawIdle();
      for (const b of list.children) b.setAttribute('aria-pressed', String(b === el));
    });
    el.addEventListener('dblclick', startGame);
    list.append(el);
  }
}
$('#btn-start').addEventListener('click', startGame);

// 職業卡片：選中的職業跑步，其他的站著呼吸
function animateJobs(now) {
  const list = $('#job-list');
  if ($('#screen-job').classList.contains('hidden')) return;
  [...list.children].forEach((el, i) => {
    const cv = el.querySelector('canvas');
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, cv.width, cv.height);
    const j = JOBS[i];
    // 選中的職業反覆示範攻擊，其他的站著呼吸
    const t = now / 1000 + i * 0.3;
    const chosen = j === sel.job;
    const atkLen = 1.4;
    const action = chosen && t % atkLen < 0.4 ? 'attack' : chosen ? 'walk' : 'stand';
    drawSprite(ctx, j.key, action, chosen && action === 'attack' ? t % atkLen : t, cv.width / 2, cv.height - 8, 1.25, { flip: true, loop: action !== 'attack' });
  });
  requestAnimationFrame(animateJobs);
}

// ---------- 遊戲 ----------
async function startGame() {
  endGame();
  for (const s of screens) $(`#screen-${s}`).classList.add('hidden');
  await preloadGameAssets(sel.job);
  const params = activeConfig().channels[sel.channel.id];
  game = new Game(canvas, { channel: sel.channel, channelParams: params, job: sel.job, onEnd: showResult });
  $('#hud-controls').classList.remove('hidden');
  game.start();
}

function endGame() {
  if (game) game.stop();
  game = null;
  $('#hud-controls').classList.add('hidden');
  drawIdle();
}

function pause(v) {
  if (!game || game.phase === 'over') return;
  game.setPaused(v);
  $('#screen-pause').classList.toggle('hidden', !v);
}

$('#btn-pause').addEventListener('click', () => pause(true));
$('#btn-resume').addEventListener('click', () => pause(false));
$('#btn-quit').addEventListener('click', () => { endGame(); show('title'); });
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(true); });

// 鍵盤
const JUMP_KEYS = new Set(['Space', 'ArrowUp', 'KeyW', 'KeyZ']);
const SLIDE_KEYS = new Set(['ArrowDown', 'KeyS', 'KeyX']);
const ATTACK_KEYS = new Set(['ControlLeft', 'ControlRight', 'KeyJ', 'KeyF']);
window.addEventListener('keydown', (e) => {
  if (!game || e.target.closest('input, textarea')) return;
  if (JUMP_KEYS.has(e.code)) { e.preventDefault(); if (!e.repeat) game.jump(); }
  else if (SLIDE_KEYS.has(e.code)) { e.preventDefault(); game.setSlide(true); }
  else if (ATTACK_KEYS.has(e.code)) { e.preventDefault(); if (!e.repeat) game.setAttack(true); }
  else if (e.code === 'KeyP' || e.code === 'Escape') pause(!game.paused);
});
window.addEventListener('keyup', (e) => {
  if (game && SLIDE_KEYS.has(e.code)) game.setSlide(false);
  if (game && ATTACK_KEYS.has(e.code)) game.setAttack(false);
});

// 觸控按鈕（pointer events，同時支援滑鼠）
function bindHold(btn, down, up) {
  btn.addEventListener('pointerdown', (e) => { e.preventDefault(); btn.setPointerCapture?.(e.pointerId); btn.classList.add('active'); down(); });
  const release = (e) => { e.preventDefault(); btn.classList.remove('active'); up?.(); };
  btn.addEventListener('pointerup', release);
  btn.addEventListener('pointercancel', release);
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
}
bindHold($('#btn-jump'), () => game?.jump());
bindHold($('#btn-slide'), () => game?.setSlide(true), () => game?.setSlide(false));
bindHold($('#btn-attack'), () => game?.setAttack(true), () => game?.setAttack(false));

// ---------- 結果 ----------
function showResult(r) {
  lastResult = r;
  $('#hud-controls').classList.add('hidden');
  $('#result-reason').textContent = `${sel.channel.short} ${sel.channel.tag}・${sel.job.name}・${r.reason}`;
  $('#result-stats').innerHTML = `
    <div class="big">${r.score.toLocaleString()} 分</div>
    <div><span>到達關卡</span><b>STAGE ${r.stage}</b></div>
    <div><span>距離</span><b>${r.distance.toLocaleString()} m</b></div>
    <div><span>楓幣</span><b>${r.meso.toLocaleString()}</b></div>
    <div><span>打倒怪物</span><b>${r.smashed}</b></div>`;
  $('#result-form').classList.remove('hidden');
  $('#result-rank').classList.add('hidden');
  $('#result-name').value = getPrefs().name || '';
  show('result');
}

$('#result-form').addEventListener('submit', (e) => {
  e.preventDefault();
  if (!lastResult) return;
  const name = $('#result-name').value.trim().slice(0, 12) || '冒險者';
  savePrefs({ name });
  const rank = addScore(sel.channel.id, {
    name, score: lastResult.score, stage: lastResult.stage, job: sel.job.id, date: new Date().toISOString().slice(0, 10),
  });
  $('#result-form').classList.add('hidden');
  const msg = $('#result-rank');
  msg.textContent = rank ? `登上 ${sel.channel.short} 排行榜第 ${rank} 名！` : '沒有進入前 10 名，再接再厲！';
  msg.classList.remove('hidden');
  lastResult = null;
});
$('#btn-retry').addEventListener('click', startGame);

// ---------- 排行榜 ----------
function renderRanking(channelId) {
  const tabs = $('#rank-tabs');
  tabs.replaceChildren();
  for (const ch of CHANNELS) {
    const t = document.createElement('button');
    t.className = 'tab';
    t.setAttribute('role', 'tab');
    t.setAttribute('aria-selected', String(ch.id === channelId));
    t.textContent = `${ch.short} ${ch.tag}`;
    t.addEventListener('click', () => renderRanking(ch.id));
    tabs.append(t);
  }
  const list = $('#rank-list');
  list.replaceChildren();
  const scores = getScores(channelId);
  if (!scores.length) {
    list.innerHTML = '<li class="empty">還沒有成績，快去跑一場吧！</li>';
    return;
  }
  scores.forEach((s, i) => {
    const li = document.createElement('li');
    const job = JOBS.find((j) => j.id === s.job);
    li.innerHTML = `<span class="no">${i + 1}</span><span></span><span class="muted">${job ? job.name : ''}・ST.${s.stage}</span><b>${s.score.toLocaleString()}</b>`;
    li.children[1].textContent = s.name; // 名稱是使用者輸入，用 textContent 避免插入 HTML
    list.append(li);
  });
}

// ---------- 路由：#gm 開 GM 介面 ----------
function route() {
  const gm = location.hash === '#gm';
  $('#gm').classList.toggle('hidden', !gm);
  $('#stage').classList.toggle('hidden', gm);
  if (gm) { endGame(); openGm($('#gm')); }
  else { resize(); drawIdle(); show('title'); }
}
window.addEventListener('hashchange', route);

// ---------- 啟動 ----------
(async function boot() {
  await Promise.all([loadPublishedConfig(), loadSpriteMeta()]);
  await loadSheets(JOBS.map((j) => j.key));
  route();
  preloadGameAssets(sel.job);
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
    checkOffline();
  }
})();
