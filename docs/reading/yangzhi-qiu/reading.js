/** 共读稿复制：不联网，不改动书店存档。创建者：Codex；2026/09/28。 */
(function () {
    "use strict";
    const copyButton = document.getElementById("copyNote");
    const noteContent = document.getElementById("noteContent");
    const status = document.getElementById("copyStatus");

    /** file 模式或权限被拒绝时展开可选中的全文，避免复制失败后没有操作入口。 */
    function showManualCopy() {
        noteContent.closest("details").open = true;
        noteContent.focus();
        noteContent.select();
        status.textContent = "已选中全文，请按系统复制快捷键，手机可长按复制。";
    }

    /** 剪贴板只能由点击触发；不支持时使用页面内的明确替代操作。 */
    function copyNote() {
        if (!navigator.clipboard || !window.isSecureContext) {
            showManualCopy();
            return;
        }
        navigator.clipboard.writeText(noteContent.value).then(function () {
            status.textContent = "标题与正文已复制，可以粘贴到小红书。";
        }).catch(showManualCopy);
    }
    copyButton.addEventListener("click", copyNote);
}());

/**
 * 共读页内容导航：正文、图文和发布素材分开呈现。
 * 创建者：Codex；创建日期：2026/09/28。
 * 使用锚点保留深层章节链接，不新增存储，也不改变原有复制与下载功能。
 */
(function () {
    "use strict";
    const VIEW_NAMES = ["review", "gallery", "share"];
    const VIEW_HASHES = { review: "review", gallery: "gallery", share: "note" };
    const navigationButtons = Array.from(document.querySelectorAll("[data-journal-view]"));
    const panels = Array.from(document.querySelectorAll("[data-journal-panel]"));

    /**
     * 仅切换已知视图，隐藏内容不继续占据阅读空间。
     * @param {string} viewName 书评、图文或分享视图标识。
     * @returns {void} 页面内操作，不请求远端资源。
     */
    function selectView(viewName) {
        const selectedName = VIEW_NAMES.includes(viewName) ? viewName : "review";
        panels.forEach(function (panel) {
            panel.hidden = panel.dataset.journalPanel !== selectedName;
        });
        navigationButtons.forEach(function (button) {
            button.setAttribute("aria-pressed", String(button.dataset.journalView === selectedName));
        });
        document.body.dataset.journalView = selectedName;
    }

    /** 先显示对应面板，再定位其内部锚点，修复从别页直达隐藏正文的问题。 */
    function applyHash() {
        const anchorName = window.location.hash.slice(1);
        if (anchorName === "gallery") {
            selectView("gallery");
        } else if (anchorName === "note" || anchorName === "share") {
            selectView("share");
        } else if (anchorName.startsWith("review") || anchorName === "discussion" || !anchorName) {
            selectView("review");
        }
        const target = document.getElementById(anchorName);
        if (target) {
            requestAnimationFrame(function () { target.scrollIntoView({ block: "start", behavior: "auto" }); });
        }
    }

    navigationButtons.forEach(function (button) {
        button.addEventListener("click", function () {
            const viewName = button.dataset.journalView;
            selectView(viewName);
            window.location.hash = VIEW_HASHES[viewName];
        });
    });
    selectView("review");
    applyHash();
    window.addEventListener("hashchange", applyHash);
}());
