// 設定載入（config.json ＋ GM 本機預覽）與本機排行榜
import { sanitizeConfig, defaultConfig } from './params.js';

const KEY_DRAFT = 'maple-run-gm-draft';
const KEY_PREVIEW = 'maple-run-gm-preview';
const KEY_SCORES = 'maple-run-scores';
const KEY_PREFS = 'maple-run-prefs';

function readJSON(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch { return fallback; }
}
function writeJSON(key, v) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* 無痕模式或空間不足 */ }
}

let published = defaultConfig();

// 讀取 GM 發佈的設定；離線時由 service worker 給快取版本，都失敗就用內建預設值
export async function loadPublishedConfig() {
  try {
    const res = await fetch('config.json', { cache: 'no-cache' });
    if (res.ok) published = sanitizeConfig(await res.json());
  } catch { /* 用預設值 */ }
  return published;
}

export const getPublished = () => published;

export const getDraft = () => sanitizeConfig(readJSON(KEY_DRAFT, null) || published);
export const saveDraft = (cfg) => writeJSON(KEY_DRAFT, cfg);
export const clearDraft = () => { try { localStorage.removeItem(KEY_DRAFT); } catch { /* 無痕模式 */ } };

export const isPreview = () => readJSON(KEY_PREVIEW, false) === true;
export const setPreview = (v) => writeJSON(KEY_PREVIEW, !!v);

// 玩家實際使用的設定：GM 開了本機預覽就用草稿，否則用已發佈的
export const activeConfig = () => (isPreview() ? getDraft() : published);

export function getScores(channelId) {
  const all = readJSON(KEY_SCORES, {});
  return Array.isArray(all[channelId]) ? all[channelId] : [];
}

// 回傳這筆成績的名次（從 1 開始），沒進前 10 回傳 0
export function addScore(channelId, entry) {
  const all = readJSON(KEY_SCORES, {});
  const list = Array.isArray(all[channelId]) ? all[channelId] : [];
  list.push(entry);
  list.sort((a, b) => b.score - a.score);
  all[channelId] = list.slice(0, 10);
  writeJSON(KEY_SCORES, all);
  const idx = all[channelId].indexOf(entry);
  return idx + 1;
}

export const getPrefs = () => readJSON(KEY_PREFS, { name: '', job: 'warrior' });
export const savePrefs = (p) => writeJSON(KEY_PREFS, { ...getPrefs(), ...p });
