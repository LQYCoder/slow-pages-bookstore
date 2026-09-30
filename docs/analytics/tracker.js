/**
 * 匿名访问与阅读统计；禁用或服务异常时不影响阅读。
 * 创建者：Codex；创建日期：2026/09/28。
 * 不采集查询参数、书签、输入内容、录音或浏览器指纹；不在浏览器查询 IP。
 */
(function () {
    "use strict";
    const config = window.READING_ANALYTICS_CONFIG;
    const OPT_OUT_KEY = "slowPagesAnalyticsOptOut";
    const VISITOR_KEY = "slowPagesAnalyticsVisitorV1";
    const SAMPLE_INTERVAL_MS = 1000;
    const SEND_INTERVAL_MS = 30000;
    const MIN_RETRY_INTERVAL_MS = 10000;
    const SEND_TIMEOUT_MS = 8000;
    const MAX_VISITOR_LENGTH = 256;
    const UUID_PATTERN = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
    const ALLOWED_PATHS = new Set([
        "index.html", "reading/kite-runner/index.html", "reading/yangzhi-qiu/index.html", "reading/yangzhi-qiu/motion/index.html",
        "library/hometown/index.html", "library/kong-yiji/index.html", "library/madman-diary/index.html",
        "library/ah-q/index.html", "library/medicine/index.html", "library/boule-de-suif/index.html"
    ]);
    if (!config || !config.enabled || !window.ReadingMetrics || !crypto.randomUUID || location.protocol !== "https:") {
        return;
    }
    let endpoint;
    try {
        endpoint = new URL(config.endpoint || location.href);
    } catch (error) {
        return;
    }
    if (endpoint.protocol !== "https:" || !config.endpoint || !location.pathname.startsWith(config.siteBasePath)) {
        return;
    }
    const eventEndpoint = endpoint.href.replace(/\/$/, "") + "/events";
    const pagePath = location.pathname.slice(config.siteBasePath.length) || "index.html";
    if (!ALLOWED_PATHS.has(pagePath)) {
        return;
    }
    let storage = null;
    try {
        storage = window.localStorage;
    } catch (error) {
        // 存储禁用时标识只在此页存活，不降级为 IP/设备指纹追踪。
    }
    function optedOut() {
        if (navigator.globalPrivacyControl || navigator.doNotTrack === "1") {
            return true;
        }
        try {
            return storage && storage.getItem(OPT_OUT_KEY) === "1";
        } catch (error) {
            return false;
        }
    }
    if (optedOut()) {
        return;
    }
    let activeDay = window.ReadingMetrics.dayKey(Date.now());
    let pageId = crypto.randomUUID();
    let lastInputAt = performance.now();
    let visitorId = getVisitor(activeDay);
    let lastSendAt = -SEND_INTERVAL_MS;
    let lastPayload = "";
    let stopped = false;
    let suspended = false;
    let inFlight = false;
    let timer = null;
    let counter = window.ReadingMetrics.createCounter(performance.now(), flags());

    /** 每日仅留一个随机标识；解析长度有限，损坏数据按新访客处理。 */
    function getVisitor(day) {
        try {
            const raw = storage && storage.getItem(VISITOR_KEY);
            const value = raw && raw.length <= MAX_VISITOR_LENGTH ? JSON.parse(raw) : null;
            if (value && value.day === day && UUID_PATTERN.test(value.id)) {
                return value.id;
            }
        } catch (error) {
            // 无效记录不参与去重，后续覆盖为合法记录。
        }
        const identifier = crypto.randomUUID();
        try {
            if (storage) {
                storage.setItem(VISITOR_KEY, JSON.stringify({ day, id: identifier }));
            }
        } catch (error) {
            // 配额不足不阻断页面；统计文档已说明此情况的 UV 偏差。
        }
        return identifier;
    }

    /** 元素确实显示在可见视口时才视为阅读正文，封面和页尾不计阅读。 */
    function inViewport(element) {
        if (!element || !element.getClientRects().length || getComputedStyle(element).visibility === "hidden") {
            return false;
        }
        const bounds = element.getBoundingClientRect();
        return bounds.bottom > 120 && bounds.top < innerHeight - 80;
    }

    /** 全文、书评、原文选段与旧试读都计正文阅读；动态播放单独计时。 */
    function flags() {
        const dialog = document.querySelector("dialog[open]");
        const legacyReader = dialog && dialog.id === "readerDialog";
        const readingTarget = document.getElementById("novelText")
            || document.querySelector("#journalGate[open] #journalReading")
            || document.querySelector("#reviewPanel:not([hidden]) #review")
            || document.querySelector("#textPanel:not([hidden]) .source-paragraphs")
            || (legacyReader ? document.getElementById("chapterBody") : null);
        return {
            visible: !document.hidden,
            focused: document.hasFocus(),
            lastInputAt,
            reading: (!dialog || legacyReader) && inViewport(readingTarget),
            playing: !dialog && document.body.dataset.playing === "true"
        };
    }

    /** 跨日拆成新记录，防止昨天的累计阅读时间进入今天；不依赖定时器准时运行。 */
    function tick() {
        if (stopped || suspended) {
            return;
        }
        const today = window.ReadingMetrics.dayKey(Date.now());
        if (today !== activeDay) {
            send(true);
            activeDay = today;
            pageId = crypto.randomUUID();
            visitorId = getVisitor(today);
            counter = window.ReadingMetrics.createCounter(performance.now(), flags());
            lastPayload = "";
            lastSendAt = -SEND_INTERVAL_MS;
        }
        counter.sample(performance.now(), flags());
        if (performance.now() - lastSendAt >= SEND_INTERVAL_MS) {
            send(false);
        }
    }

    /** 上报累计值；同一页面 ID 重发不会增加 PV，服务端以最大累计时间合并。 */
    function send(beacon) {
        if (stopped || optedOut()) {
            return;
        }
        const body = JSON.stringify({ version: 1, pageId, visitorId, day: activeDay, path: pagePath,
            ...counter.snapshot() });
        if (body === lastPayload || (!beacon && inFlight)) {
            return;
        }
        const now = performance.now();
        if (!beacon && now - lastSendAt < MIN_RETRY_INTERVAL_MS) {
            return;
        }
        lastSendAt = now;
        if (beacon && navigator.sendBeacon) {
            const accepted = navigator.sendBeacon(eventEndpoint, new Blob([body], { type: "text/plain" }));
            if (accepted) {
                return;
            }
        }
        inFlight = true;
        const abortController = new AbortController();
        const timeout = window.setTimeout(() => abortController.abort(), SEND_TIMEOUT_MS);
        fetch(eventEndpoint, {
            method: "POST", body, headers: { "Content-Type": "text/plain" }, credentials: "omit", keepalive: true, signal: abortController.signal
        }).then((response) => {
            if (response.ok) {
                lastPayload = body;
            }
        }).catch(() => {
            // 网络或统计服务故障静默处理，下一次心跳重试，不展示影响阅读的报错。
        }).finally(() => {
            window.clearTimeout(timeout);
            inFlight = false;
        });
    }

    /** 停止统计时清理定时器并放弃补报；当前页面不再重新启用。 */
    function stop() {
        stopped = true;
        window.clearInterval(timer);
    }
    for (const name of ["pointerdown", "keydown", "scroll", "touchstart"]) {
        window.addEventListener(name, () => { lastInputAt = performance.now(); tick(); }, { passive: true, capture: true });
    }
    window.addEventListener("focus", tick);
    window.addEventListener("blur", tick);
    document.addEventListener("visibilitychange", () => {
        tick();
        if (document.hidden) {
            send(true);
        }
    });
    window.addEventListener("pagehide", () => {
        tick();
        send(true);
        counter.sample(performance.now(), { ...flags(), visible: false, focused: false });
        suspended = true;
        window.clearInterval(timer);
    });
    window.addEventListener("pageshow", (event) => {
        if (event.persisted && !stopped) {
            suspended = false;
            counter.sample(performance.now(), flags());
            timer = window.setInterval(tick, SAMPLE_INTERVAL_MS);
        }
    });
    window.addEventListener("storage", () => {
        if (optedOut()) {
            stop();
        }
    });
    timer = window.setInterval(tick, SAMPLE_INTERVAL_MS);
    send(false);
})();
