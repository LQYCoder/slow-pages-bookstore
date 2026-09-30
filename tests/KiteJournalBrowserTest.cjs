/** 新专题与首页交互回归；隔离浏览器，只使用本地文件。创建者：Codex；2026/09/30。 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const ROOT = path.resolve(__dirname, "..");
const OUTPUT = path.join(ROOT, "创意升级验收");
const HOME = "file://" + path.join(ROOT, "docs/index.html");
const JOURNAL = "file://" + path.join(ROOT, "docs/reading/kite-runner/index.html");
const WIDTHS = [320, 390, 768, 1440];

/** 开合状态、字号与屏宽变化都不能产生整页水平溢出。 */
async function checkWidths(page) {
    for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 950 });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
            "overflow: " + width + " / " + page.url());
    }
}

async function main() {
    await fs.mkdir(OUTPUT, { recursive: true });
    const browser = await chromium.launch({
        executablePath: process.env.CHROME_EXECUTABLE || undefined, headless: true
    });
    try {
        const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, reducedMotion: "reduce" });
        const page = await context.newPage();
        const errors = [];
        const network = [];
        page.on("pageerror", (error) => errors.push(error.message));
        page.on("request", (request) => {
            if (/^https?:/.test(request.url())) {
                network.push(request.url());
            }
        });
        await page.goto(HOME);
        assert.equal(await page.locator(".classic-card:visible").count(), 6);
        await page.locator("#readingTime").selectOption("10");
        assert.equal(await page.locator(".classic-card:visible h3").textContent(), "孔乙己");
        await page.locator('[data-library-filter="fr"]').click();
        assert.equal(await page.locator(".classic-card:visible").count(), 0);
        assert.match(await page.locator("#discoveryStatus").textContent(), /暂时没有/);
        await page.locator("#clearDiscovery").click();
        await page.locator("#bookSearch").fill("故乡");
        assert.equal(await page.locator(".classic-card:visible").count(), 1);
        await page.locator("#clearDiscovery").click();
        await page.locator("#readingTheme").selectOption("relationships");
        assert.equal(await page.locator(".classic-card:visible").count(), 3);
        await page.locator("#clearDiscovery").click();
        await checkWidths(page);
        await page.evaluate(() => scrollTo(0, 0));
        await page.screenshot({ path: path.join(OUTPUT, "01-首页-电脑.png"), fullPage: true });
        await page.setViewportSize({ width: 390, height: 844 });
        await page.screenshot({ path: path.join(OUTPUT, "02-首页-手机.png"), fullPage: true });
        await page.goto(JOURNAL);
        assert.equal(await page.locator("#journalGate").getAttribute("open"), null);
        assert.equal(await page.locator("#journalReading").isVisible(), false);
        await checkWidths(page);
        await page.evaluate(() => scrollTo(0, 0));
        await page.screenshot({ path: path.join(OUTPUT, "03-共读-电脑.png"), fullPage: true });
        await page.locator("#journalGate > summary").click();
        assert.equal(await page.locator("[data-chapter]").count(), 8);
        await page.locator('[data-lens="hassan"]').click();
        assert.match(await page.locator("#lensBody").textContent(), /阶层与族群/);
        await page.locator('[data-lens="sohrab"]').click();
        assert.match(await page.locator("#lensBody").textContent(), /沉默/);
        await page.locator("#themeButton").click();
        await page.locator("#fontButton").click();
        await checkWidths(page);
        await page.locator("#themeButton").click();
        await page.locator("#fontButton").click();
        await page.locator("#reflectionText").fill('<img src=x onerror="alert(1)">这是私人回应');
        await page.locator("#saveResponse").click();
        assert.match(await page.locator("#responseStatus").textContent(), /已保存/);
        await page.locator("#promptChoice").selectOption("patience");
        assert.equal(await page.locator("#reflectionText").inputValue(), "");
        await page.locator("#reflectionText").fill("等待，不催促。");
        await page.locator("#saveResponse").click();
        await page.reload();
        assert.match(await page.locator("#reflectionText").inputValue(), /私人回应/);
        assert.equal(await page.locator(".reflection-form img").count(), 0);
        await page.locator("#promptChoice").selectOption("patience");
        assert.equal(await page.locator("#reflectionText").inputValue(), "等待，不催促。");
        const responseDownload = page.waitForEvent("download");
        await page.locator("#exportResponse").click();
        const responseFile = await responseDownload;
        const responseText = await fs.readFile(await responseFile.path(), "utf8");
        assert.match(responseText, /私人回应/);
        assert.match(responseText, /等待，不催促/);
        await page.locator("#cardChoice").selectOption("2");
        assert.match(await page.locator("#cardText").textContent(), /被救的人/);
        const cardDownload = page.waitForEvent("download");
        await page.locator("#saveCard").click();
        const cardFile = await cardDownload;
        const cardBytes = await fs.readFile(await cardFile.path());
        assert.equal(cardBytes.readUInt32BE(16), 1800);
        assert.equal(cardBytes.readUInt32BE(20), 2400);
        await cardFile.saveAs(path.join(OUTPUT, "阅读卡导出验收.png"));
        page.once("dialog", (dialog) => dialog.accept());
        await page.locator("#clearResponse").click();
        assert.equal(await page.locator("#reflectionText").inputValue(), "");
        await page.locator("#promptChoice").selectOption("recognition");
        assert.match(await page.locator("#reflectionText").inputValue(), /私人回应/);
        await page.goto(JOURNAL + "#patience");
        assert.equal(await page.locator("#journalGate").getAttribute("open"), "");
        await page.locator("#patience").evaluate((element) => {
            element.scrollIntoView({ block: "start", behavior: "instant" });
        });
        await page.waitForFunction(() => {
            return JSON.parse(localStorage.getItem("slowPagesKiteJournalV1")).chapter === "patience";
        });
        await page.goto(JOURNAL);
        assert.equal(await page.locator("#resumeJournal").getAttribute("href"), "#patience");
        await page.locator("#journalGate > summary").click();
        await page.setViewportSize({ width: 390, height: 844 });
        await page.locator("#recognition").scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(OUTPUT, "04-共读-手机.png") });
        assert.deepEqual(errors, []);
        assert.deepEqual(network, []);
        const noScript = await browser.newContext({ javaScriptEnabled: false });
        const staticPage = await noScript.newPage();
        await staticPage.goto(JOURNAL);
        await staticPage.locator("#journalGate > summary").click();
        assert.equal(await staticPage.locator("#journalReading").isVisible(), true);
        console.log("通过：组合筛选、剧透开合、三视角、私密回应、续读、高清导出、4 种屏宽与无 JS 阅读。");
    } finally {
        await browser.close();
    }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
