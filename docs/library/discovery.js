/** 本地选书规则，不使用模型或行为画像。创建者：Codex；2026/09/30。 */
(function (root, factory) {
    "use strict";
    const api = factory();
    if (typeof module === "object" && module.exports) {
        module.exports = api;
    } else {
        root.BookDiscovery = api;
    }
})(typeof window === "object" ? window : globalThis, function () {
    "use strict";
    // 中文按约 300 字/分钟，法文按约 200 词/分钟估算并取整；仅帮助规划，不用于成绩或统计。
    const BOOKS = Object.freeze({
        "hometown": { author: "鲁迅", minutes: 15, themes: ["relationships"] },
        "kong-yiji": { author: "鲁迅", minutes: 8, themes: ["crowds", "self"] },
        "madman-diary": { author: "鲁迅", minutes: 14, themes: ["crowds", "self"] },
        "ah-q": { author: "鲁迅", minutes: 60, themes: ["self", "crowds"] },
        "medicine": { author: "鲁迅", minutes: 13, themes: ["crowds", "relationships"] },
        "boule-de-suif": { author: "莫泊桑", minutes: 67, themes: ["relationships", "crowds"] }
    });
    const SHORT_READING_MINUTES = 20;
    const MAX_QUERY_LENGTH = 80;

    /** 所有条件取交集；空结果是正常状态，不偷偷放宽读者的筛选条件。 */
    function matches(book, filters) {
        const details = BOOKS[book.id];
        if (!details) {
            return false;
        }
        const choices = filters || {};
        const query = typeof choices.query === "string" ? choices.query.slice(0, MAX_QUERY_LENGTH).trim() : "";
        const searchText = (book.title + details.author).toLocaleLowerCase();
        const languageMatch = !choices.language || choices.language === "all" || book.language === choices.language;
        const themeMatch = !choices.theme || choices.theme === "all" || details.themes.includes(choices.theme);
        const timeMatch = !choices.time || choices.time === "all"
            || (choices.time === "long" ? details.minutes > SHORT_READING_MINUTES
                : Number.isFinite(Number(choices.time)) && details.minutes <= Number(choices.time));
        return languageMatch && themeMatch && timeMatch && searchText.includes(query.toLocaleLowerCase());
    }
    return Object.freeze({ matches, BOOKS });
});
