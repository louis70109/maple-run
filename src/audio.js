// 用 WebAudio 合成的簡單音效（不需要音檔，離線也能用）
let ctx = null;
let muted = false;
try { muted = localStorage.getItem('maple-run-muted') === '1'; } catch { /* 無痕模式 */ }

export const isMuted = () => muted;
export function setMuted(v) {
  muted = v;
  try { localStorage.setItem('maple-run-muted', v ? '1' : '0'); } catch { /* 無痕模式 */ }
}

function tone(freq, dur, type = 'square', vol = 0.06, slide = 0) {
  if (muted) return;
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + dur);
  } catch { /* 不支援 WebAudio 就安靜 */ }
}

export const sfx = {
  jump: () => tone(520, 0.12, 'square', 0.05, 300),
  coin: () => tone(1320, 0.07, 'triangle', 0.05),
  item: () => { tone(880, 0.08, 'triangle'); setTimeout(() => tone(1320, 0.12, 'triangle'), 70); },
  potion: () => { tone(660, 0.1, 'sine', 0.08); setTimeout(() => tone(990, 0.15, 'sine', 0.08), 90); },
  hit: () => tone(180, 0.25, 'sawtooth', 0.08, -120),
  smash: () => tone(300, 0.15, 'square', 0.06, -200),
  power: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.1, 'square', 0.05), i * 60)),
  clear: () => [784, 988, 1175, 1568].forEach((f, i) => setTimeout(() => tone(f, 0.16, 'triangle', 0.07), i * 110)),
  over: () => [392, 330, 262, 196].forEach((f, i) => setTimeout(() => tone(f, 0.25, 'triangle', 0.07), i * 160)),
};
