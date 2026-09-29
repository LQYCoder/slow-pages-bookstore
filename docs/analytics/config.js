/**
 * 公开统计配置。创建者：Codex；创建日期：2026/09/28。
 * 后台已部署，按站点所有者要求启用；网络不可达、隐私设置或拦截会造成漏计。
 * 此文件仅包含公开服务地址；不得在此填写管理密钥。
 */
window.READING_ANALYTICS_CONFIG = Object.freeze({
    enabled: true,
    endpoint: "https://slow-pages-analytics.analytics-service.workers.dev",
    siteBasePath: "/slow-pages-bookstore/"
});
