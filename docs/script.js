/**
 * 阅读控制器：管理书架、章节导航、本地阅读位置、摘句和阅读偏好。
 * 创建者：Codex；创建日期：2026/09/12。
 * 存储范围限于此浏览器；持久化失败时仍可在当前页面完成全部阅读操作。
 */
const STORAGE_KEY = "slowPagesReadingV1";
const THEME_LIST = ["paper", "forest", "night"];
const FONT_SIZE_LIST = [18, 21, 24];
const TOAST_DURATION_MS = 2800;
const MILLISECONDS_PER_DAY = 86400000;
const REVOKE_DELAY_MS = 1000;
const readerDialog = document.getElementById("readerDialog");
const collectionDialog = document.getElementById("collectionDialog");
let readingState = loadReadingState();
let currentBookId = BOOK_LIST[0].id;
let currentChapterIndex = 0;
let activeFilter = "all";
let toastTimeout = null;
let storageAvailable = true;

/** 返回稳定 ID 对应的书籍，不接受存储中未知的书籍编号。 */
function getBook(bookId) {
    return BOOK_LIST.find((book) => book.id === bookId);
}

/** 判断章节编号是否处于指定书籍的有效范围，防止损坏数据造成越界。 */
function validChapter(book, chapterIndex) {
    return Boolean(book) && Number.isInteger(chapterIndex)
        && chapterIndex >= 0 && chapterIndex < book.chapters.length;
}

/** 恢复数据时逐字段校验，只保留固定书目内的状态，不信任本地存储的任意结构。 */
function loadReadingState() {
    const fallbackState = { theme: "paper", fontSize: 18, positions: {}, completed: [], saved: [], lastBookId: null };
    let rawState;
    try {
        rawState = JSON.parse(localStorage.getItem(STORAGE_KEY));
    } catch {
        // 隐私模式、存储访问限制或损坏 JSON 均回退为空状态，不阻止页面使用。
        return fallbackState;
    }
    if (!rawState || typeof rawState !== "object") {
        return fallbackState;
    }
    if (THEME_LIST.includes(rawState.theme)) {
        fallbackState.theme = rawState.theme;
    }
    if (FONT_SIZE_LIST.includes(rawState.fontSize)) {
        fallbackState.fontSize = rawState.fontSize;
    }
    BOOK_LIST.forEach((book) => {
        const position = rawState.positions?.[book.id];
        if (validChapter(book, position)) {
            fallbackState.positions[book.id] = position;
        }
    });
    const validKeyList = BOOK_LIST.flatMap((book) => book.chapters.map((chapter, index) => `${book.id}:${index}`));
    ["saved", "completed"].forEach((fieldName) => {
        if (Array.isArray(rawState[fieldName])) {
            fallbackState[fieldName] = validKeyList.filter((key) => rawState[fieldName].includes(key));
        }
    });
    if (getBook(rawState.lastBookId)) {
        fallbackState.lastBookId = rawState.lastBookId;
    }
    return fallbackState;
}

/** 保存本地状态；失败时明确告知用户，内存中的当前操作仍保留。 */
function persistReadingState() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(readingState));
        storageAvailable = true;
    } catch {
        storageAvailable = false;
        document.querySelector(".reader-hint").textContent = "浏览器未允许保存：当前进度和摘句只保留到本次页面关闭。";
    }
    updateHomeState();
}

/** 创建文本元素，书籍内容始终经 textContent 写入，避免 HTML 注入。 */
function createTextElement(tagName, className, textContent) {
    const element = document.createElement(tagName);
    element.className = className;
    element.textContent = textContent;
    return element;
}

/** 渲染指定心情的书目，同时提供书封与明确的阅读按钮。 */
function renderBooks(category) {
    const bookGrid = document.getElementById("bookGrid");
    bookGrid.replaceChildren();
    BOOK_LIST.filter((book) => category === "all" || book.category === category).forEach((book) => {
        const card = createTextElement("article", "book-card", "");
        const coverButton = createTextElement("button", "cover-button", "");
        coverButton.setAttribute("aria-label", `阅读《${book.title}》`);
        const cover = createTextElement("span", `mini-book cover-${book.color}`, "");
        cover.append(createTextElement("small", "", "SLOW PAGES / ORIGINAL"));
        cover.append(createTextElement("strong", "", book.coverTitle));
        cover.append(createTextElement("span", "cover-ornament", "✳"));
        cover.append(createTextElement("i", "", book.english));
        coverButton.append(cover);
        coverButton.addEventListener("click", () => openReader(book.id));
        const bottom = createTextElement("div", "book-bottom", "");
        const finishedCount = readingState.completed.filter((key) => key.startsWith(`${book.id}:`)).length;
        bottom.append(createTextElement("span", "", `${book.chapters.length} 章 · 已读 ${finishedCount} 章`));
        const readButton = createTextElement("button", "", "进入阅读 ↗");
        readButton.setAttribute("aria-label", `进入《${book.title}》阅读`);
        readButton.addEventListener("click", () => openReader(book.id));
        bottom.append(readButton);
        card.append(coverButton, createTextElement("h3", "", book.title));
        card.append(createTextElement("p", "", book.subtitle), bottom);
        bookGrid.append(card);
    });
}

