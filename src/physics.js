// 物理常數（邏輯解析度 960x540，單位 px 與秒）
export const VIEW_W = 960;
export const VIEW_H = 540;
export const GROUND_Y = 440;
export const PLAYER_X = 210; // 玩家在畫面上的固定 x
export const PLAYER_H = 78;
export const PLAYER_SLIDE_H = 40;
export const PLAYER_W = 46;
export const GRAVITY = 2600;
export const JUMP_V = 900;
export const DOUBLE_JUMP_V = 820;
export const FLY_CLEARANCE = 52; // 飛行怪底部離地高度：站著會撞，滑行可以過

// 單跳／二段跳的滯空時間（從地面起跳再落回同高度）
export const SINGLE_AIR = (2 * JUMP_V) / GRAVITY;
export const DOUBLE_AIR = (() => {
  const t1 = JUMP_V / GRAVITY;
  const h1 = (JUMP_V * JUMP_V) / (2 * GRAVITY);
  const t2 = DOUBLE_JUMP_V / GRAVITY;
  const h = h1 + (DOUBLE_JUMP_V * DOUBLE_JUMP_V) / (2 * GRAVITY);
  return t1 + t2 + Math.sqrt((2 * h) / GRAVITY);
})();

// 某速度下坑洞最大寬度（保留餘裕，保證二段跳一定跳得過）
export const maxPitWidth = (speed) => Math.max(110, speed * DOUBLE_AIR * 0.62);

// 可重現的亂數（mulberry32）
export function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
