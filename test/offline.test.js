// 遊戲本身不連任何外部網站：所有圖片都在 repo 裡，service worker 會全部存起來供離線遊玩
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { ITEM_ICONS } from '../src/themes.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const RUNTIME = ['index.html', 'styles.css', 'sw.js', 'manifest.webmanifest', 'config.json',
  ...readdirSync(new URL('../src/', import.meta.url)).map((f) => `src/${f}`)];

test('遊戲執行時的檔案沒有連到外部網站（GM 發佈用的 GitHub 除外）', () => {
  for (const f of RUNTIME) {
    const urls = read(f).match(/https?:\/\/[^\s'"`)<>]+/g) || [];
    for (const u of urls) {
      const ok = f === 'src/gm.js' && /^https:\/\/(api\.)?github\.com\//.test(u);
      assert.ok(ok, `${f} 連到外部：${u}`);
    }
  }
});

test('遊戲用到的圖片都在 repo 裡', () => {
  const meta = JSON.parse(read('assets/sprites/sprites.json'));
  const files = [...ITEM_ICONS, 'assets/items/haste.png', 'assets/items/skillbook.png',
    ...Object.keys(meta).flatMap((k) => [`assets/sprites/${k}.png`, `assets/sprites/preview/${k}.png`])];
  for (const f of files) assert.ok(existsSync(new URL(`../${f}`, import.meta.url)), `缺少 ${f}`);
});

test('service worker 預先下載的道具圖示和 themes.js 一致', () => {
  const sw = read('sw.js');
  const m = sw.match(/length: (\d+) \}, \(_, i\) => `assets\/items\/\$\{(\d+) \+ i\}\.webp`/);
  assert.ok(m, 'sw.js 裡找不到道具圖示清單');
  const list = Array.from({ length: Number(m[1]) }, (_, i) => `assets/items/${Number(m[2]) + i}.webp`);
  assert.deepEqual(list, ITEM_ICONS);
});
