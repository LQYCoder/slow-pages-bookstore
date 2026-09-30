/**
 * 共读交互：目录续读、阅读偏好、三个解读视角、私密笔记和原创卡片导出。
 * 创建者：Codex；创建日期：2026/09/30。
 * 所有私人输入仅写入本机状态和用户主动下载的 TXT，不进入 HTML 或统计载荷。
 */
(function () {
    "use strict";
    const LENSES = Object.freeze({
        amir: {
            index: "01", heading: "我想得到的认可，为什么总要别人付出？", chapter: "recognition",
            body: "从阿米尔的处境看，渴望父亲认可可以被理解，但这份渴望不能替他免责。"
                + "把目光从‘我还能不能是个好人’，移向‘对方失去了什么’，才是承担的开头。"
        },
        hassan: {
            index: "02", heading: "如果一个人不能拒绝，他的愿意意味着什么？", chapter: "unequal",
            body: "从哈桑的处境看，忠诚不应该掩盖关系中的阶层与族群差别。我们主要通过阿米尔的回忆看见他，"
                + "更需要承认叙述的边界：他不是一座让别人完成救赎的桥。"
        },
        sohrab: {
            index: "03", heading: "被帮助的人，可以不按你的期待恢复吗？", chapter: "patience",
            body: "从索拉博的处境看，离开危险并不等于立刻获得安全感。照顾他，不该以笑容、感激或开口说话作为验收。"
                + "希望可以很微小，陪伴也可以暂时不向沉默索取答案。"
        }
    });
    const CARD_LINES = Object.freeze([
        ["有些长大，", "是别人替我们", "付了账。"],
        ["同一片树荫，", "并没有让他们", "平等。"],
        ["被救的人，", "不必立刻", "好起来。"],
        ["风筝飞起来了，", "故事没有替谁", "宣布痊愈。"]
    ]);
    const CARD_WIDTH = 1800;
    const CARD_HEIGHT = 2400;
    const DOWNLOAD_RELEASE_MS = 10000;
    const READING_ANCHOR_RATIO = 0.45;
    let storage = null;
    try {
        storage = window.localStorage;
    } catch (error) {
        // 系统禁用存储时仍可阅读，并可主动导出；保存按钮会说明只保留当前页状态。
    }
    const store = window.KiteJournalState.createStore(storage);
    const gate = document.getElementById("journalGate");
    const answer = document.getElementById("reflectionText");
    const promptChoice = document.getElementById("promptChoice");
    const responseStatus = document.getElementById("responseStatus");
    const chapterNodes = Array.from(document.querySelectorAll("[data-chapter]"));
    const initialState = store.read();
    let activePrompt = promptChoice.value;
    let scheduledScroll = false;

    /** 提示明确区分写入成功与仅内存暂存，避免隐私模式下误以为已经持久保存。 */
    function saveResponse() {
        const state = store.read();
        state.answers[activePrompt] = answer.value;
        const result = store.write(state);
        responseStatus.textContent = result.persisted
            ? "已保存在当前浏览器，回应内容不会上传网站。"
            : "当前浏览器不能持久保存，内容暂留此页；请导出备份。";
    }

    /** 设置表单值只使用 value；不把用户输入解释为 HTML。 */
    function loadResponse() {
        answer.value = store.read().answers[activePrompt];
        updateCount();
    }

    function updateCount() {
        document.getElementById("responseCount").textContent = answer.value.length + " / 500";
    }

    /** 偏好采用同一状态白名单，不更改全站原有字体、主题或阅读书签。 */
    function applyPreferences() {
        const state = store.read();
        document.body.dataset.theme = state.night ? "night" : "day";
        document.body.dataset.largeText = String(state.largeText);
        document.getElementById("themeButton").setAttribute("aria-pressed", String(state.night));
        document.getElementById("themeButton").textContent = state.night ? "日间阅读" : "夜间阅读";
        document.getElementById("fontButton").setAttribute("aria-pressed", String(state.largeText));
    }

    function updatePreference(key) {
        const state = store.read();
        state[key] = !state[key];
        const result = store.write(state);
        applyPreferences();
        if (!result.persisted) {
            responseStatus.textContent = "浏览器存储不可用，阅读偏好仅在当前页面生效。";
        }
    }

    /** 记录最近读到的节，不把它称为“已读完”；停留在封面不推进记录。 */
    function updateReadingPosition() {
        scheduledScroll = false;
        if (!gate.open) {
            return;
        }
        const readingNode = chapterNodes.find((node) => {
            const bounds = node.getBoundingClientRect();
            return bounds.top <= innerHeight * READING_ANCHOR_RATIO
                && bounds.bottom > innerHeight * READING_ANCHOR_RATIO;
        });
        if (!readingNode) {
            return;
        }
        const chapter = readingNode.dataset.chapter;
        const state = store.read();
        if (state.chapter !== chapter) {
            state.chapter = chapter;
            store.write(state);
        }
        for (const link of document.querySelectorAll(".reading-sidebar nav a")) {
            if (link.hash === "#" + chapter) {
                link.setAttribute("aria-current", "location");
            } else {
                link.removeAttribute("aria-current");
            }
        }
        const currentIndex = window.KiteJournalState.CHAPTERS.indexOf(chapter);
        document.getElementById("chapterProgress").style.width = (currentIndex + 1) / chapterNodes.length * 100 + "%";
    }

    function schedulePosition() {
        if (!scheduledScroll) {
            scheduledScroll = true;
            requestAnimationFrame(updateReadingPosition);
        }
    }

    /** 章节锚点链接显式打开剧透区；普通进入页面保持折叠，由读者选择展开。 */
    function revealLinkedChapter() {
        const chapter = location.hash.slice(1);
        if (window.KiteJournalState.CHAPTERS.includes(chapter)) {
            gate.open = true;
            document.getElementById(chapter).scrollIntoView();
        }
    }

    /** 解读视角完全来自编辑内容，不模拟人物聊天或生成未经原著支持的独白。 */
    function selectLens(key) {
        if (!Object.hasOwn(LENSES, key)) {
            return;
        }
        const lens = LENSES[key];
        for (const button of document.querySelectorAll("[data-lens]")) {
            button.setAttribute("aria-pressed", String(button.dataset.lens === key));
        }
        document.getElementById("lensIndex").textContent = lens.index;
        document.getElementById("lensHeading").textContent = lens.heading;
        document.getElementById("lensBody").textContent = lens.body;
        document.getElementById("lensLink").href = "#" + lens.chapter;
    }

    /** 用户主动下载后释放 Object URL，避免多次导出累积内存。 */
    function download(blob, filename) {
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = filename;
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(objectUrl), DOWNLOAD_RELEASE_MS);
    }

    function exportResponses() {
        saveResponse();
        const state = store.read();
        const options = Array.from(promptChoice.options);
        const text = options.map((option) => option.text + "\n" + (state.answers[option.value] || "（尚未填写）"));
        download(new Blob(["慢页 · 追风筝的人 · 我的私人回应\n\n" + text.join("\n\n")],
            { type: "text/plain;charset=utf-8" }), "慢页-追风筝的人-我的回应.txt");
        responseStatus.textContent = "已发起回应文件下载，请在浏览器下载列表中查看。";
    }

    function selectedCardLines() {
        const index = Number(document.getElementById("cardChoice").value);
        return CARD_LINES[index] || CARD_LINES[0];
    }

    /** Canvas 只绘制本地几何图形和静态原创文字，file:// 打开也不会被图片跨域污染。 */
    function drawCard() {
        const canvas = document.createElement("canvas");
        canvas.width = CARD_WIDTH;
        canvas.height = CARD_HEIGHT;
        const context = canvas.getContext("2d");
        if (!context) {
            throw new Error("CARD_UNAVAILABLE");
        }
        context.fillStyle = "#223149";
        context.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
        context.strokeStyle = "#728096";
        context.lineWidth = 2;
        context.strokeRect(80, 80, 1640, 2240);
        context.fillStyle = "#eee8d9";
        context.font = '30px "PingFang SC", sans-serif';
        context.fillText("慢页共读   /   THE KITE RUNNER", 145, 190);
        context.strokeStyle = "#d37156";
        context.lineWidth = 5;
        context.beginPath();
        context.moveTo(1230, 570);
        context.bezierCurveTo(1480, 850, 480, 630, 390, 1120);
        context.stroke();
        context.fillStyle = "#d37156";
        context.beginPath();
        context.moveTo(1260, 310);
        context.lineTo(1380, 430);
        context.lineTo(1230, 620);
        context.lineTo(1130, 440);
        context.closePath();
        context.fill();
        context.strokeStyle = "#f1c4a6";
        context.lineWidth = 2;
        context.beginPath();
        context.moveTo(1260, 310);
        context.lineTo(1230, 620);
        context.moveTo(1130, 440);
        context.lineTo(1380, 430);
        context.stroke();
        context.fillStyle = "#f4efdf";
        context.font = '116px "Songti SC", "STSong", serif';
        selectedCardLines().forEach((line, index) => context.fillText(line, 145, 1320 + index * 180));
        context.font = '40px "Songti SC", "STSong", serif';
        context.fillText("《追风筝的人》", 145, 2070);
        context.font = '28px "PingFang SC", sans-serif';
        context.fillText("慢页原创解读 · 非原文引句", 145, 2150);
        context.fillText("SLOW PAGES     /     留一点余地，给慢慢读。", 145, 2250);
        return canvas;
    }

    /** 异步编码失败时不伪报已保存；手机由浏览器提供下载/保存入口。 */
    async function exportCard() {
        const button = document.getElementById("saveCard");
        const status = document.getElementById("cardStatus");
        button.disabled = true;
        try {
            await document.fonts.ready;
            const canvas = drawCard();
            const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
            if (!blob) {
                throw new Error("CARD_ENCODING_FAILED");
            }
            download(blob, "慢页-追风筝的人-原创阅读卡.png");
            status.textContent = "已生成 1800 × 2400 高清卡，请查看浏览器下载列表；手机可从文件中存入相册。";
        } catch (error) {
            status.textContent = "当前浏览器未能导出，请换用系统浏览器后重试。";
        } finally {
            button.disabled = false;
        }
    }

    document.querySelectorAll(".reading-tools, .reading-lenses, #responseControls, #cardControls, .chapter-progress")
        .forEach((element) => { element.hidden = false; });
    const resume = document.getElementById("resumeJournal");
    if (initialState.chapter) {
        resume.href = "#" + initialState.chapter;
        resume.hidden = false;
    }
    document.getElementById("themeButton").addEventListener("click", () => updatePreference("night"));
    document.getElementById("fontButton").addEventListener("click", () => updatePreference("largeText"));
    document.getElementById("saveResponse").addEventListener("click", saveResponse);
    document.getElementById("exportResponse").addEventListener("click", exportResponses);
    document.getElementById("clearResponse").addEventListener("click", () => {
        if (answer.value && window.confirm("清空当前问题的回应？另两个问题和原有书签会保留。")) {
            answer.value = "";
            saveResponse();
            updateCount();
        }
    });
    answer.addEventListener("input", updateCount);
    answer.addEventListener("change", saveResponse);
    promptChoice.addEventListener("change", () => {
        saveResponse();
        activePrompt = promptChoice.value;
        loadResponse();
    });
    document.querySelectorAll("[data-lens]").forEach((button) => {
        button.addEventListener("click", () => selectLens(button.dataset.lens));
    });
    document.getElementById("cardChoice").addEventListener("change", () => {
        document.getElementById("cardText").textContent = selectedCardLines().join("\n");
    });
    document.getElementById("saveCard").addEventListener("click", exportCard);
    gate.addEventListener("toggle", () => {
        document.querySelector(".gate-action").textContent = gate.open ? "收起共读 −" : "展开共读 ＋";
        schedulePosition();
    });
    window.addEventListener("scroll", schedulePosition, { passive: true });
    window.addEventListener("hashchange", revealLinkedChapter);
    window.addEventListener("pagehide", saveResponse);
    loadResponse();
    applyPreferences();
    selectLens("amir");
    revealLinkedChapter();
})();
