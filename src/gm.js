// GM 設定介面：調整三個頻道的難度參數，預覽成長曲線，匯出或直接發佈 config.json 到 GitHub。
// 發佈 = 用 GitHub API 把 config.json commit 到 repo，GitHub Pages 重新部署後所有玩家都會套用。
// 真正的權限在 GitHub token（需要該 repo 的 contents 寫入權），前端不另做密碼。

import { CHANNELS, PARAMS, stageParams, sanitizeConfig, defaultConfig } from './params.js';
import { getPublished, getDraft, saveDraft, clearDraft, isPreview, setPreview, loadPublishedConfig } from './store.js';

const KEY_REPO = 'maple-run-gm-repo';
const KEY_TOKEN = 'maple-run-gm-token'; // 只放 sessionStorage，關掉分頁就忘記

let root = null;
let draft = null;
let tab = 'easy';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function guessRepo() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY_REPO) || 'null');
    if (saved) return saved;
  } catch { /* 忽略 */ }
  const m = location.hostname.match(/^([^.]+)\.github\.io$/);
  const repo = location.pathname.split('/').filter(Boolean)[0];
  return { owner: m ? m[1] : 'louis70109', repo: m && repo ? repo : 'maple-run', branch: 'main', path: 'config.json' };
}

export async function openGm(el) {
  root = el;
  await loadPublishedConfig();
  draft = getDraft();
  render();
}

function render() {
  const repo = guessRepo();
  let token = '';
  try { token = sessionStorage.getItem(KEY_TOKEN) || ''; } catch { /* 忽略 */ }
  const pub = getPublished();
  root.innerHTML = `
  <div class="gm-wrap">
    <header>
      <div>
        <h1>GM 設定</h1>
        <p class="note">調整三個頻道的難度。修改會先存在這台裝置的草稿；按「發佈」後寫入 repo 的 <code>config.json</code>，
        GitHub Pages 重新部署（約 1 分鐘）後，所有玩家下次開遊戲就會套用。
        目前發佈版本：${pub.updatedAt ? esc(new Date(pub.updatedAt).toLocaleString()) : '內建預設值'}</p>
      </div>
      <a class="btn small" href="#">← 回遊戲</a>
    </header>

    <div class="card-box">
      <h3>GM 公告</h3>
      <textarea id="gm-ann" maxlength="200" placeholder="顯示在標題畫面的跑馬燈，例如：本週末困難頻道分數加倍！">${esc(draft.announcement)}</textarea>
    </div>

    <div class="card-box">
      <div class="tabs" role="tablist">
        ${CHANNELS.map((c) => `<button class="tab" role="tab" data-tab="${c.id}" aria-selected="${c.id === tab}">${c.short} ${c.tag}</button>`).join('')}
      </div>
      <div class="grid2" id="gm-params"></div>
      <div class="actions" style="margin-top:12px">
        <button class="btn small" id="gm-reset-ch">此頻道還原預設值</button>
      </div>
    </div>

    <div class="card-box">
      <h3>難度成長預覽（${esc(CHANNELS.find((c) => c.id === tab).name)}）</h3>
      <div class="table-scroll" id="gm-curve"></div>
    </div>

    <div class="card-box">
      <h3>預覽與檔案</h3>
      <label class="switch"><input type="checkbox" id="gm-preview" ${isPreview() ? 'checked' : ''}> 這台裝置先用草稿設定玩（只影響自己）</label>
      <div class="actions" style="margin-top:12px">
        <button class="btn small primary" id="gm-play">用草稿試玩</button>
        <button class="btn small" id="gm-export">匯出 config.json</button>
        <label class="btn small">匯入 JSON<input type="file" id="gm-import" accept="application/json,.json" hidden></label>
        <button class="btn small" id="gm-revert">捨棄草稿（回到已發佈設定）</button>
        <button class="btn small" id="gm-defaults">全部還原預設值</button>
      </div>
      <p class="status" id="gm-file-status"></p>
    </div>

    <div class="card-box">
      <h3>發佈給所有玩家</h3>
      <p class="note">需要一組只授權這個 repo、權限為 <b>Contents: Read and write</b> 的
      <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">fine-grained token</a>。
      token 只存在這個分頁（sessionStorage），不會寫進檔案或傳給 GitHub 以外的地方。</p>
      <div class="pub-grid" style="margin-top:10px">
        <label>Owner<input type="text" id="gm-owner" value="${esc(repo.owner)}"></label>
        <label>Repo<input type="text" id="gm-repo" value="${esc(repo.repo)}"></label>
        <label>Branch<input type="text" id="gm-branch" value="${esc(repo.branch)}"></label>
        <label>檔案路徑<input type="text" id="gm-path" value="${esc(repo.path)}"></label>
        <label>GitHub token<input type="password" id="gm-token" value="${esc(token)}" autocomplete="off"></label>
      </div>
      <div class="actions" style="margin-top:12px">
        <button class="btn small primary" id="gm-publish">發佈</button>
      </div>
      <p class="status" id="gm-pub-status"></p>
    </div>
  </div>`;

  renderParams();
  renderCurve();
  bind();
}