/** 更新首页书签和摘句数量；阅读位置表示最后打开的章节，不冒充已完成进度。 */
function updateHomeState() {
    document.getElementById("collectionCount").textContent = String(readingState.saved.length);
    const lastBook = getBook(readingState.lastBookId);
    document.getElementById("returnCard").hidden = !lastBook;
    if (!lastBook) {
        return;
    }
    const chapterIndex = readingState.positions[lastBook.id] ?? 0;
    document.getElementById("returnTitle").textContent = `书签还在《${lastBook.title}》里`;
    document.getElementById("returnDescription").textContent =
        `上次停在第 ${chapterIndex + 1} 章 · ${lastBook.chapters[chapterIndex].title}`;
}

/** 打开指定章节；未指定编号时继续该书上次阅读位置。 */
function openReader(bookId, chapterIndex) {
    const book = getBook(bookId);
    const resolvedIndex = chapterIndex ?? readingState.positions[bookId] ?? 0;
    if (!validChapter(book, resolvedIndex)) {
        return;
    }
    currentBookId = bookId;
    currentChapterIndex = resolvedIndex;
    if (collectionDialog.open) {
        collectionDialog.close();
    }
    document.getElementById("readerBookTitle").textContent = book.title;
    if (!readerDialog.open) {
        readerDialog.showModal();
    }
    applyReadingPreferences();
    renderChapter();
}

/** 更新章节正文和目录；翻章动画尊重系统的减少动态效果偏好。 */
function renderChapter() {
    const book = getBook(currentBookId);
    const chapter = book.chapters[currentChapterIndex];
    readingState.lastBookId = book.id;
    readingState.positions[book.id] = currentChapterIndex;
    persistReadingState();
    document.getElementById("chapterNumber").textContent =
        `CHAPTER ${String(currentChapterIndex + 1).padStart(2, "0")}`;
    document.getElementById("chapterTitle").textContent = chapter.title;
    document.getElementById("chapterLead").textContent = chapter.lead;
    const chapterBody = document.getElementById("chapterBody");
    chapterBody.replaceChildren(...chapter.paragraphs.map((paragraph) => createTextElement("p", "", paragraph)));
    document.getElementById("chapterQuote").textContent = chapter.quote;
    document.getElementById("chapterPosition").textContent = `${currentChapterIndex + 1} / ${book.chapters.length}`;
    document.getElementById("previousChapter").disabled = currentChapterIndex === 0;
    document.getElementById("nextChapter").textContent = currentChapterIndex === book.chapters.length - 1
        ? "读完这一章 ✓" : "读完，下一章 →";
    document.getElementById("nextChapter").disabled = false;
    renderChapterNavigation();
    updateQuoteButton();
    const readingPage = document.getElementById("readingPage");
    readingPage.classList.remove("page-enter");
    // 强制一次布局，使连续翻章也能重新播放同一段短动画。
    void readingPage.offsetWidth;
    readingPage.classList.add("page-enter");
    readerDialog.scrollTop = 0;
    readingPage.focus({ preventScroll: true });
}

/** 独立更新目录和完成进度；只有显式点击“读完”才计入已完成。 */
function renderChapterNavigation() {
    const book = getBook(currentBookId);
    const chapterList = document.getElementById("chapterList");
    chapterList.replaceChildren();
    book.chapters.forEach((chapter, chapterIndex) => {
        const chapterButton = createTextElement("button", "", "");
        const finished = readingState.completed.includes(`${book.id}:${chapterIndex}`);
        chapterButton.append(createTextElement("span", "", finished ? "✓" : String(chapterIndex + 1).padStart(2, "0")));
        chapterButton.append(document.createTextNode(chapter.title));
        chapterButton.setAttribute("aria-current", String(chapterIndex === currentChapterIndex));
        chapterButton.addEventListener("click", () => {
            currentChapterIndex = chapterIndex;
            renderChapter();
        });
        chapterList.append(chapterButton);
    });
    const completedCount = book.chapters.filter((chapter, index) =>
        readingState.completed.includes(`${book.id}:${index}`)).length;
    document.getElementById("completionLabel").textContent = `已完成 ${completedCount} / ${book.chapters.length} 章`;
    document.getElementById("bookProgress").max = book.chapters.length;
    document.getElementById("bookProgress").value = completedCount;
    document.getElementById("finishedMessage").hidden = completedCount !== book.chapters.length;
}

