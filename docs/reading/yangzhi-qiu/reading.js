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