function renderParams() {
  const box = root.querySelector('#gm-params');
  const ch = draft.channels[tab];
  const pub = getPublished().channels[tab];
  let html = '';
  let group = '';
  for (const p of PARAMS) {
    if (p.group !== group) { group = p.group; html += `<p class="group-title">${esc(group)}</p>`; }
    const v = ch[p.key];
    html += `
      <div class="param ${v !== pub[p.key] ? 'changed' : ''}" data-key="${p.key}">
        <label for="gm-n-${p.key}">${esc(p.label)} <small>${esc(p.unit)}</small></label>
        <input type="number" id="gm-n-${p.key}" min="${p.min}" max="${p.max}" step="${p.step}" value="${v}">
        <input type="range" aria-label="${esc(p.label)}" min="${p.min}" max="${p.max}" step="${p.step}" value="${v}">
        <span class="desc">${esc(p.desc)}・預設 ${p.def[tab]}・已發佈 ${pub[p.key]}</span>
      </div>`;
  }
  box.innerHTML = html;
}

function renderCurve() {
  const ch = draft.channels[tab];
  const rows = [];
  for (const s of [1, 2, 3, 4, 5, 6, 8, 10, 12, 16]) {
    const p = stageParams(ch, s);
    rows.push(`<tr><td>第 ${s} 關</td><td>${Math.round(p.speed)}</td><td>${p.hpDrain.toFixed(2)}</td><td>${p.density.toFixed(2)}</td>
      <td>${(p.pitChance * 100).toFixed(0)}%</td><td>${Math.round(p.damage)}</td><td>${Math.round(p.stageLength)}</td>
      <td>${p.bossDuration}s・${p.bossFireRate.toFixed(2)}/s</td></tr>`);
  }
  root.querySelector('#gm-curve').innerHTML = `<table>
    <thead><tr><th>關卡</th><th>速度</th><th>HP 消耗/s</th><th>障礙密度</th><th>坑洞</th><th>撞怪傷害</th><th>關卡長度</th><th>BOSS</th></tr></thead>
    <tbody>${rows.join('')}</tbody></table>`;
}

function commit() {
  draft = sanitizeConfig(draft);
  saveDraft(draft);
}

function setStatus(id, msg, ok) {
  const el = root.querySelector(id);
  el.textContent = msg;
  el.className = `status ${ok === true ? 'ok' : ok === false ? 'err' : ''}`;
}

