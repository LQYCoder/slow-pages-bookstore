/** 时间累计的可重复边界测试。创建者：Codex；2026/09/28。 */
const test = require('node:test');
const assert = require('node:assert/strict');
const metrics = require('../docs/analytics/metrics.js');
const active = { visible: true, focused: true, reading: true, playing: false, lastInputAt: 0 };

test('前台停留与阅读独立累计，隐藏和失焦之后不再累计', () => {
    const clock = metrics.createCounter(0, active);
    clock.sample(1000, active);
    clock.sample(2000, { ...active, visible: false });
    clock.sample(3000, { ...active, visible: false });
    clock.sample(4000, { ...active, focused: false });
    clock.sample(5000, { ...active, focused: false });
    assert.deepEqual(clock.snapshot(), { visibleMs: 2000, readingMs: 2000, motionMs: 0 });
});

test('空闲阈值按区间截断，仍保留可见停留，不把挂机当阅读', () => {
    const clock = metrics.createCounter(58000, active);
    clock.sample(63000, active);
    assert.deepEqual(clock.snapshot(), { visibleMs: 5000, readingMs: 2000, motionMs: 0 });
});

test('休眠造成大间隔时不补记，正文不可见的播放独立累计', () => {
    const watching = { ...active, reading: false, playing: true };
    const clock = metrics.createCounter(0, watching);
    clock.sample(1000, watching);
    clock.sample(600000, watching);
    clock.sample(601000, watching);
    assert.deepEqual(clock.snapshot(), { visibleMs: 2000, readingMs: 0, motionMs: 2000 });
});

test('北京时间午夜切日，与系统所在时区无关', () => {
    assert.equal(metrics.dayKey(Date.parse('2026-09-28T15:59:59Z')), '2026-09-28');
    assert.equal(metrics.dayKey(Date.parse('2026-09-28T16:00:00Z')), '2026-09-29');
});
