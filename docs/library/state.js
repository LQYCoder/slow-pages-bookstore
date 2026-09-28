/**
 * 全文阅读的独立本地状态，不修改旧版原创试读数据。
 * 创建者：Codex；创建日期：2026/09/28。
 * 工厂接收存储对象，方便在不访问浏览器或网络的情况下测试异常与边界。
 */
(function (root) {
    "use strict";
    const STORAGE_KEY = "slowPagesLibraryV1";
    const VERSION = 1;
    const MAX_STORAGE_LENGTH = 100000;
    const FONT_SIZES = [18, 21, 24, 28];
    const THEMES = ["paper", "sage", "night"];
    const DEFAULT_FONT_SIZE = 21;

    /** 创建空状态；不复用可变对象，避免测试或多页共享引用。 */
    function emptyState() {
        return { version: VERSION, settings: { fontSize: DEFAULT_FONT_SIZE, theme: "paper" },
            lastBookId: "", books: {} };
    }

    /** 只接受有限枚举与当前目录中的有效段号，忽略未知书名和字段。 */
    function normalize(input, catalog) {
        const clean = emptyState();
        if (!input || Array.isArray(input) || input.version !== VERSION) {
            return clean;
        }
        const settings = input.settings || {};
        if (FONT_SIZES.includes(settings.fontSize)) {
            clean.settings.fontSize = settings.fontSize;
        }
        if (THEMES.includes(settings.theme)) {
            clean.settings.theme = settings.theme;
        }
        for (const book of catalog) {
            const record = input.books && input.books[book.id];
            if (!record || typeof record !== "object" || Array.isArray(record)) {
                continue;
            }
            const validPosition = Number.isInteger(record.position)
                && record.position >= 1 && record.position <= book.paragraphCount;
            const validBookmark = Number.isInteger(record.bookmark)
                && record.bookmark >= 1 && record.bookmark <= book.paragraphCount;
            clean.books[book.id] = {
                position: validPosition ? record.position : 1,
                bookmark: validBookmark ? record.bookmark : null,
                completed: record.completed === true,
                updatedAt: Number.isSafeInteger(record.updatedAt) && record.updatedAt >= 0 ? record.updatedAt : 0
            };
        }
        if (catalog.some((book) => book.id === input.lastBookId) && clean.books[input.lastBookId]) {
            clean.lastBookId = input.lastBookId;
        }
        return clean;
    }

    /**
     * 创建存储适配器。
     * @param {Storage|null} storage 浏览器存储，禁用时传 null。
     * @param {Array} catalog 已验证的静态作品清单。
     * @param {Function} onError 将可恢复的存储问题显示给读者。
     * @returns {Object} 读取与局部更新方法；写入失败返回 false。
     */
    function createStore(storage, catalog, onError = () => {}) {
        let memory = emptyState();
        let volatileMode = false;
        function read() {
            if (volatileMode) {
                return normalize(memory, catalog);
            }
            try {
                if (!storage) {
                    throw new Error("Storage unavailable");
                }
                const raw = storage.getItem(STORAGE_KEY);
                if (raw && raw.length > MAX_STORAGE_LENGTH) {
                    throw new Error("Storage record exceeds limit");
                }
                memory = normalize(raw ? JSON.parse(raw) : null, catalog);
            } catch (error) {
                onError("阅读记录暂时无法恢复，仍可继续阅读；本页可暂存操作，但刷新后可能丢失。");
            }
            return normalize(memory, catalog);
        }
        function write(next) {
            memory = normalize(next, catalog);
            try {
                if (!storage) {
                    throw new Error("Storage unavailable");
                }
                storage.setItem(STORAGE_KEY, JSON.stringify(memory));
                volatileMode = false;
                return true;
            } catch (error) {
                volatileMode = true;
                onError("浏览器未能保存阅读记录。正文仍可阅读，本次位置与设置仅在本页临时保留。");
                return false;
            }
        }
        function updateBook(bookId, patch) {
            if (!catalog.some((book) => book.id === bookId)) {
                return false;
            }
            // 每次写入前读取最新记录，保留其他标签页刚刚保存的其他作品与设置。
            const next = read();
            next.books[bookId] = { ...next.books[bookId], ...patch, updatedAt: Date.now() };
            next.lastBookId = bookId;
            return write(next);
        }
        function updateSettings(patch) {
            const next = read();
            next.settings = { ...next.settings, ...patch };
            return write(next);
        }
        return Object.freeze({ read, updateBook, updateSettings });
    }
    const api = Object.freeze({ createStore, normalize, STORAGE_KEY, FONT_SIZES, THEMES });
    if (typeof module === "object" && module.exports) {
        module.exports = api;
    } else {
        root.LibraryState = api;
    }
})(typeof window === "undefined" ? globalThis : window);