/** 完成本章后进入下一章；末章停留展示完成结果，避免跳走丢失阅读上下文。 */
function completeChapter() {
    const book = getBook(currentBookId);
    const chapterKey = `${book.id}:${currentChapterIndex}`;
    if (!readingState.completed.includes(chapterKey)) {
        readingState.completed.push(chapterKey);
    }
    persistReadingState();
    if (currentChapterIndex < book.chapters.length - 1) {
        currentChapterIndex += 1;
        renderChapter();
        return;
    }
    renderChapterNavigation();
    document.getElementById("nextChapter").textContent = "本章已读完 ✓";
    document.getElementById("nextChapter").disabled = true;
    notifyReader("已留下这一章的阅读足迹");
}

/** 设置阅读室主题和字号，按钮状态与当前偏好同步。 */
function applyReadingPreferences() {
    readerDialog.dataset.theme = readingState.theme;
    readerDialog.style.setProperty("--reading-size", `${readingState.fontSize}px`);
    document.getElementById("fontSize").value = String(readingState.fontSize);
    document.querySelectorAll("button[data-theme]").forEach((themeButton) => {
        themeButton.setAttribute("aria-pressed", String(themeButton.dataset.theme === readingState.theme));
    });
}

/** 收藏控件同时支持撤销，重复点击不会产生重复摘句。 */
function updateQuoteButton() {
    const saved = readingState.saved.includes(`${currentBookId}:${currentChapterIndex}`);
    const saveButton = document.getElementById("saveQuote");
    saveButton.textContent = saved ? "♥ 已收藏 · 点击取消" : "♡ 收藏这句话";
    saveButton.setAttribute("aria-pressed", String(saved));
}

/** 摘句仅记录稳定引用，展示和导出时从原创书库取正文。 */
function toggleQuote() {
    const chapterKey = `${currentBookId}:${currentChapterIndex}`;
    const saved = readingState.saved.includes(chapterKey);
    readingState.saved = saved ? readingState.saved.filter((key) => key !== chapterKey)
        : [...readingState.saved, chapterKey];
    persistReadingState();
    updateQuoteButton();
    notifyReader(saved ? "已从摘句本移除" : "这句话，已收进你的摘句本");
}

/** 使用已校验的复合键读取书籍和章节。 */
function getSavedChapter(chapterKey) {
    const [bookId, chapterIndex] = chapterKey.split(":");
    const book = getBook(bookId);
    return { book, chapter: book.chapters[Number(chapterIndex)], chapterIndex: Number(chapterIndex) };
}

/** 展示可回读、可移除的摘句；空状态给出清晰的下一步。 */
function renderCollection() {
    const savedList = document.getElementById("savedList");
    document.getElementById("exportPreview").hidden = true;
    savedList.replaceChildren();
    document.getElementById("downloadQuotes").disabled = readingState.saved.length === 0;
    if (readingState.saved.length === 0) {
        savedList.append(createTextElement("p", "empty-collection", "这里还空着。打开任意一本书，读到章末，收藏一句让你心动的话。"));
        return;
    }
    readingState.saved.forEach((chapterKey) => {
        const { book, chapter, chapterIndex } = getSavedChapter(chapterKey);
        const card = createTextElement("article", "saved-card", "");
        card.append(createTextElement("blockquote", "", chapter.quote));
        card.append(createTextElement("p", "", `《${book.title}》 · ${chapter.title}`));
        const actions = createTextElement("div", "saved-actions", "");
        const backButton = createTextElement("button", "", "回到这一章 ↗");
        backButton.addEventListener("click", () => openReader(book.id, chapterIndex));
        const removeButton = createTextElement("button", "", "移除");
        removeButton.setAttribute("aria-label", `移除《${book.title}》的摘句：${chapter.title}`);
        removeButton.addEventListener("click", () => {
            readingState.saved = readingState.saved.filter((key) => key !== chapterKey);
            persistReadingState();
            renderCollection();
            document.getElementById("closeCollection").focus();
        });
        actions.append(backButton, removeButton);
        card.append(actions);
        savedList.append(card);
    });
}

/** 打开摘句本，原生对话框确保焦点不落到背景页。 */
function openCollection() {
    renderCollection();
    collectionDialog.showModal();
}

/** 下载 UTF-8 摘句文本，及时释放 Blob URL，不需要服务器或第三方接口。 */
function downloadQuotes() {
    if (readingState.saved.length === 0) {
        return;
    }
    const excerptList = readingState.saved.map((chapterKey) => {
        const { book, chapter } = getSavedChapter(chapterKey);
        return `${chapter.quote}\n——《${book.title}》· ${chapter.title}`;
    });
    const exportText = `慢页 · 我的摘句本\n\n${excerptList.join("\n\n")}\n\n慢页原创概念试读`;
    document.getElementById("exportText").value = exportText;
    document.getElementById("exportPreview").hidden = false;
    const blob = new Blob(["\uFEFF", exportText], { type: "text/plain;charset=utf-8" });
    const downloadUrl = URL.createObjectURL(blob);
    const downloadLink = document.createElement("a");
    downloadLink.href = downloadUrl;
    downloadLink.download = "慢页-我的摘句.txt";
    document.body.append(downloadLink);
    downloadLink.click();
    downloadLink.remove();
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), REVOKE_DELAY_MS);
}

