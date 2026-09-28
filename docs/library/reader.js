/**
 * 全文页渐进增强：段落定位、单枚书签、共享设置与阅读恢复。
 * 创建者：Codex；创建日期：2026/09/28。
 * 正文已经存在 HTML 中，脚本失效不会阻止阅读。
 */
(function () {
    "use strict";
    const PARAGRAPH_PREFIX = "p-";
    const PARAGRAPH_PADDING = 4;
    const READING_LINE = 140;
    const WRITE_DELAY = 450;
    const STATUS_DURATION = 3500;
    const PERCENT_MAX = 100;
    const bookId = document.body.dataset.bookId;
    const catalog = window.CLASSIC_CATALOG;
    const book = catalog.find((item) => item.id === bookId);
    const paragraphs = Array.from(document.querySelectorAll("[data-paragraph]"));
    if (!book || paragraphs.length !== book.paragraphCount) {
        return;
    }
    const getElement = (id) => document.getElementById(id);
    const notice = getElement("storageNotice");
    const status = getElement("readerStatus");
    let storage = null;
    try {
        storage = window.localStorage;
    } catch (error) {
        // 沙盒或隐私设置可能连属性读取也禁止，交给适配器显示可恢复提示。
    }
    const store = window.LibraryState.createStore(storage, catalog, (message) => {
        notice.hidden = false;
        notice.textContent = message;
    });
    const initial = store.read();
    let currentPosition = 1;
    let pendingPosition = null;
    let frameId = null;
    let saveTimer = null;
    let statusTimer = null;
    let currentRecord = initial.books[bookId] || {};
    const contentsDialog = getElement("contentsDialog");
    const settingsDialog = getElement("settingsDialog");

    /** 段号只由已验证数据构造；不将存储内容拼接为任意 URL 或 HTML。 */
    function paragraphHash(position) {
        return "#" + PARAGRAPH_PREFIX + String(position).padStart(PARAGRAPH_PADDING, "0");
    }

    /** 状态信息不夺取键盘焦点；保存失败由持久提示解释。 */
    function announce(message) {
        window.clearTimeout(statusTimer);
        status.textContent = message;
        statusTimer = window.setTimeout(() => { status.textContent = ""; }, STATUS_DURATION);
    }

    /** 应用已校验的排版枚举，字号变化后重新测量段落位置。 */
    function applySettings(settings) {
        document.body.dataset.theme = settings.theme;
        document.documentElement.style.setProperty("--reading-font", settings.fontSize + "px");
        getElement("readingFont").value = String(settings.fontSize);
        for (const button of document.querySelectorAll("[data-reading-theme]")) {
            button.setAttribute("aria-pressed", String(button.dataset.readingTheme === settings.theme));
        }
    }

    /** 书签与完成状态由用户主动操作；滚动到结尾不会擅自标成“已读完”。 */
    function updateSavedControls() {
        const bookmark = currentRecord.bookmark;
        getElement("goBookmark").disabled = !bookmark;
        getElement("goBookmark").title = bookmark ? "回到第 " + bookmark + " 段" : "先留下一枚书签";
        getElement("markCompleted").setAttribute("aria-pressed", String(currentRecord.completed === true));
        getElement("markCompleted").textContent = currentRecord.completed
            ? "已读完 · 点击撤销" : "标记读完这部作品 ✓";
    }

    /** 延迟落盘，避免每次滚动都同步写入 localStorage。 */
    function flushPosition() {
        window.clearTimeout(saveTimer);
        saveTimer = null;
        if (pendingPosition === null) {
            return;
        }
        store.updateBook(bookId, { position: pendingPosition });
        currentRecord = store.read().books[bookId] || currentRecord;
        pendingPosition = null;
    }

    /** 二分查找阅读线穿过的段落，长文不必在每一帧遍历所有段落。 */
    function measurePosition() {
        frameId = null;
        let low = 0;
        let high = paragraphs.length - 1;
        while (low < high) {
            const middle = Math.floor((low + high) / 2);
            if (paragraphs[middle].getBoundingClientRect().bottom < READING_LINE) {
                low = middle + 1;
            } else {
                high = middle;
            }
        }
        currentPosition = low + 1;
        const percentage = Math.round(low / Math.max(1, paragraphs.length - 1) * PERCENT_MAX);
        getElement("readingProgress").value = percentage;
        getElement("positionText").textContent = "第 " + currentPosition + " / " + paragraphs.length + " 段";
        const chapter = paragraphs[low].closest(".novel-chapter");
        for (const anchor of document.querySelectorAll(".chapter-toc a")) {
            if (anchor.hash === "#" + chapter.id) {
                anchor.setAttribute("aria-current", "location");
            } else {
                anchor.removeAttribute("aria-current");
            }
        }
        // 初次停在封面不会把原有阅读记录覆盖成第一页。
        const insideText = getElement("novelText").getBoundingClientRect().top <= READING_LINE;
        if (insideText && currentPosition !== currentRecord.position) {
            pendingPosition = currentPosition;
            window.clearTimeout(saveTimer);
            saveTimer = window.setTimeout(flushPosition, WRITE_DELAY);
        }
    }

    /** 合并同帧滚动与尺寸变化，保留单一待执行任务。 */
    function scheduleMeasure() {
        if (frameId === null) {
            frameId = window.requestAnimationFrame(measurePosition);
        }
    }

    /** 跳转到正文段落后可用键盘继续阅读，避免焦点滞留在已关闭对话框。 */
    function goToParagraph(position) {
        const paragraph = paragraphs[position - 1];
        if (!paragraph) {
            return;
        }
        window.location.hash = paragraphHash(position);
        paragraph.focus({ preventScroll: true });
        paragraph.scrollIntoView({ block: "start" });
        scheduleMeasure();
    }

    document.documentElement.classList.add("reader-ready");
    applySettings(initial.settings);
    updateSavedControls();
    const resume = getElement("resumeReading");
    if (currentRecord.position > 1) {
        resume.hidden = false;
        resume.href = paragraphHash(currentRecord.position);
        resume.textContent = "接着上次 · 第 " + currentRecord.position + " 段 ↓";
    }
    getElement("openContents").addEventListener("click", () => { contentsDialog.showModal(); });
    getElement("openSettings").addEventListener("click", () => { settingsDialog.showModal(); });
    for (const link of contentsDialog.querySelectorAll("a")) {
        link.addEventListener("click", () => { contentsDialog.close(); });
    }
    getElement("readingFont").addEventListener("change", (event) => {
        const settings = { ...store.read().settings, fontSize: Number(event.target.value) };
        applySettings(settings);
        store.updateSettings(settings);
        scheduleMeasure();
    });
    for (const button of document.querySelectorAll("[data-reading-theme]")) {
        button.addEventListener("click", () => {
            const settings = { ...store.read().settings, theme: button.dataset.readingTheme };
            applySettings(settings);
            store.updateSettings(settings);
        });
    }
    getElement("saveBookmark").addEventListener("click", () => {
        const saved = store.updateBook(bookId, { position: currentPosition, bookmark: currentPosition });
        currentRecord = store.read().books[bookId] || { ...currentRecord, bookmark: currentPosition };
        updateSavedControls();
        announce(saved ? "书签已留在第 " + currentPosition + " 段（每部作品保留一枚）" : "书签仅在本页临时保留");
    });
    getElement("goBookmark").addEventListener("click", () => { goToParagraph(currentRecord.bookmark); });
    getElement("markCompleted").addEventListener("click", () => {
        flushPosition();
        const completed = !currentRecord.completed;
        const saved = store.updateBook(bookId, { completed, position: currentPosition });
        currentRecord = store.read().books[bookId] || { ...currentRecord, completed };
        updateSavedControls();
        announce(saved ? (completed ? "已记下这次完整阅读。" : "已撤销读完标记。") : "读完标记仅在本页临时保留");
    });
    window.addEventListener("scroll", scheduleMeasure, { passive: true });
    window.addEventListener("resize", scheduleMeasure);
    window.addEventListener("pagehide", () => {
        flushPosition();
        window.cancelAnimationFrame(frameId);
        window.clearTimeout(statusTimer);
        frameId = null;
    });
    document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
            flushPosition();
        }
    });
    window.addEventListener("storage", (event) => {
        if (event.key === window.LibraryState.STORAGE_KEY) {
            const latest = store.read();
            currentRecord = latest.books[bookId] || {};
            applySettings(latest.settings);
            updateSavedControls();
        }
    });
    // 明确的段落深链优先于“继续阅读”，不把场景定位强行覆盖成上次位置。
    if (!window.location.hash && new URLSearchParams(window.location.search).get("resume") === "1") {
        goToParagraph(currentRecord.position || 1);
    }
    scheduleMeasure();
})();