function bind() {
  root.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; render(); }));

  root.querySelector('#gm-ann').addEventListener('input', (e) => { draft.announcement = e.target.value; commit(); });

  root.querySelector('#gm-params').addEventListener('input', (e) => {
    const row = e.target.closest('.param');
    if (!row) return;
    const key = row.dataset.key;
    const v = Number(e.target.value);
    if (!Number.isFinite(v)) return;
    draft.channels[tab][key] = v;
    row.querySelectorAll('input').forEach((i) => { if (i !== e.target) i.value = v; });
    row.classList.toggle('changed', v !== getPublished().channels[tab][key]);
    commit();
    renderCurve();
  });
  // 數字欄位離開時把超出範圍的值夾回來
  root.querySelector('#gm-params').addEventListener('change', (e) => {
    const row = e.target.closest('.param');
    if (row) row.querySelectorAll('input').forEach((i) => { i.value = draft.channels[tab][row.dataset.key]; });
  });

  root.querySelector('#gm-reset-ch').addEventListener('click', () => {
    draft.channels[tab] = defaultConfig().channels[tab];
    commit();
    render();
  });

  root.querySelector('#gm-preview').addEventListener('change', (e) => setPreview(e.target.checked));
  root.querySelector('#gm-play').addEventListener('click', () => { setPreview(true); location.hash = ''; });

  root.querySelector('#gm-export').addEventListener('click', () => {
    const blob = new Blob([serialize()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'config.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    setStatus('#gm-file-status', '已下載 config.json，可以手動放到 repo 根目錄 commit。', true);
  });

  root.querySelector('#gm-import').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      draft = sanitizeConfig(JSON.parse(await f.text()));
      commit();
      render();
      setStatus('#gm-file-status', `已匯入 ${f.name}（超出範圍的值已自動修正）。`, true);
    } catch {
      setStatus('#gm-file-status', '這不是有效的 JSON 檔。', false);
    }
  });

  root.querySelector('#gm-revert').addEventListener('click', () => {
    if (!confirm('捨棄目前草稿，回到已發佈的設定？')) return;
    clearDraft();
    setPreview(false);
    draft = getDraft();
    render();
  });

  root.querySelector('#gm-defaults').addEventListener('click', () => {
    if (!confirm('把三個頻道全部還原成預設值？（只改草稿，發佈後才生效）')) return;
    draft = { ...defaultConfig(), announcement: draft.announcement };
    commit();
    render();
  });

  root.querySelector('#gm-publish').addEventListener('click', publish);
}

function serialize() {
  return JSON.stringify({ ...sanitizeConfig(draft), updatedAt: new Date().toISOString() }, null, 2) + '\n';
}

// UTF-8 安全的 base64（公告可能有中文）
function toBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

async function publish() {
  const val = (id) => root.querySelector(id).value.trim();
  const repo = { owner: val('#gm-owner'), repo: val('#gm-repo'), branch: val('#gm-branch') || 'main', path: val('#gm-path') || 'config.json' };
  const token = val('#gm-token');
  if (!repo.owner || !repo.repo || !token) { setStatus('#gm-pub-status', '請填 owner、repo 和 token。', false); return; }
  try { localStorage.setItem(KEY_REPO, JSON.stringify(repo)); sessionStorage.setItem(KEY_TOKEN, token); } catch { /* 忽略 */ }

  const url = `https://api.github.com/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}/contents/${repo.path.split('/').map(encodeURIComponent).join('/')}`;
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  const btn = root.querySelector('#gm-publish');
  btn.disabled = true;
  setStatus('#gm-pub-status', '發佈中…');
  try {
    let sha;
    const cur = await fetch(`${url}?ref=${encodeURIComponent(repo.branch)}`, { headers, cache: 'no-store' });
    if (cur.ok) sha = (await cur.json()).sha;
    else if (cur.status !== 404) throw new Error(await errorText(cur));

    const body = serialize();
    const res = await fetch(url, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ message: 'GM: 更新難度設定 config.json', content: toBase64(body), branch: repo.branch, sha }),
    });
    if (!res.ok) throw new Error(await errorText(res));
    const data = await res.json();
    setStatus('#gm-pub-status', `發佈成功（commit ${data.commit.sha.slice(0, 7)}）。GitHub Pages 部署完成後玩家就會套用。`, true);
  } catch (err) {
    setStatus('#gm-pub-status', `發佈失敗：${err.message}`, false);
  } finally {
    btn.disabled = false;
  }
}

async function errorText(res) {
  let msg = `HTTP ${res.status}`;
  try { msg += ` ${(await res.json()).message}`; } catch { /* 忽略 */ }
  if (res.status === 401) msg += '（token 無效或過期）';
  if (res.status === 403 || res.status === 404) msg += '（token 沒有這個 repo 的寫入權，或 repo 名稱錯誤）';
  if (res.status === 409) msg += '（檔案剛被改過，請重新整理後再發佈）';
  return msg;
}
