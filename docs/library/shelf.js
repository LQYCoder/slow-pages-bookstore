/**
 * 首页组合选书、阅读恢复、篇幅排序与当前结果抽选。
 * 创建者：Codex；创建日期：2026/10/14。
 * 复用既有LibraryState存储，完成状态仍由读者主动标记。
 */
(function () {
    "use strict";
    const catalog = Array.isArray(window.CLASSIC_CATALOG) ? window.CLASSIC_CATALOG : [];
    const cards = Array.from(document.querySelectorAll("[data-classic-id]"));
    if (!catalog.length || !window.LibraryState || !window.BookDiscovery || !cards.length) {
        return;
    }
    const PERCENT_MAX = 100;
    const RANDOM_MAX = 4294967296;
    const bookMap = new Map(catalog.map((book) => [book.id, book]));
    const grid = document.querySelector(".classic-grid");
    const filters = { language: "all", theme: "all", time: "all", query: "", status: "all" };
    const getElement = (id) => document.getElementById(id);
    let visibleCards = cards.slice();
    let storage = null;
    try {
        storage = window.localStorage;
    } catch (error) {
        // 存储被禁用时仍显示完整静态书架和本次页面内的筛选。
    }
    const store = window.LibraryState.createStore(storage, catalog);

    /** 阅读过的记录与用户主动标记的读完分别处理。 */
    function getReadingStatus(record) {
        if (!record) {
            return "unread";
        }
        return record.completed === true ? "completed" : "reading";
    }

    /** 只使用目录中的稳定ID构造本站路径，不把本地存储当作任意链接。 */
    function getBookLink(book, record) {
        return "library/" + book.id + "/index.html"
            + (record && !record.completed ? "?resume=1" : "");
    }

    /** 恢复卡片阅读位置和继续阅读条；缺失组件时保留普通书籍链接。 */
    function refreshShelf() {
        const state = store.read();
        for (const card of cards) {
            const book = bookMap.get(card.dataset.classicId);
            if (!book) {
                continue;
            }
            const record = state.books[book.id];
            const label = card.querySelector("[data-book-state]");
            const progress = card.querySelector("[data-book-progress]");
            card.href = getBookLink(book, record);
            if (label) {
                label.textContent = !record ? "开始阅读 ↗" : record.completed
                    ? "已读完 · 再读一次 ↗" : "接着读 · 第 " + record.position + " 段 ↗";
            }
            if (progress) {
                const percent = !record ? 0 : record.completed ? PERCENT_MAX
                    : Math.round((record.position - 1) / Math.max(1, book.paragraphCount - 1) * PERCENT_MAX);
                progress.style.width = percent + "%";
            }
        }
        const lastBook = bookMap.get(state.lastBookId);
        const lastRecord = lastBook && state.books[lastBook.id];
        const resumeCard = getElement("libraryResumeCard");
        if (resumeCard) {
            resumeCard.hidden = !lastRecord;
        }
        const resumeTitle = getElement("libraryResumeTitle");
        const resumeLink = getElement("libraryResumeLink");
        if (lastBook && lastRecord && resumeTitle && resumeLink) {
            resumeTitle.textContent = "《" + lastBook.title + "》 · "
                + (lastRecord.completed ? "已经读完" : "上次读到第 " + lastRecord.position + " 段");
            resumeLink.href = getBookLink(lastBook, lastRecord);
            resumeLink.textContent = lastRecord.completed ? "再读一次 ↗" : "继续阅读 ↗";
        }
        filterShelf();
    }

    /** 语言、时间、主题、搜索和阅读状态取交集，空结果明确显示而不放宽条件。 */
    function filterShelf() {
        const state = store.read();
        visibleCards = cards.filter((card) => {
            const book = bookMap.get(card.dataset.classicId);
            const record = book && state.books[book.id];
            const visible = window.BookDiscovery.matches(book, filters)
                && (filters.status === "all" || filters.status === getReadingStatus(record));
            card.hidden = !visible;
            return visible;
        });
        const message = getElement("discoveryStatus");
        if (message) {
            message.textContent = visibleCards.length + " / " + cards.length + " 部作品";
        }
        const emptyState = getElement("emptyShelf");
        if (emptyState) {
            emptyState.hidden = visibleCards.length > 0;
        }
        const pickButton = getElement("pickBook");
        if (pickButton) {
            pickButton.disabled = !visibleCards.length;
        }
        const pickResult = getElement("pickResult");
        if (pickResult) {
            pickResult.hidden = true;
        }
    }

    /** 实际调整DOM顺序，让视觉排序和键盘Tab阅读顺序保持一致。 */
    function sortShelf() {
        const control = getElement("bookSort");
        if (!grid || !control) {
            return;
        }
        const choice = control.value;
        const orderedCards = cards.slice();
        if (choice === "short" || choice === "long") {
            orderedCards.sort((firstCard, secondCard) => {
                const first = window.BookDiscovery.getDetails(bookMap.get(firstCard.dataset.classicId));
                const second = window.BookDiscovery.getDetails(bookMap.get(secondCard.dataset.classicId));
                const difference = (first ? first.minutes : 0) - (second ? second.minutes : 0);
                return (choice === "long" ? -difference : difference)
                    || cards.indexOf(firstCard) - cards.indexOf(secondCard);
            });
        }
        grid.append(...orderedCards);
    }

    /** 从当前可见书目随机选择，并公开时间与筛选依据；不生成行为画像。 */
    function pickBook() {
        if (!visibleCards.length) {
            return;
        }
        const result = getElement("pickResult");
        const title = getElement("pickedBookTitle");
        const description = getElement("pickedBookDescription");
        const link = getElement("pickedBookLink");
        if (!result || !title || !description || !link) {
            return;
        }
        let randomRatio = Math.random();
        if (window.crypto && window.crypto.getRandomValues) {
            const randomValue = new Uint32Array(1);
            window.crypto.getRandomValues(randomValue);
            randomRatio = randomValue[0] / RANDOM_MAX;
        }
        const chosenCard = visibleCards[Math.floor(randomRatio * visibleCards.length)];
        const book = bookMap.get(chosenCard.dataset.classicId);
        const details = window.BookDiscovery.getDetails(book);
        title.textContent = "今天，读《" + book.title + "》";
        description.textContent = "从当前 " + visibleCards.length + " 部匹配作品中随机选出 · 约 "
            + details.minutes + " 分钟（估算）";
        link.href = chosenCard.href;
        result.hidden = false;
        result.focus({ preventScroll: true });
    }

    /** 重置界面条件，阅读记录和完成标记继续保留。 */
    function clearFilters() {
        Object.assign(filters, { language: "all", theme: "all", time: "all", query: "", status: "all" });
        for (const [id, value] of [
            ["readingTime", "all"], ["readingTheme", "all"], ["bookSearch", ""],
            ["bookStatus", "all"], ["bookSort", "default"]
        ]) {
            const control = getElement(id);
            if (control) {
                control.value = value;
            }
        }
        for (const button of document.querySelectorAll("[data-library-filter]")) {
            button.setAttribute("aria-pressed", String(button.dataset.libraryFilter === "all"));
        }
        sortShelf();
        filterShelf();
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
    for (const [id, key, eventName] of [
        ["readingTime", "time", "change"], ["readingTheme", "theme", "change"],
        ["bookStatus", "status", "change"], ["bookSearch", "query", "input"]
    ]) {
        const control = getElement(id);
        if (control) {
            control.addEventListener(eventName, () => {
                filters[key] = control.value;
                filterShelf();
            });
        }
    }
    for (const [id, handler] of [
        ["clearDiscovery", clearFilters], ["emptyReset", clearFilters], ["pickBook", pickBook]
    ]) {
        const button = getElement(id);
        if (button) {
            button.addEventListener("click", handler);
        }
    }
    const sortControl = getElement("bookSort");
    if (sortControl) {
        sortControl.addEventListener("change", sortShelf);
    }
    const dismissButton = getElement("dismissPick");
    if (dismissButton) {
        dismissButton.addEventListener("click", () => { getElement("pickResult").hidden = true; });
    }
    for (const control of document.querySelectorAll("[data-shelf-enhancement]")) {
        control.hidden = false;
    }
    refreshShelf();
    window.addEventListener("pageshow", refreshShelf);
    window.addEventListener("storage", (event) => {
        if (event.key === window.LibraryState.STORAGE_KEY) {
            refreshShelf();
        }
    });
})();