/** 提示放入当前模态框，确保其在浏览器 top layer 中可见。 */
function notifyReader(message) {
    const toast = document.getElementById("toast");
    (readerDialog.open ? readerDialog : document.body).append(toast);
    toast.textContent = storageAvailable ? message : `${message}（仅本次页面有效）`;
    toast.classList.add("visible");
    window.clearTimeout(toastTimeout);
    toastTimeout = window.setTimeout(() => toast.classList.remove("visible"), TOAST_DURATION_MS);
}

/** 以本地日历日期选定今日句子，同一天重复访问保持一致。 */
function initializeDailyQuote() {
    const today = new Date();
    const calendarDay = Math.floor(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) / MILLISECONDS_PER_DAY);
    const allChapters = BOOK_LIST.flatMap((book) => book.chapters.map((chapter, chapterIndex) =>
        ({ book, chapter, chapterIndex })));
    const selected = allChapters[calendarDay % allChapters.length];
    document.getElementById("dailyQuote").textContent = selected.chapter.quote;
    document.getElementById("dailySource").textContent = `——《${selected.book.title}》`;
    document.getElementById("dailyRead").addEventListener("click", () =>
        openReader(selected.book.id, selected.chapterIndex));
}

/** 注册有边界的页面交互；偏好取值仍执行 allowList 校验。 */
function bindInteractions() {
    document.querySelectorAll("[data-filter]").forEach((filterButton) => {
        filterButton.addEventListener("click", () => {
            activeFilter = filterButton.dataset.filter;
            document.querySelectorAll("[data-filter]").forEach((siblingButton) => {
                const selected = siblingButton === filterButton;
                siblingButton.classList.toggle("active", selected);
                siblingButton.setAttribute("aria-pressed", String(selected));
            });
            renderBooks(activeFilter);
        });
    });
    document.querySelectorAll("button[data-theme]").forEach((themeButton) => {
        themeButton.addEventListener("click", () => {
            if (THEME_LIST.includes(themeButton.dataset.theme)) {
                readingState.theme = themeButton.dataset.theme;
                applyReadingPreferences();
                persistReadingState();
            }
        });
    });
    document.getElementById("fontSize").addEventListener("change", (event) => {
        const selectedSize = Number(event.target.value);
        if (FONT_SIZE_LIST.includes(selectedSize)) {
            readingState.fontSize = selectedSize;
            applyReadingPreferences();
            persistReadingState();
        }
    });
    document.getElementById("focusButton").addEventListener("click", () => {
        const focused = readerDialog.classList.toggle("focus-mode");
        document.getElementById("focusButton").setAttribute("aria-pressed", String(focused));
        document.getElementById("focusButton").textContent = focused ? "退出专注" : "专注模式";
    });
    document.getElementById("previousChapter").addEventListener("click", () => {
        if (currentChapterIndex > 0) {
            currentChapterIndex -= 1;
            renderChapter();
        }
    });
    document.getElementById("randomButton").addEventListener("click", () => {
        const candidateList = BOOK_LIST.filter((book) => book.id !== readingState.lastBookId);
        const randomBook = candidateList[Math.floor(Math.random() * candidateList.length)];
        openReader(randomBook.id, 0);
        notifyReader(`今天，让《${randomBook.title}》来遇见你`);
    });
    ["heroRead", "previewRead"].forEach((buttonId) => {
        document.getElementById(buttonId).addEventListener("click", () => openReader("trees", 0));
    });
    ["collectionButton", "gardenButton"].forEach((buttonId) => {
        document.getElementById(buttonId).addEventListener("click", openCollection);
    });
    document.getElementById("resumeButton").addEventListener("click", () => openReader(readingState.lastBookId));
    document.getElementById("closeReader").addEventListener("click", () => readerDialog.close());
    document.getElementById("closeCollection").addEventListener("click", () => collectionDialog.close());
    document.getElementById("nextChapter").addEventListener("click", completeChapter);
    document.getElementById("saveQuote").addEventListener("click", toggleQuote);
    document.getElementById("downloadQuotes").addEventListener("click", downloadQuotes);
    readerDialog.addEventListener("close", () => renderBooks(activeFilter));
}

renderBooks(activeFilter);
updateHomeState();
initializeDailyQuote();
bindInteractions();
