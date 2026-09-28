# 慢页独立统计服务

当前交付：采集脚本、私人看板、Cloudflare Workers 接收端及 D1 表结构。
**未配置 Cloudflare 账号、数据库或部署地址；前端 enabled=false，不会采集任何访问。**
GitHub Pages 只负责静态网页，不能保存来自所有读者的访问记录。

## 接入步骤（准备就绪后由助手继续执行）

1. 使用 Cloudflare 账号登录官方 Wrangler CLI（`wrangler login`）。密钥不要粘贴在公开仓库。
2. 复制 `wrangler.toml.example` 为 `wrangler.toml`；配置文件已被忽略。
3. `wrangler d1 create slow-pages-analytics`，将返回 ID 填入配置。只操作这个新库。
4. `wrangler d1 execute slow-pages-analytics --remote --file=schema.sql` 初始化新库。
5. 分别生成至少 32 字节随机值，使用 `wrangler secret put ADMIN_TOKEN` 和
   `wrangler secret put VISITOR_SECRET` 保存。前者是私人报表密钥，后者用于匿名化，不能相同。
6. 核对 ALLOWED_ORIGIN、D1 绑定与限流 namespace_id；确保不与账号已有项目共享限流空间。
7. `wrangler deploy`，得到 HTTPS 地址。默认走 workers.dev，无需修改网站域名。
8. 用有效/无效管理密钥检查 /stats，发送受控测试访问并核对地区、重复补报和时间聚合。
9. 将 `docs/analytics/config.js` 的 endpoint 设为根地址，enabled 改为 true，提交并推送到 main，等待 GitHub Pages 发布。
10. 访问 `https://lqycoder.github.io/slow-pages-bookstore/analytics/index.html`，输入管理密钥。

需要实际账号授权才能部署；不能仅通过修改 HTML 假装全站统计已经工作。
免费计划达到 Workers / D1 日额度后可能停止收集；不自动升级套餐。
大陆网络访问 workers.dev 的可达性需要实测；若不可达，可使用受支持的自定义域名或改用已有服务器。
后端接口与采集格式独立，迁移服务时只需要替换适配层与公开 endpoint。

## 文件和维护

- worker.mjs：鉴权、CORS、地区读取、限流、幂等写入、统计与保留期清理。
- schema.sql：D1 / SQLite 单表结构，不含任何真实访问数据。
- 设计与统计口径.md：指标、数据流、存储边界与已知偏差。
- ../docs/analytics/：静态看板、隐私选择与浏览器计时。
- ../tests/AnalyticsMetricsTest.cjs：计时、空闲、可见性与时区边界。
- ../tests/AnalyticsApiTest.mjs：SQLite 实际执行的聚合、鉴权、去重、限流与删除边界测试。

测试使用本地 SQLite、注入的假地区元数据与假密钥，完全不依赖线上服务。
查看地区字段需要部署到 Cloudflare 后真实请求；本地测试不能证明线上 IP 定位准确性。
管理密钥只在后台页内存驻留，不写 localStorage、URL、HTML 或任何 Git 文件。

## 统计口径提醒

日 UV 是匿名浏览器估算，不是精确人数。跨天区间显示“访客日”，不是跨天去重人数。
平均停留以所有 PV 为分母；平均阅读只以有阅读时间的 PV 为分母，界面显示分母。
前台停留和有效阅读是两个值；阅读的空闲阈值为 60 秒，动态观看单独统计。
所有访问时间按北京时间显示。IP 只用于接入层解析地区与短期限流，不保留原始值。
已关闭的历史页面无法补计。退出补报是尽力发送，网络失败和广告拦截会造成漏计。

官方资料：
- https://developers.cloudflare.com/workers/wrangler/install-and-update/
- https://developers.cloudflare.com/d1/get-started/
- https://developers.cloudflare.com/workers/runtime-apis/request/
- https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/

## 可重复校验

在仓库根目录执行 `node --test tests/AnalyticsMetricsTest.cjs tests/AnalyticsApiTest.mjs`。
需要 Node.js 20 或更新版本，以及 Python 3（内置 SQLite），不需要线上服务或真实密钥。
