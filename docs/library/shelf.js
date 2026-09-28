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
    for (const button of document.querySelectorAll("[data-library-filter]")) {
        button.addEventListener("click", () => {
            for (const choice of document.querySelectorAll("[data-library-filter]")) {
                choice.setAttribute("aria-pressed", String(choice === button));
            }
            for (const card of cards) {
                const filter = button.dataset.libraryFilter;
                card.hidden = filter !== "all" && card.dataset.language !== filter;
            }
        });
    }
    document.querySelector(".library-tabs").hidden = false;
    refreshShelf();
    window.addEventListener("pageshow", refreshShelf);
    window.addEventListener("storage", refreshShelf);
})();
