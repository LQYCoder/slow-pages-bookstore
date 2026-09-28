/** 纯时间累计器，可离线单元测试。创建者：Codex；创建日期：2026/09/28。 */
(function (root) {
    "use strict";
    const IDLE_LIMIT_MS = 60000;
    const MAX_SAMPLE_GAP_MS = 5000;
    const DAY_OFFSET_MS = 8 * 60 * 60 * 1000;
    const DAY_LENGTH_MS = 24 * 60 * 60 * 1000;

    /** 按北京时间产生日期键；不依赖访客设备的本地时区。 */
    function dayKey(epochMilliseconds) {
        return new Date(epochMilliseconds + DAY_OFFSET_MS).toISOString().slice(0, 10);
    }

    /**
     * 以相邻采样间的前一状态计算时间，隐藏事件不会把刚发生的前台时间抹掉。
     * 长时间调度中断视为休眠而不补记；阅读超过空闲阈值的部分不累计。
     */
    function createCounter(initialTime, initialFlags) {
        let lastTime = initialTime;
        let flags = { ...initialFlags };
        const totals = { visibleMs: 0, readingMs: 0, motionMs: 0 };
        function sample(now, nextFlags) {
            const elapsed = Math.max(0, now - lastTime);
            if (Number.isFinite(elapsed) && elapsed <= MAX_SAMPLE_GAP_MS && flags.visible && flags.focused) {
                totals.visibleMs = Math.min(DAY_LENGTH_MS, totals.visibleMs + elapsed);
                const activeEnd = Math.min(now, flags.lastInputAt + IDLE_LIMIT_MS);
                const activeElapsed = Math.max(0, activeEnd - lastTime);
                if (flags.reading) {
                    totals.readingMs = Math.min(DAY_LENGTH_MS, totals.readingMs + activeElapsed);
                }
                if (flags.playing) {
                    totals.motionMs = Math.min(DAY_LENGTH_MS, totals.motionMs + elapsed);
                }
            }
            lastTime = now;
            flags = { ...nextFlags };
            return snapshot();
        }
        function snapshot() {
            return Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, Math.floor(value)]));
        }
        return Object.freeze({ sample, snapshot });
    }
    const api = Object.freeze({ createCounter, dayKey, IDLE_LIMIT_MS });
    if (typeof module === "object" && module.exports) {
        module.exports = api;
    } else {
        root.ReadingMetrics = api;
    }
})(typeof window === "undefined" ? globalThis : window);
