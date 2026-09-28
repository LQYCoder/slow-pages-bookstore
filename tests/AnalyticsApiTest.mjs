/** 真实 SQLite + 注入式 Worker 依赖，校验聚合、安全及重放。创建者：Codex；2026/09/28。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import worker, { handleRequest, validDay, validateEvent } from '../analytics-service/worker.mjs';
const ORIGIN = 'https://lqycoder.github.io';
const NOW = Date.parse('2026-09-28T03:00:00Z');
const ADMIN_TOKEN = 'local-test-token-not-valid-for-production';

/** SQL 经 stdin 传递，不作为 shell 代码；文件由每个测试独立创建。 */
function createFixture() {
    const directory = mkdtempSync(path.join(tmpdir(), 'slow-pages-api-'));
    const file = path.join(directory, 'test.sqlite');
    const bridge = (payload) => {
        const result = spawnSync('python3', ['tests/analytics/SqliteBridge.py'], {
            input: JSON.stringify({ ...payload, file }), encoding: 'utf8'
        });
        assert.equal(result.status, 0, result.stderr);
        return JSON.parse(result.stdout);
    };
    bridge({ schema: readFileSync('analytics-service/schema.sql', 'utf8') });
    const env = { ALLOWED_ORIGIN: ORIGIN, ADMIN_TOKEN, VISITOR_SECRET: 'local-test-visitor-secret-not-production',
        EVENT_LIMITER: { limit: async () => ({ success: true }) },
        REQUEST_LIMITER: { limit: async () => ({ success: true }) },
        DB: { prepare(sql) { return { bind(...parameters) { return {
            all: async () => bridge({ sql, parameters }), run: async () => bridge({ sql, parameters })
        }; } }; } } };
    return { env, close: () => rmSync(directory, { recursive: true, force: true }) };
}

function eventData(patch = {}) {
    return { version: 1, pageId: randomUUID(), visitorId: randomUUID(), day: '2026-09-28',
        path: 'library/hometown/index.html', visibleMs: 0, readingMs: 0, motionMs: 0, ...patch };
}

function requestFor(endpoint, data, token = '') {
    const headers = { Origin: ORIGIN, 'User-Agent': 'Local integration test' };
    if (token) { headers.Authorization = 'Bearer ' + token; }
    if (data !== undefined) { headers['Content-Type'] = 'text/plain'; }
    const request = new Request('https://analytics.example' + endpoint, {
        method: data === undefined ? 'GET' : 'POST', headers,
        ...(data === undefined ? {} : { body: typeof data === 'string' ? data : JSON.stringify(data) })
    });
    Object.defineProperty(request, 'cf', { value: { country: 'CN', region: 'Guangdong', city: 'Shenzhen' } });
    return request;
}

const statsPath = '/stats?from=2026-09-28&to=2026-09-28';

test('日期、未知路径、计时负数、阅读超过停留均被拒绝', () => {
    assert.equal(validDay('2026-02-31'), false);
    assert.equal(validDay('2024-02-29'), true);
    for (const patch of [{ path: '../../private' }, { readingMs: 1 }, { visibleMs: -1 },
        { path: ['index.html'] }, { pageId: [randomUUID()] }, { visibleMs: Infinity }, { version: 2 }, { pageId: '<script>' }, { day: '2026-09-30' }]) {
        assert.equal(validateEvent(eventData(patch), NOW), false);
    }
});

test('心跳重复与乱序保持一个 PV，原子合并时间，地区只信任服务端', async () => {
    const fixture = createFixture();
    try {
        const { env } = fixture;
        const event = eventData({ country: 'FAKE', city: '<script>' });
        assert.equal((await handleRequest(requestFor('/events', event), env, NOW)).status, 204);
        const progress = { ...event, visibleMs: 10000, readingMs: 8000 };
        await handleRequest(requestFor('/events', progress), env, NOW + 10000);
        await handleRequest(requestFor('/events', progress), env, NOW + 10000);
        await handleRequest(requestFor('/events', { ...event, visibleMs: 5000, readingMs: 3000 }), env, NOW + 12000);
        // 伪造同一页面 ID 的其他访客不能修改已有记录。
        await handleRequest(requestFor('/events', { ...progress, visitorId: randomUUID() }), env, NOW + 15000);
        const report = await (await handleRequest(requestFor(statsPath, undefined, ADMIN_TOKEN), env, NOW + 15000)).json();
        assert.deepEqual(report.totals, { pageViews: 1, visitorDays: 1, visibleMs: 10000,
            readingMs: 8000, motionMs: 0, readingViews: 1 });
        assert.equal(report.visits[0].city, 'Shenzhen');
        assert.equal(report.visits[0].startedAt, NOW);
        assert.doesNotMatch(JSON.stringify(report), /visitor_hash|visitorId|CF-Connecting-IP/);
        assert.equal(report.daily.length, 1);
    } finally { fixture.close(); }
});

