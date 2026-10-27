import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PARAMS, CHANNELS, defaultConfig, sanitizeConfig, stageParams } from '../src/params.js';

test('每個參數的預設值都在範圍內，且三個頻道都有', () => {
  for (const p of PARAMS) {
    for (const c of CHANNELS) {
      const v = p.def[c.id];
      assert.ok(v >= p.min && v <= p.max, `${p.key}.${c.id}=${v}`);
    }
  }
});

test('預設難度：困難頻道比簡單頻道更快、更耗血', () => {
  const cfg = defaultConfig();
  const e = stageParams(cfg.channels.easy, 1);
  const h = stageParams(cfg.channels.hard, 1);
  assert.ok(h.speed > e.speed);
  assert.ok(h.hpDrain > e.hpDrain);
  assert.ok(h.density > e.density);
});

test('關卡越後面越難，速度不超過上限', () => {
  const ch = defaultConfig().channels.normal;
  let prev = stageParams(ch, 1);
  for (let s = 2; s <= 40; s++) {
    const cur = stageParams(ch, s);
    assert.ok(cur.speed >= prev.speed);
    assert.ok(cur.speed <= ch.maxSpeed);
    assert.ok(cur.hpDrain > prev.hpDrain);
    assert.ok(cur.density >= prev.density && cur.density <= 1);
    prev = cur;
  }
});

test('sanitizeConfig 會補預設值、夾住超出範圍的值、丟掉怪東西', () => {
  const cfg = sanitizeConfig({ announcement: 123, channels: { hard: { baseSpeed: 99999, hpDrain: 'abc' } } });
  assert.equal(cfg.announcement, '');
  assert.equal(cfg.channels.hard.baseSpeed, 700);
  assert.equal(cfg.channels.hard.hpDrain, defaultConfig().channels.hard.hpDrain);
  assert.deepEqual(cfg.channels.easy, defaultConfig().channels.easy);
  assert.deepEqual(sanitizeConfig(null), defaultConfig());
});

test('repo 裡的 config.json 是合法設定', () => {
  const raw = JSON.parse(readFileSync(new URL('../config.json', import.meta.url), 'utf8'));
  const cfg = sanitizeConfig(raw);
  for (const c of CHANNELS) assert.deepEqual(cfg.channels[c.id], raw.channels[c.id]);
});
