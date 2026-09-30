/** HTTPS 路由全部本地模拟，检查采集与看板，不发送真实访问。创建者：Codex；2026/09/28。 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'docs');
const OUTPUT = path.join(ROOT, '统计验收');
const BASE = 'https://reader.test/slow-pages-bookstore/';
const SECRET = 'local-browser-test-token-not-production';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };

async function main() {
    await fs.mkdir(OUTPUT, { recursive: true });
    const browser = await chromium.launch({
        executablePath: process.env.CHROME_EXECUTABLE || undefined, headless: true
    });
    try {
        const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
        const captured = [];
        const errors = [];
        const analyticsRequests = [];
        let enabled = true;
        let allowStats = true;
        let statsOffline = false;
        await context.route('https://reader.test/**', async (route) => {
            const pathname = new URL(route.request().url()).pathname;
            const relative = pathname.replace('/slow-pages-bookstore/', '') || 'index.html';
            if (relative === 'analytics/config.js') {
                return route.fulfill({ contentType: 'text/javascript', body: 'window.READING_ANALYTICS_CONFIG='
                    + JSON.stringify({ enabled, endpoint: 'https://stats.test', siteBasePath: '/slow-pages-bookstore/' }) });
            }
            const filename = path.resolve(DIST, relative);
            assert.ok(filename.startsWith(DIST + path.sep));
            return route.fulfill({ contentType: TYPES[path.extname(filename)] || 'application/octet-stream',
                body: await fs.readFile(filename) });
        });
        await context.route('https://stats.test/**', async (route) => {
            const request = route.request();
            const url = new URL(request.url());
            const headers = { 'Access-Control-Allow-Origin': 'https://reader.test',
                'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
            if (request.method() === 'OPTIONS') {
                return route.fulfill({ status: 204, headers });
            }
            if (url.pathname === '/events') {
                captured.push(JSON.parse(request.postData()));
                return route.fulfill({ status: 204, headers });
            }
            analyticsRequests.push(request.headers());
            if (statsOffline) {
                return route.abort('failed');
            }
            if (!allowStats || request.headers().authorization !== 'Bearer ' + SECRET) {
                return route.fulfill({ status: 401, headers, body: '{}' });
            }
            const from = url.searchParams.get('from');
            const to = url.searchParams.get('to');
            const report = { from, to, timezone: 'Asia/Shanghai', generatedAt: Date.now(), page: 1, pageCount: 1,
                totals: { visitorDays: 2, pageViews: 3, visibleMs: 150000, readingMs: 90000, motionMs: 10000, readingViews: 2 },
                daily: [{ day: to, visitors: 2, pageViews: 3, visibleMs: 150000, readingMs: 90000 }],
                pages: [{ path: 'library/hometown/index.html', pageViews: 3, visibleMs: 150000, readingMs: 90000 }],
                regions: [{ country: 'CN', region: 'Guangdong', city: 'Shenzhen', pageViews: 3, visitorDays: 2 }],
                visits: [{ startedAt: Date.now(), path: 'library/hometown/index.html', country: 'CN', region: 'Guangdong',
                    city: '<script>window.unwanted=1</script>', visibleMs: 50000, readingMs: 30000, motionMs: 0 }],
                titles: { 'library/hometown/index.html': '故乡 · 全文' } };
            return route.fulfill({ status: 200, headers, contentType: 'application/json', body: JSON.stringify(report) });
        });
        const page = await context.newPage();
        page.on('pageerror', (error) => errors.push(error.message));
        await page.goto(BASE + 'library/hometown/index.html#p-0005');
        await page.bringToFront();
        await page.locator('#p-0005').click();
        await page.waitForTimeout(2300);
        await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
        await page.waitForFunction(() => true);
        await page.waitForTimeout(200);
        assert.ok(captured.length >= 2);
        assert.equal(captured[0].visibleMs, 0);
        assert.ok(captured.at(-1).visibleMs >= 1000);
        assert.ok(captured.at(-1).readingMs >= 1000);
        assert.equal(captured.at(-1).pageId, captured[0].pageId);
        assert.equal(captured[0].path, 'library/hometown/index.html');
        assert.equal(Object.hasOwn(captured[0], 'ip'), false);
        const visitor = captured[0].visitorId;
        await page.goto(BASE + 'library/medicine/index.html');
        await page.waitForTimeout(200);
        assert.equal(captured.at(-1).visitorId, visitor);
        assert.notEqual(captured.at(-1).pageId, captured[0].pageId);

        // 新共读区折叠时不累计正文时间；私人回应不能进入任何统计载荷。
        await page.goto(BASE + 'reading/kite-runner/index.html');
        await page.bringToFront();
        await page.locator('#reflectionText').fill('PRIVATE_KITE_RESPONSE_MUST_STAY_LOCAL');
        await page.locator('#saveResponse').click();
        await page.waitForTimeout(1300);
        await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
        await page.waitForTimeout(200);
        assert.equal(captured.at(-1).path, 'reading/kite-runner/index.html');
        assert.equal(captured.at(-1).readingMs, 0);
        await page.goto(BASE + 'reading/kite-runner/index.html#recognition');
        // 上一阶段主动触发 pagehide 停止采集；同页 hash 导航需重新载入以开启新访问。
        await page.reload();
        await page.locator('#recognition h2').click();
        await page.waitForTimeout(2300);
        await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
        await page.waitForTimeout(200);
        assert.ok(captured.at(-1).readingMs >= 1000);
        assert.doesNotMatch(JSON.stringify(captured), /PRIVATE_KITE_RESPONSE_MUST_STAY_LOCAL/);

        await page.goto(BASE + 'analytics/privacy.html');
        await page.locator('#toggleAnalytics').click();
        const afterOptOut = captured.length;
        await page.goto(BASE + 'library/hometown/index.html');
        await page.waitForTimeout(200);
        assert.equal(captured.length, afterOptOut);
        enabled = false;
        await page.evaluate(() => localStorage.removeItem('slowPagesAnalyticsOptOut'));
        await page.goto(BASE + 'library/hometown/index.html');
        await page.waitForTimeout(200);
        assert.equal(captured.length, afterOptOut);

        await page.goto(BASE + 'analytics/index.html');
        assert.equal(await page.locator('#visitorCount').innerText(), '—');

        // 复现用户粘贴说明文字和隐藏字符的情形：必须本地拦截，不能构造非法请求头。
        const invalidTokens = [
            { value: '', message: /请填写/ },
            { value: 'short-token', message: /32—200/ },
            { value: '其他中文说明：' + SECRET, message: /中文/ },
            { value: SECRET.slice(0, 10) + '\u200b' + SECRET.slice(10), message: /不可见字符/ },
            { value: SECRET.slice(0, 10) + ' ' + SECRET.slice(10), message: /空格/ },
            { value: 'x'.repeat(201), message: /32—200/ }
        ];
        for (const invalidToken of invalidTokens) {
            const requestCount = analyticsRequests.length;
            await page.locator('#adminToken').fill(invalidToken.value);
            await page.locator('#connectButton').click();
            assert.equal(await page.locator('#adminToken').getAttribute('aria-invalid'), 'true');
            assert.match(await page.locator('#tokenError').innerText(), invalidToken.message);
            assert.equal(analyticsRequests.length, requestCount);
            assert.match(await page.locator('#dashboardStatus').innerText(), /尚未发送验证请求/);
            assert.equal(await page.locator('#adminToken').inputValue(), invalidToken.value);
        }

        // 允许原样复制说明中的密钥行及首尾空白，服务端收到的凭据必须与原值完全一致。
        for (const label of ['管理密钥：', 'ADMIN_TOKEN:']) {
            await page.locator('#adminToken').fill('\ufeff  ' + label + ' ' + SECRET + '\u00a0');
            assert.equal(await page.locator('#tokenError').isVisible(), false);
            await page.locator('#connectButton').click();
            await page.waitForFunction(() => document.getElementById('visitorCount').textContent === '2');
            assert.equal(analyticsRequests.at(-1).authorization, 'Bearer ' + SECRET);
            assert.equal(await page.locator('#adminToken').inputValue(), '');
            await page.locator('#disconnectButton').click();
            await page.waitForFunction(() => document.getElementById('visitorCount').textContent === '—');
        }

        await page.locator('#adminToken').fill(SECRET);
        await page.locator('#connectButton').click();
        await page.waitForFunction(() => document.getElementById('visitorCount').textContent === '2');
        assert.equal(await page.locator('#averageStay').innerText(), '50秒');
        assert.equal(await page.locator('#averageReading').innerText(), '45秒');
        assert.equal(await page.evaluate(() => window.unwanted), undefined);
        assert.match(await page.locator('#visitRows').innerText(), /<script>/);
        assert.equal(await page.locator('#adminToken').inputValue(), '');
        assert.equal(await page.evaluate(() => JSON.stringify(localStorage).includes('local-browser-test-token')), false);
        assert.ok(analyticsRequests.every((headers) => headers.authorization === 'Bearer ' + SECRET));
        for (const width of [320, 390, 768, 1440]) {
            await page.setViewportSize({ width, height: 900 });
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), '看板宽度 ' + width);
        }
        // 截图只在本地测试资料中保存，明确标注模拟数据；不发布到用户看板。
        await page.evaluate(() => { document.getElementById('connectionBadge').textContent = '本地验收模拟数据 · 非真实访问'; });
        await page.screenshot({ path: path.join(OUTPUT, '01-统计看板-模拟数据.png'), fullPage: true });
        allowStats = false;
        await page.locator('#refreshButton').click();
        await page.waitForFunction(() => document.getElementById('connectionBadge').textContent.includes('连接失败'));
        assert.equal(await page.locator('#setupPanel').isVisible(), true);
        assert.match(await page.locator('#dashboardStatus').innerText(), /密钥不正确/);
        // 网络错误与密钥错误分开提示；不得回显原生 fetch 异常或密钥内容。
        statsOffline = true;
        await page.locator('#refreshButton').click();
        await page.waitForFunction(() => document.getElementById('dashboardStatus').textContent.includes('无法连接'));
        assert.match(await page.locator('#dashboardStatus').innerText(), /不代表管理密钥错误/);
        assert.equal((await page.locator('#dashboardStatus').innerText()).includes(SECRET), false);
        await page.locator('#disconnectButton').click();
        await page.waitForFunction(() => document.getElementById('visitorCount').textContent === '—');
        await page.screenshot({ path: path.join(OUTPUT, '02-待接入状态.png'), fullPage: true });
        assert.deepEqual(errors, []);
        await fs.writeFile(path.join(OUTPUT, 'browser-report.json'), JSON.stringify({ passed: true,
            network: '全部本地路由模拟，未访问真实服务', capturedEvents: captured.length, errors,
            checks: ['前台正文计时', '累计心跳', '跨页日访客', '退出统计', '禁用配置零请求',
                '私人看板鉴权', '均值分母', '地区转义', '密钥不落盘', '退出清空', '手机布局',
                '中文和隐藏字符零请求', '整行密钥前缀识别', '首尾空白清理', '原始密钥保持不变',
                '网络失败与密钥错误区分'] }, null, 4));
        console.log('采集脚本和私人看板浏览器验收通过。');
    } finally {
        await browser.close();
    }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
