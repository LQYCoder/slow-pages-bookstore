/** 浏览器级统计选择；不修改阅读存档。创建者：Codex；创建日期：2026/09/28。 */
(function () {
    "use strict";
    const OPT_OUT_KEY = "slowPagesAnalyticsOptOut";
    const VISITOR_KEY = "slowPagesAnalyticsVisitorV1";
    const config = window.READING_ANALYTICS_CONFIG || {};
    const button = document.getElementById("toggleAnalytics");
    const status = document.getElementById("privacyStatus");
    document.getElementById("collectionState").textContent = config.enabled
        ? "当前网站统计已启用，你可以随时关闭本浏览器的上报。" : "当前网站统计尚未启用，没有在采集访问数据。";
    document.getElementById("processorAddress").textContent = config.endpoint
        ? "数据接收服务：" + config.endpoint : "尚未配置统计服务。";
    function render() {
        try {
            const disabled = localStorage.getItem(OPT_OUT_KEY) === "1";
            button.setAttribute("aria-pressed", String(disabled));
            button.textContent = disabled ? "允许本浏览器统计" : "关闭本浏览器统计";
            if (navigator.doNotTrack === "1" || navigator.globalPrivacyControl) {
                status.textContent = "浏览器已发送隐私保护信号，本站不会上报统计。";
            }
        } catch (error) {
            button.disabled = true;
            status.textContent = "浏览器禁止保存设置；可通过浏览器的 Do Not Track / 隐私保护选项关闭统计。";
        }
    }
    button.addEventListener("click", () => {
        try {
            const disabled = localStorage.getItem(OPT_OUT_KEY) !== "1";
            localStorage.setItem(OPT_OUT_KEY, disabled ? "1" : "0");
            if (disabled) {
                localStorage.removeItem(VISITOR_KEY);
            }
            render();
            status.textContent = disabled ? "本浏览器已关闭统计，已打开的其他页面也会停止上报。"
                : "已允许统计；重新打开阅读页面后按网站启用状态生效。";
        } catch (error) {
            status.textContent = "设置未能保存，请使用浏览器的隐私保护选项。";
        }
    });
    render();
})();
