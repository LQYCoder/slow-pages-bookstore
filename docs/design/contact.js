/**
 * 慢页联系方式模块：按用户点击复制微信号，并在浏览器拒绝时提供手动复制。
 * 创建者：Codex；创建日期：2026/10/14。
 * 本模块不请求网络、不打开微信、不收集联系方式操作记录。
 */
(function () {
    "use strict";

    const CONTACT_NAME = "黎先生";
    const WECHAT_ID = "18312398810";
    const COPY_BUTTON_SELECTOR = "[data-copy-wechat]";
    const CONTACT_CONTAINER_SELECTOR = "[data-contact-container], #contact, .reading-contact-bar";
    let manualFieldCount = 0;

    /**
     * 创建静态 DOM 节点；所有显示文案以 textContent 写入，避免 HTML 注入。
     * @param {string} tagName HTML 标签名称。
     * @param {string} className 模块样式类名。
     * @param {string} content 文本内容。
     * @returns {HTMLElement} 新建且尚未挂载的节点。
     */
    function createTextElement(tagName, className, content) {
        const element = document.createElement(tagName);
        element.className = className;
        element.textContent = content;
        return element;
    }

    /**
     * 为没有首页联系方式区块的阅读页面追加联系条。
     * @returns {void}
     */
    function appendReadingContact() {
        if (document.getElementById("contact") || document.getElementById("readingContact")) {
            return;
        }

        // 导出模式不主动生成联系模块，防止文学卡片截入无关内容。
        if (document.body.classList.contains("export-mode")) {
            return;
        }

        const contactSection = document.createElement("section");
        contactSection.id = "readingContact";
        contactSection.className = "reading-contact-bar";
        contactSection.dataset.contactContainer = "";
        contactSection.setAttribute("aria-labelledby", "readingContactTitle");

        const introduction = document.createElement("div");
        introduction.appendChild(createTextElement("p", "contact-eyebrow", "MADE WITH CARE / 慢页制作"));
        const heading = createTextElement("h2", "contact-heading", "想把你的想法做成网站？");
        heading.id = "readingContactTitle";
        introduction.appendChild(heading);
        introduction.appendChild(createTextElement(
            "p", "contact-description", "网站、App、小程序开发，可以联系" + CONTACT_NAME + "聊聊。"
        ));

        const actions = document.createElement("div");
        actions.className = "contact-actions";
        actions.appendChild(createTextElement("p", "contact-wechat", CONTACT_NAME + " · 微信号 " + WECHAT_ID));
        const copyButton = createTextElement("button", "contact-copy-button", "复制微信号");
        copyButton.type = "button";
        copyButton.dataset.copyWechat = "";
        copyButton.setAttribute("aria-label", "复制" + CONTACT_NAME + "的微信号 " + WECHAT_ID);
        actions.appendChild(copyButton);

        contactSection.appendChild(introduction);
        contactSection.appendChild(actions);

        // 兼容共读页和电影阅读页不同的 footer 层级，始终处于文档流内。
        const pageFooter = document.querySelector("footer");
        if (pageFooter && pageFooter.parentNode) {
            pageFooter.parentNode.insertBefore(contactSection, pageFooter);
        } else {
            document.body.appendChild(contactSection);
        }
    }

    /**
     * 获取联系区块中的无障碍状态节点；首页可自行提供相同类名。
     * @param {HTMLElement} contactContainer 当前复制按钮所属的区块。
     * @returns {HTMLElement} 状态节点。
     */
    function getStatusElement(contactContainer) {
        let statusElement = contactContainer.querySelector(".contact-status, [data-contact-status]");
        if (!statusElement) {
            statusElement = createTextElement("p", "contact-status", "");
            contactContainer.appendChild(statusElement);
        }
        statusElement.classList.add("contact-status");
        statusElement.setAttribute("role", "status");
        statusElement.setAttribute("aria-live", "polite");
        statusElement.setAttribute("aria-atomic", "true");
        return statusElement;
    }

    /**
     * 获取手动复制区块；失败时才显示号码输入框，避免额外的默认干扰。
     * @param {HTMLElement} contactContainer 当前复制按钮所属的区块。
     * @returns {HTMLElement} 含只读号码输入框的区块。
     */
    function getManualCopyElement(contactContainer) {
        let manualElement = contactContainer.querySelector(".contact-manual-copy");
        if (manualElement) {
            return manualElement;
        }

        manualFieldCount += 1;
        manualElement = document.createElement("div");
        manualElement.className = "contact-manual-copy";
        manualElement.hidden = true;
        const inputId = "contactManualNumber" + manualFieldCount;
        const manualLabel = createTextElement("label", "contact-manual-label", "长按或选中下方微信号，手动复制：");
        manualLabel.htmlFor = inputId;

        const manualInput = document.createElement("input");
        manualInput.id = inputId;
        manualInput.className = "contact-manual-input";
        manualInput.type = "text";
        manualInput.value = WECHAT_ID;
        manualInput.readOnly = true;
        manualInput.spellcheck = false;
        manualInput.setAttribute("autocomplete", "off");
        manualInput.addEventListener("click", function () {
            manualInput.select();
        });

        manualElement.appendChild(manualLabel);
        manualElement.appendChild(manualInput);
        contactContainer.appendChild(manualElement);
        return manualElement;
    }

    /**
     * 浏览器不支持或拒绝剪贴板时，将焦点移到可选择的微信号。
     * @param {HTMLElement} manualElement 手动复制区块。
     * @returns {void}
     */
    function showManualCopy(manualElement) {
        manualElement.hidden = false;
        const manualInput = manualElement.querySelector("input");
        if (manualInput) {
            manualInput.focus();
            manualInput.select();
        }
    }

    /**
     * 仅在用户点击后操作剪贴板；失败状态保留明确的手动复制入口。
     * @param {HTMLButtonElement} copyButton 用户点击的复制按钮。
     * @param {HTMLElement} contactContainer 联系区块。
     * @returns {Promise<void>} 复制流程完成后兑现。
     */
    async function copyWechat(copyButton, contactContainer) {
        const statusElement = getStatusElement(contactContainer);
        const manualElement = getManualCopyElement(contactContainer);
        const clipboardSupported = Boolean(navigator.clipboard && navigator.clipboard.writeText);
        if (!clipboardSupported) {
            statusElement.textContent = "当前浏览器不支持自动复制，请手动复制下方微信号。";
            showManualCopy(manualElement);
            return;
        }

        copyButton.disabled = true;
        copyButton.setAttribute("aria-busy", "true");
        try {
            await navigator.clipboard.writeText(WECHAT_ID);
            manualElement.hidden = true;
            statusElement.textContent = "微信号已复制，打开微信搜索 " + WECHAT_ID + "。";
        } catch {
            // 权限拒绝和非 HTTPS 环境不作为系统错误展示，只提供可操作的替代方式。
            statusElement.textContent = "浏览器未允许自动复制，请手动复制下方微信号。";
            showManualCopy(manualElement);
        } finally {
            copyButton.disabled = false;
            copyButton.removeAttribute("aria-busy");
        }
    }

    /**
     * 初始化首页已有按钮和阅读页自动生成的按钮。
     * @returns {void}
     */
    function initializeContact() {
        appendReadingContact();
        for (const copyButton of document.querySelectorAll(COPY_BUTTON_SELECTOR)) {
            const contactContainer = copyButton.closest(CONTACT_CONTAINER_SELECTOR);
            if (!contactContainer || copyButton.dataset.contactReady === "true") {
                continue;
            }

            copyButton.dataset.contactReady = "true";
            getStatusElement(contactContainer);
            copyButton.addEventListener("click", function () {
                copyWechat(copyButton, contactContainer);
            });
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initializeContact, { once: true });
    } else {
        initializeContact();
    }
}());