test('同一天跨页面 UV 去重，跨天显示访客日，分页越界被约束', async () => {
    const fixture = createFixture();
    try {
        const visitorId = randomUUID();
        for (const pagePath of ['index.html', 'library/hometown/index.html']) {
            await handleRequest(requestFor('/events', eventData({ visitorId, path: pagePath })), fixture.env, NOW);
        }
        await handleRequest(requestFor('/events', eventData({ visitorId, day: '2026-09-29' })), fixture.env, NOW + 86400000);
        const report = await (await handleRequest(requestFor(
            '/stats?from=2026-09-28&to=2026-09-29&page=999', undefined, ADMIN_TOKEN), fixture.env, NOW + 86400000)).json();
        assert.equal(report.totals.pageViews, 3);
        assert.equal(report.totals.visitorDays, 2);
        assert.deepEqual(report.daily.map((day) => day.visitors), [1, 1]);
        assert.equal(report.page, 1);
        const empty = await (await handleRequest(requestFor('/stats?from=2026-09-20&to=2026-09-20',
            undefined, ADMIN_TOKEN), fixture.env, NOW)).json();
        assert.equal(empty.totals.pageViews, 0);
        assert.deepEqual(empty.visits, []);
    } finally { fixture.close(); }
});

test('未鉴权、非法来源、超大正文、查询越界、限流与未配置都失败关闭', async () => {
    const fixture = createFixture();
    try {
        assert.equal((await handleRequest(requestFor(statsPath), fixture.env, NOW)).status, 401);
        assert.equal((await handleRequest(requestFor(statsPath, undefined, 'bad'), fixture.env, NOW)).status, 401);
        const foreign = new Request('https://analytics.example/stats', { headers: { Origin: 'https://evil.example' } });
        const result = await handleRequest(foreign, fixture.env, NOW);
        assert.equal(result.status, 403);
        assert.equal(result.headers.get('Access-Control-Allow-Origin'), null);
        assert.equal((await handleRequest(requestFor('/events', 'x'.repeat(2049)), fixture.env, NOW)).status, 413);
        assert.equal((await handleRequest(requestFor('/events', '{'), fixture.env, NOW)).status, 400);
        assert.equal((await handleRequest(requestFor('/stats?from=2020-01-01&to=2026-09-28', undefined, ADMIN_TOKEN),
            fixture.env, NOW)).status, 400);
        assert.equal((await handleRequest(requestFor('/events', eventData()),
            { ...fixture.env, REQUEST_LIMITER: { limit: async () => ({ success: false }) } }, NOW)).status, 429);
        assert.equal((await handleRequest(requestFor('/events', eventData()),
            { ...fixture.env, ADMIN_TOKEN: '' }, NOW)).status, 503);
    } finally { fixture.close(); }
});

test('过期记录清理不删除新记录，数据库异常不向客户端泄露', async () => {
    const fixture = createFixture();
    try {
        await handleRequest(requestFor('/events', eventData()), fixture.env, NOW);
        await worker.scheduled({ scheduledTime: NOW + 86400000 }, fixture.env);
        let result = await (await handleRequest(requestFor(statsPath, undefined, ADMIN_TOKEN), fixture.env, NOW)).json();
        assert.equal(result.totals.pageViews, 1);
        await worker.scheduled({ scheduledTime: NOW + 91 * 86400000 }, fixture.env);
        result = await (await handleRequest(requestFor(statsPath, undefined, ADMIN_TOKEN), fixture.env, NOW)).json();
        assert.equal(result.totals.pageViews, 0);
        const failing = { ...fixture.env, DB: { prepare() { throw new Error('private database SQL details'); } } };
        const response = await worker.fetch(requestFor(statsPath, undefined, ADMIN_TOKEN), failing);
        assert.equal(response.status, 503);
        assert.doesNotMatch(await response.text(), /SQL details/);
    } finally { fixture.close(); }
});
