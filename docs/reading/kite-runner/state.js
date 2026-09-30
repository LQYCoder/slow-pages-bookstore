/**
 * 单期共读的本机状态；与原有书签和统计完全分离，不接收或发送网络请求。
 * 创建者：Codex；创建日期：2026/09/30。
 */
(function (root, factory) {
    "use strict";
    const api = factory();
    if (typeof module === "object" && module.exports) {
        module.exports = api;
    } else {
        root.KiteJournalState = api;
    }
})(typeof window === "object" ? window : globalThis, function () {
    "use strict";
    const STORAGE_KEY = "slowPagesKiteJournalV1";
    const MAX_ANSWER_LENGTH = 500;
    const MAX_STORAGE_LENGTH = 12000;
    const CHAPTERS = Object.freeze([
        "recognition", "unequal", "silence", "memory", "father", "repair", "patience", "kite"
    ]);
    const PROMPTS = Object.freeze(["recognition", "responsibility", "patience"]);

    /** 只保留版本一的已知字段；损坏状态与未知章节不能影响链接或写入 HTML。 */
    function normalize(input) {
        const source = input && typeof input === "object" && input.version === 1 ? input : {};
        const answers = {};
        for (const prompt of PROMPTS) {
            const answer = source.answers && source.answers[prompt];
            answers[prompt] = typeof answer === "string" ? answer.slice(0, MAX_ANSWER_LENGTH) : "";
        }
        return {
            version: 1,
            chapter: CHAPTERS.includes(source.chapter) ? source.chapter : "",
            night: source.night === true,
            largeText: source.largeText === true,
            answers
        };
    }

    /**
     * 读取失败时保留内存副本；写入失败明确返回 persisted=false，不能提示已长期保存。
     * @param {Storage|null} storage 浏览器存储或测试替身。
     * @returns {object} read / write 两个隔离状态的接口。
     */
    function createStore(storage) {
        let memory = normalize(null);
        try {
            const stored = storage && storage.getItem(STORAGE_KEY);
            if (stored && stored.length <= MAX_STORAGE_LENGTH) {
                memory = normalize(JSON.parse(stored));
            }
        } catch (error) {
            // 隐私模式、非法 JSON 或配额异常不影响阅读；只有显式写入才替换本期状态。
        }
        return {
            read() {
                return normalize(memory);
            },
            write(next) {
                memory = normalize(next);
                try {
                    if (storage) {
                        storage.setItem(STORAGE_KEY, JSON.stringify(memory));
                        return { persisted: true, state: normalize(memory) };
                    }
                } catch (error) {
                    // 不回显私人文本或底层异常；调用者以友好提示告知导出备份。
                }
                return { persisted: false, state: normalize(memory) };
            }
        };
    }
    return Object.freeze({ createStore, normalize, CHAPTERS, PROMPTS, MAX_ANSWER_LENGTH, STORAGE_KEY });
});
