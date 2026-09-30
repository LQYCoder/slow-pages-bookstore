/** 首页经典书架：语言筛选与继续阅读。创建者：Codex；创建日期：2026/09/28。 */
(function () {
    "use strict";
    const catalog = window.CLASSIC_CATALOG;
    const cards = Array.from(document.querySelectorAll("[data-classic-id]"));
    let storage = null;
    try {
        storage = window.localStorage;
    } catch (error) {
        // 存储禁用仍显示静态书架，不阻止打开正文。
    }
    const store = window.LibraryState.createStore(storage, catalog);

    /** 仅使用静态白名单中的路径，所有状态文本通过 textContent 更新。 */
    function refreshShelf() {
        const state = store.read();
        for (const card of cards) {
            const bookId = card.dataset.classicId;
            const record = state.books[bookId];
            const label = card.querySelector("[data-book-state]");
            card.href = "library/" + bookId + "/index.html";
            label.textContent = "从第一页开始 →";
            if (record) {
                card.href += "?resume=1";
                label.textContent = record.completed ? "已读完 · 再读一次 →" : "接着读 · 第 " + record.position + " 段 →";
                if (record.completed) {
                    card.href = "library/" + bookId + "/index.html";
                }
            }
        }
        const lastBook = catalog.find((book) => book.id === state.lastBookId);
        const resumeCard = document.getElementById("libraryResumeCard");
        const lastRecord = lastBook && state.books[lastBook.id];
        resumeCard.hidden = !lastRecord;
        if (lastRecord) {
            document.getElementById("libraryResumeTitle").textContent = "《" + lastBook.title + "》 · "
                + (lastRecord.completed ? "已读完" : "上次读到第 " + lastRecord.position + " 段");
            const link = document.getElementById("libraryResumeLink");
            link.href = "library/" + lastBook.id + "/index.html" + (lastRecord.completed ? "" : "?resume=1");
            link.textContent = lastRecord.completed ? "再读一次 ↗" : "接着读 ↗";
        }
    }
    const filters = { language: "all", theme: "all", time: "all", query: "" };

    /** 统一组合语言、时间、主题和书名筛选，防止某个控件覆盖其余条件。 */
    function filterShelf() {
        let count = 0;
        for (const card of cards) {
            const book = catalog.find((item) => item.id === card.dataset.classicId);
            const visible = window.BookDiscovery.matches(book, filters);
            card.hidden = !visible;
            if (visible) {
                count += 1;
            }
        }
        document.getElementById("discoveryStatus").textContent = count
            ? "找到 " + count + " 部作品 · 估算基于阅读字数，可随时暂停。"
            : "这一组条件暂时没有合适的书。试试放宽时间或重置筛选。";
    }
    for (const button of document.querySelectorAll("[data-library-filter]")) {
        button.addEventListener("click", () => {
            filters.language = button.dataset.libraryFilter;
            for (const choice of document.querySelectorAll("[data-library-filter]")) {
                choice.setAttribute("aria-pressed", String(choice === button));
            }
            filterShelf();
        });
    }
    document.getElementById("readingTime").addEventListener("change", (event) => {
        filters.time = event.target.value;
        filterShelf();
    });
    document.getElementById("readingTheme").addEventListener("change", (event) => {
        filters.theme = event.target.value;
        filterShelf();
    });
    document.getElementById("bookSearch").addEventListener("input", (event) => {
        filters.query = event.target.value;
        filterShelf();
    });
    document.getElementById("clearDiscovery").addEventListener("click", () => {
        Object.assign(filters, { language: "all", theme: "all", time: "all", query: "" });
        document.getElementById("readingTime").value = "all";
        document.getElementById("readingTheme").value = "all";
        document.getElementById("bookSearch").value = "";
        for (const button of document.querySelectorAll("[data-library-filter]")) {
            button.setAttribute("aria-pressed", String(button.dataset.libraryFilter === "all"));
        }
        filterShelf();
    });
    document.querySelector(".library-tabs").hidden = false;
    document.querySelector(".shelf-discovery").hidden = false;
    filterShelf();
    refreshShelf();
    window.addEventListener("pageshow", refreshShelf);
    window.addEventListener("storage", refreshShelf);
})();
