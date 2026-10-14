/**
 * 全文页渐进增强：段落定位、单枚书签、共享设置、阅读恢复与专注阅读。
 * 创建者：Codex；创建日期：2026/09/28；更新日期：2026/10/14。
 * 正文已经存在 HTML 中；脚本或依赖缺失时保留原始正文与静态目录。
 * 新增的专注状态只存在于当前页面，不改变 LibraryState 的持久化结构。
 */
(function () {
    "use strict";

    const PARAGRAPH_PREFIX = "p-";
    const PARAGRAPH_PADDING = 4;
    const READING_LINE = 140;
    const WRITE_DELAY = 450;
    const STATUS_DURATION = 3500;
    const PERCENT_MAX = 100;
    const FIRST_POSITION = 1;
    const REQUIRED_IDS = [
        "storageNotice", "readerStatus", "readingFont", "goBookmark", "markCompleted",
        "readingProgress", "positionText", "novelText", "resumeReading", "openContents",
        "openSettings", "saveBookmark", "contentsDialog", "settingsDialog"
    ];
    const body = document.body;
    const catalog = window.CLASSIC_CATALOG;
    const stateApi = window.LibraryState;

    // 依赖和页面结构必须同时就绪，才能显示增强控件；否则仍可阅读静态正文。
    const validCatalog = Array.isArray(catalog) && catalog.every((entry) => entry
        && typeof entry.id === "string" && Number.isInteger(entry.paragraphCount)
        && entry.paragraphCount >= FIRST_POSITION);
    if (!body || !validCatalog || !stateApi || typeof stateApi.createStore !== "function") {
        return;
    }

    const bookId = body.dataset.bookId;
    const book = catalog.find((entry) => entry.id === bookId);
    const paragraphs = Array.from(document.querySelectorAll("[data-paragraph]"));
    const elements = Object.fromEntries(REQUIRED_IDS.map((id) => [id, document.getElementById(id)]));
    const completeElements = REQUIRED_IDS.every((id) => elements[id]);
    const completeParagraphs = book && paragraphs.length === book.paragraphCount
        && paragraphs.every((paragraph, index) => Number(paragraph.dataset.paragraph) === index + FIRST_POSITION);
    if (!completeElements || !completeParagraphs) {
        return;
    }

    const contentsDialog = elements.contentsDialog;
    const settingsDialog = elements.settingsDialog;
    if (typeof contentsDialog.showModal !== "function" || typeof settingsDialog.showModal !== "function") {
        return;
    }

    const chapterLinks = Array.from(document.querySelectorAll(".chapter-toc a"));
    const header = document.querySelector(".reading-header");
    let storage = null;
    try {
        storage = window.localStorage;
    } catch (error) {
        // 隐私设置可能禁止读取 localStorage 属性，交给状态适配器转为临时保存提示。
    }
    const store = stateApi.createStore(storage, catalog, (message) => {
        elements.storageNotice.hidden = false;
        elements.storageNotice.textContent = message;
    });
    const initial = store.read();
    let currentPosition = FIRST_POSITION;
    let pendingPosition = null;
    let frameId = null;
    let saveTimer = null;
    let statusTimer = null;
    let currentRecord = initial.books[bookId] || {};
    let focusedReading = false;
    let focusButton = null;
    let focusSettingButton = null;
    let readingRange = null;
    let readingPercent = null;
    let readingChapter = null;

    /** 段号只由已验证数据构造，不将存储内容拼接为任意 URL 或 HTML。 */
    function paragraphHash(position) {
        return "#" + PARAGRAPH_PREFIX + String(position).padStart(PARAGRAPH_PADDING, "0");
    }

    /** 按段落序号计算进度，清楚表达阅读位置，不将它伪称为停留时间。 */
    function getPercentage(position) {
        return Math.round((position - FIRST_POSITION) / Math.max(FIRST_POSITION, paragraphs.length - FIRST_POSITION)
            * PERCENT_MAX);
    }

    /** 状态信息不夺取键盘焦点，保存失败由持久提示解释。 */
    function announce(message) {
        window.clearTimeout(statusTimer);
        elements.readerStatus.textContent = message;
        statusTimer = window.setTimeout(() => {
            elements.readerStatus.textContent = "";
        }, STATUS_DURATION);
    }

    /** 应用状态适配器已校验的排版枚举，字号变化后重新测量段落位置。 */
    function applySettings(settings) {
        body.dataset.theme = settings.theme;
        document.documentElement.style.setProperty("--reading-font", settings.fontSize + "px");
        elements.readingFont.value = String(settings.fontSize);
        for (const button of document.querySelectorAll("[data-reading-theme]")) {
            button.setAttribute("aria-pressed", String(button.dataset.readingTheme === settings.theme));
        }
    }

    /** 书签与完成状态由用户主动操作，滚动到结尾不会擅自标成已读完。 */
    function updateSavedControls() {
        const bookmark = currentRecord.bookmark;
        elements.goBookmark.disabled = !bookmark;
        elements.goBookmark.title = bookmark ? "回到第 " + bookmark + " 段" : "先留下一枚书签";
        elements.markCompleted.setAttribute("aria-pressed", String(currentRecord.completed === true));
        elements.markCompleted.textContent = currentRecord.completed
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

    /** 同步原有进度元素与可操作滑条，始终保留旧 ID 供既有深链和统计脚本使用。 */
    function updateProgress(position) {
        const percentage = getPercentage(position);
        elements.readingProgress.value = percentage;
        elements.positionText.textContent = "第 " + position + " / " + paragraphs.length + " 段";
        if (readingPercent && readingRange) {
            readingPercent.textContent = percentage + "%";
            readingRange.value = String(position);
            readingRange.setAttribute("aria-valuetext", "第 " + position + " 段，共 " + paragraphs.length + " 段");
            readingRange.style.setProperty("--reader-progress", percentage + "%");
        }
    }

    /** 二分查找阅读线穿过的段落，长文不必在每一帧遍历所有段落。 */
    function measurePosition() {
        frameId = null;
        let low = 0;
        let high = paragraphs.length - FIRST_POSITION;
        while (low < high) {
            const middle = Math.floor((low + high) / 2);
            if (paragraphs[middle].getBoundingClientRect().bottom < READING_LINE) {
                low = middle + FIRST_POSITION;
            } else {
                high = middle;
            }
        }
        currentPosition = low + FIRST_POSITION;
        updateProgress(currentPosition);
        const chapter = paragraphs[low].closest(".novel-chapter");
        for (const anchor of chapterLinks) {
            if (chapter && anchor.hash === "#" + chapter.id) {
                anchor.setAttribute("aria-current", "location");
            } else {
                anchor.removeAttribute("aria-current");
            }
        }
        const heading = chapter && chapter.querySelector("h2");
        if (readingChapter) {
            readingChapter.textContent = heading ? heading.textContent : "正在阅读";
        }
        // 初次停在书籍封面不会把已有记录覆盖成第一页。
        const insideText = elements.novelText.getBoundingClientRect().top <= READING_LINE;
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

    /** 普通跳转将焦点移至正文；滑条定位保留控件焦点，允许连续使用方向键。 */
    function goToParagraph(position, focusParagraph = true) {
        if (!Number.isInteger(position) || position < FIRST_POSITION || position > paragraphs.length) {
            return;
        }
        const paragraph = paragraphs[position - FIRST_POSITION];
        window.location.hash = paragraphHash(position);
        if (focusParagraph) {
            paragraph.focus({ preventScroll: true });
        }
        paragraph.scrollIntoView({ block: "start" });
        if (!focusParagraph && readingRange) {
            readingRange.focus({ preventScroll: true });
        }
        scheduleMeasure();
    }

    /** 专注模式只隐藏周边导读；目录、设置、书签和退出入口始终可达。 */
    function toggleFocusedReading() {
        const paragraph = paragraphs[currentPosition - FIRST_POSITION];
        const originalTop = paragraph.getBoundingClientRect().top;
        const targetTop = Math.min(originalTop, READING_LINE);
        focusedReading = !focusedReading;
        body.classList.toggle("reader-focused", focusedReading);
        for (const button of [focusButton, focusSettingButton]) {
            if (button) {
                button.setAttribute("aria-pressed", String(focusedReading));
            }
        }
        if (focusButton) {
            focusButton.textContent = focusedReading ? "退出专注" : "◉ 专注";
        }
        if (focusSettingButton) {
            focusSettingButton.textContent = focusedReading ? "退出专注阅读" : "开启专注阅读";
        }
        // 隐藏封面与侧栏会改变页面高度，立即补偿滚动，避免正文突然跳到另一个段落。
        window.scrollBy({ top: paragraph.getBoundingClientRect().top - targetTop, behavior: "instant" });
        scheduleMeasure();
        announce(focusedReading ? "已进入专注阅读，按 Esc 或点击退出专注返回。" : "已退出专注阅读。");
    }

    /** 创建设置分组，不更改生成模板与已有表单 ID，旧、新书目共用同一增强逻辑。 */
    function enhanceSettings() {
        settingsDialog.classList.add("reader-settings-dialog");
        const settingNote = settingsDialog.querySelector(".settings-note");
        const focusSection = document.createElement("section");
        focusSection.className = "reader-focus-setting";
        const focusLabel = document.createElement("p");
        focusLabel.className = "reader-setting-label";
        focusLabel.textContent = "留一段安静的时间";
        const focusDescription = document.createElement("p");
        focusDescription.textContent = "收起封面和侧栏，让眼前只剩正文。随时可以退出。";
        focusSettingButton = document.createElement("button");
        focusSettingButton.type = "button";
        focusSettingButton.className = "tool-button";
        focusSettingButton.textContent = "开启专注阅读";
        focusSettingButton.setAttribute("aria-pressed", "false");
        focusSettingButton.addEventListener("click", () => {
            settingsDialog.close();
            toggleFocusedReading();
        });
        focusSection.append(focusLabel, focusDescription, focusSettingButton);
        settingsDialog.insertBefore(focusSection, settingNote);
        if (header) {
            const focusTitle = document.createElement("span");
            focusTitle.className = "reader-focus-title";
            focusTitle.textContent = book.title || document.title;
            header.insertBefore(focusTitle, elements.openSettings);
            focusButton = document.createElement("button");
            focusButton.type = "button";
            focusButton.className = "reader-focus-toggle";
            focusButton.textContent = "◉ 专注";
            focusButton.setAttribute("aria-pressed", "false");
            focusButton.addEventListener("click", toggleFocusedReading);
            header.append(focusButton);
        }
    }

    /** 进度滑条支持点击、拖动与方向键；预览不写入存储，确认后才定位正文。 */
    function enhanceProgress() {
        const positionInfo = elements.positionText.parentElement;
        const progressMeta = document.createElement("div");
        progressMeta.className = "reader-progress-meta";
        readingChapter = document.createElement("span");
        readingChapter.className = "reader-current-chapter";
        readingChapter.textContent = "正文起点";
        readingPercent = document.createElement("strong");
        readingPercent.className = "reader-progress-percent";
        readingPercent.textContent = "0%";
        progressMeta.append(readingChapter, readingPercent);
        positionInfo.prepend(progressMeta);
        readingRange = document.createElement("input");
        readingRange.type = "range";
        readingRange.id = "readingPositionRange";
        readingRange.className = "reader-position-slider";
        readingRange.min = String(FIRST_POSITION);
        readingRange.max = String(paragraphs.length);
        readingRange.step = String(FIRST_POSITION);
        readingRange.value = String(FIRST_POSITION);
        readingRange.setAttribute("aria-label", "跳转阅读段落");
        readingRange.setAttribute("aria-describedby", "positionText");
        readingRange.addEventListener("input", () => {
            const position = Number(readingRange.value);
            readingPercent.textContent = getPercentage(position) + "%";
            elements.positionText.textContent = "跳到第 " + position + " / " + paragraphs.length + " 段";
            readingRange.style.setProperty("--reader-progress", getPercentage(position) + "%");
        });
        readingRange.addEventListener("change", () => {
            goToParagraph(Number(readingRange.value), false);
        });
        // 旧进度条继续更新数值，新滑条承担可访问交互，避免重复朗读同一进度。
        elements.readingProgress.setAttribute("aria-hidden", "true");
        positionInfo.append(readingRange);
    }

    document.documentElement.classList.add("reader-ready");
    enhanceSettings();
    enhanceProgress();
    applySettings(initial.settings);
    updateSavedControls();
    if (currentRecord.position > FIRST_POSITION) {
        elements.resumeReading.hidden = false;
        elements.resumeReading.href = paragraphHash(currentRecord.position);
        elements.resumeReading.textContent = "接着上次 · 第 " + currentRecord.position + " 段 ↓";
    }
    elements.openContents.addEventListener("click", () => {
        contentsDialog.showModal();
    });
    elements.openSettings.addEventListener("click", () => {
        settingsDialog.showModal();
    });
    for (const link of contentsDialog.querySelectorAll("a")) {
        link.addEventListener("click", () => {
            contentsDialog.close();
        });
    }
    elements.readingFont.addEventListener("change", (event) => {
        const fontSize = Number(event.target.value);
        if (!Array.isArray(stateApi.FONT_SIZES) || !stateApi.FONT_SIZES.includes(fontSize)) {
            return;
        }
        const settings = { ...store.read().settings, fontSize };
        applySettings(settings);
        store.updateSettings(settings);
        scheduleMeasure();
    });
    for (const button of document.querySelectorAll("[data-reading-theme]")) {
        button.addEventListener("click", () => {
            const theme = button.dataset.readingTheme;
            if (!Array.isArray(stateApi.THEMES) || !stateApi.THEMES.includes(theme)) {
                return;
            }
            const settings = { ...store.read().settings, theme };
            applySettings(settings);
            store.updateSettings(settings);
        });
    }
    elements.saveBookmark.addEventListener("click", () => {
        const saved = store.updateBook(bookId, { position: currentPosition, bookmark: currentPosition });
        currentRecord = store.read().books[bookId] || { ...currentRecord, bookmark: currentPosition };
        updateSavedControls();
        announce(saved ? "书签已留在第 " + currentPosition + " 段（每部作品保留一枚）" : "书签仅在本页临时保留");
    });
    elements.goBookmark.addEventListener("click", () => {
        goToParagraph(currentRecord.bookmark);
    });
    elements.markCompleted.addEventListener("click", () => {
        flushPosition();
        const completed = !currentRecord.completed;
        const saved = store.updateBook(bookId, { completed, position: currentPosition });
        currentRecord = store.read().books[bookId] || { ...currentRecord, completed };
        updateSavedControls();
        announce(saved ? (completed ? "已记下这次完整阅读。" : "已撤销读完标记。") : "读完标记仅在本页临时保留");
    });
    document.addEventListener("keydown", (event) => {
        // 对话框打开时 Esc 优先交给原生关闭行为，不同时改变阅读布局。
        if (event.key === "Escape" && focusedReading && !settingsDialog.open && !contentsDialog.open) {
            toggleFocusedReading();
        }
    });
    window.addEventListener("scroll", scheduleMeasure, { passive: true });
    window.addEventListener("resize", scheduleMeasure);
    window.addEventListener("pageshow", scheduleMeasure);
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
        if (event.key === stateApi.STORAGE_KEY) {
            const latest = store.read();
            currentRecord = latest.books[bookId] || {};
            applySettings(latest.settings);
            updateSavedControls();
            scheduleMeasure();
        }
    });
    // 明确的段落深链优先于继续阅读，不把场景定位强行覆盖成上次位置。
    if (!window.location.hash && new URLSearchParams(window.location.search).get("resume") === "1") {
        goToParagraph(currentRecord.position || FIRST_POSITION);
    }
    scheduleMeasure();
})();
