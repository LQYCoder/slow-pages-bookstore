/** 管理密钥仅驻留内存；所有报表文字用 textContent 渲染。创建者：Codex；2026/09/28。 */
(function () {
    "use strict";
    const DAY_MS = 86400000;
    const MAX_QUERY_DAYS = 31;
    const REQUEST_TIMEOUT_MS = 15000;
    const SECONDS_PER_MINUTE = 60;
    const MINUTES_PER_HOUR = 60;
    const MILLISECONDS_PER_SECOND = 1000;
    const MAX_CHART_HEIGHT = 150;
    const MIN_TOKEN_LENGTH = 32;
    const MAX_TOKEN_LENGTH = 200;
    const MAX_TOKEN_INPUT_LENGTH = 256;
    const TOKEN_LABEL_PATTERN = /^(?:管理密钥|ADMIN_TOKEN)\s*[:：]\s*/i;
    const VISIBLE_ASCII_PATTERN = /^[\x21-\x7E]+$/;
    const getElement = (id) => document.getElementById(id);
    let token = "";
    let endpoint = "";
    let report = null;
    let controller = null;
    let requestVersion = 0;
    const today = window.ReadingMetrics.dayKey(Date.now());
    getElement("fromDate").value = window.ReadingMetrics.dayKey(Date.now() - 6 * DAY_MS);
    getElement("toDate").value = today;
    getElement("fromDate").max = today;
    getElement("toDate").max = today;
    const config = window.READING_ANALYTICS_CONFIG;
    if (config && config.endpoint) {
        getElement("apiEndpoint").value = config.endpoint;
        // 配置地址后给出实际登录步骤；是否连通仍以鉴权请求的结果为准。
        getElement("setupDescription").textContent = "统计服务地址已填好。输入管理密钥，可查看启用后收到的访问数据。";
    }

    /**
     * 兼容复制私密说明中的整行密钥，只移除已知标签及首尾空白。
     * 不改写密钥内部字符、不进行编码转换，避免悄悄改变认证值。
     * 返回格式错误供表单展示；禁止把用户输入拼入错误消息或日志。
     */
    function parseAdminToken(rawValue) {
        if (rawValue.length > MAX_TOKEN_INPUT_LENGTH) {
            return { error: "粘贴内容过长，请只复制管理密钥所在的一行。" };
        }
        const candidate = rawValue.trim().replace(TOKEN_LABEL_PATTERN, "").trim();
        if (!candidate) {
            return { error: "请填写私密登录文件中的管理密钥。" };
        }
        if (!VISIBLE_ASCII_PATTERN.test(candidate)) {
            return { error: "密钥中含有中文、空格或不可见字符。请重新复制密钥，可保留“管理密钥：”前缀。" };
        }
        if (candidate.length < MIN_TOKEN_LENGTH || candidate.length > MAX_TOKEN_LENGTH) {
            return { error: "管理密钥应为 " + MIN_TOKEN_LENGTH + "—" + MAX_TOKEN_LENGTH + " 个字符，请检查是否复制完整。" };
        }
        return { value: candidate };
    }

    /** 格式错误在输入框旁说明，焦点回到字段；不向网络发送无效密钥。 */
    function showTokenError(message) {
        const input = getElement("adminToken");
        input.setAttribute("aria-invalid", "true");
        getElement("tokenError").textContent = message;
        getElement("tokenError").hidden = false;
        getElement("dashboardStatus").textContent = "请修正管理密钥后重试，尚未发送验证请求。";
        input.focus();
    }

    /** 网络故障不能被描述成密钥错误，也不直接展示浏览器内部的英文异常。 */
    function connectionMessage(error) {
        if (error.name === "AbortError") {
            return "连接超时，统计接口在当前网络可能无法直连。请检查网络或使用可达的统计服务地址。";
        }
        if (error instanceof TypeError) {
            return "无法连接统计服务，请检查网络或服务地址。这不代表管理密钥错误，也不代表没有访问。";
        }
        if (error instanceof SyntaxError) {
            return "统计服务返回的数据格式异常，请稍后重试。";
        }
        return error.message;
    }

    /** 时长不夸大精度；不足一秒时显示 0 秒，尚未连接由上层显示破折号。 */
    function duration(milliseconds) {
        const seconds = Math.max(0, Math.round(Number(milliseconds) / MILLISECONDS_PER_SECOND));
        if (seconds < SECONDS_PER_MINUTE) {
            return seconds + "秒";
        }
        const minutes = Math.floor(seconds / SECONDS_PER_MINUTE);
        if (minutes < MINUTES_PER_HOUR) {
            return minutes + "分" + seconds % SECONDS_PER_MINUTE + "秒";
        }
        return Math.floor(minutes / MINUTES_PER_HOUR) + "时" + minutes % MINUTES_PER_HOUR + "分";
    }

    /** 地区为网络出口推断，不展示或推测真实地址。 */
    function regionName(item) {
        let country = item.country || "未知";
        if (/^[A-Z]{2}$/.test(country) && Intl.DisplayNames) {
            country = new Intl.DisplayNames(["zh-CN"], { type: "region" }).of(country);
        }
        return Array.from(new Set([country, item.region, item.city].filter(Boolean))).join(" · ");
    }

    /** 创建表格单元格；即便服务端地区字段包含 HTML，也只显示为文本。 */
    function renderRows(id, rows, columns) {
        const body = getElement(id);
        body.replaceChildren();
        if (!rows.length) {
            const row = document.createElement("tr");
            const cell = document.createElement("td");
            cell.colSpan = columns;
            cell.className = "empty";
            cell.textContent = "所选日期暂无已收到的记录。";
            row.append(cell);
            body.append(row);
            return;
        }
        for (const values of rows) {
            const row = document.createElement("tr");
            for (const value of values) {
                const cell = document.createElement("td");
                cell.textContent = String(value);
                row.append(cell);
            }
            body.append(row);
        }
    }

    /** 为区间内没有访问的日期补零，使每日趋势不会跳过空白天。 */
    function completeDays(data) {
        const existing = new Map(data.daily.map((day) => [day.day, day]));
        const days = [];
        for (let time = Date.parse(data.from); time <= Date.parse(data.to); time += DAY_MS) {
            const key = new Date(time).toISOString().slice(0, 10);
            days.push(existing.get(key) || { day: key, visitors: 0, pageViews: 0, visibleMs: 0, readingMs: 0 });
        }
        return days;
    }

    /** 图表保留对应文字表格，屏幕阅读器不必理解图形高度。 */
    function renderChart(days) {
        const chart = getElement("dailyChart");
        chart.replaceChildren();
        const peak = Math.max(1, ...days.map((day) => day.pageViews));
        for (const day of days) {
            const column = document.createElement("div");
            column.className = "chart-day";
            column.setAttribute("aria-label", day.day + "，访客 " + day.visitors + "，浏览 " + day.pageViews);
            const bars = document.createElement("div");
            bars.className = "chart-bars";
            bars.setAttribute("aria-hidden", "true");
            for (const value of [day.visitors, day.pageViews]) {
                const bar = document.createElement("i");
                bar.style.height = Math.max(0, Math.min(MAX_CHART_HEIGHT, value / peak * MAX_CHART_HEIGHT)) + "px";
                bars.append(bar);
            }
            const label = document.createElement("span");
            label.textContent = day.day.slice(5);
            column.append(bars, label);
            chart.append(column);
        }
    }

    /** 平均阅读的分母仅为阅读时间大于零的浏览；多天 UV 明确标成访客日。 */
    function renderReport(data) {
        report = data;
        const total = data.totals;
        getElement("visitorLabel").textContent = data.from === data.to ? "当日访客 UV" : "访客日";
        getElement("visitorCount").textContent = total.visitorDays.toLocaleString();
        getElement("pageViews").textContent = total.pageViews.toLocaleString();
        getElement("averageStay").textContent = duration(total.pageViews ? total.visibleMs / total.pageViews : 0);
        getElement("readingTotal").textContent = duration(total.readingMs);
        getElement("averageReading").textContent = duration(
            total.readingViews ? total.readingMs / total.readingViews : 0);
        getElement("readingViews").textContent = total.readingViews.toLocaleString();
        getElement("motionTotal").textContent = duration(total.motionMs);
        const days = completeDays(data);
        renderChart(days);
        renderRows("dailyRows", days.map((day) => [day.day, day.visitors, day.pageViews,
            duration(day.pageViews ? day.visibleMs / day.pageViews : 0), duration(day.readingMs)]), 5);
        renderRows("pageRows", data.pages.map((page) => [data.titles[page.path] || page.path, page.pageViews,
            duration(page.pageViews ? page.visibleMs / page.pageViews : 0), duration(page.readingMs)]), 4);
        renderRows("regionRows", data.regions.map((region) => [
            regionName(region), region.pageViews, region.visitorDays]), 3);
        renderRows("visitRows", data.visits.map((visit) => [formatTime(visit.startedAt),
            data.titles[visit.path] || visit.path, regionName(visit), duration(visit.visibleMs),
            duration(visit.readingMs), duration(visit.motionMs)]), 6);
        getElement("pageLabel").textContent = data.page + " / " + data.pageCount + " 页 · 共 " + total.pageViews + " 次浏览";
        getElement("previousPage").disabled = data.page <= 1;
        getElement("nextPage").disabled = data.page >= data.pageCount;
        getElement("exportButton").disabled = !data.visits.length;
        getElement("setupPanel").hidden = true;
        getElement("disconnectButton").hidden = false;
        getElement("connectionBadge").textContent = "已连接 · 私人报表";
        getElement("dashboardStatus").textContent = "数据范围 " + data.from + " — " + data.to
            + " · 更新于 " + formatTime(data.generatedAt) + "（北京时间）";
    }

    /** 固定时区，避免管理者在其他时区查看时误读访问日期。 */
    function formatTime(timestamp) {
        return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit",
            day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(timestamp);
    }

    /** 新查询取消旧请求，并用版本号防止迟到响应覆盖用户刚选的新日期。 */
    async function loadReport(page = 1) {
        const from = getElement("fromDate").value;
        const to = getElement("toDate").value;
        const days = (Date.parse(to) - Date.parse(from)) / DAY_MS + 1;
        if (!from || !to || days < 1 || days > MAX_QUERY_DAYS || to > today) {
            getElement("dashboardStatus").textContent = "请选择不超过 31 天且不晚于今天的有效日期范围。";
            return;
        }
        if (controller) {
            controller.abort();
        }
        controller = new AbortController();
        const localController = controller;
        const version = ++requestVersion;
        const timeout = window.setTimeout(() => localController.abort(), REQUEST_TIMEOUT_MS);
        getElement("connectButton").disabled = true;
        getElement("refreshButton").disabled = true;
        getElement("dashboardStatus").textContent = "正在读取统计；尚未完成前仍显示上次成功结果。";
        try {
            const query = new URLSearchParams({ from, to, page: String(page) });
            const result = await fetch(endpoint + "/stats?" + query, { headers: { Authorization: "Bearer " + token },
                cache: "no-store", credentials: "omit", signal: localController.signal });
            if (!result.ok) {
                throw new Error(result.status === 401 ? "管理密钥不正确，请重新连接。" : "统计服务未能返回数据，请稍后重试。");
            }
            const data = await result.json();
            if (version === requestVersion) {
                renderReport(data);
            }
        } catch (error) {
            if (version === requestVersion) {
                getElement("dashboardStatus").textContent = connectionMessage(error);
                getElement("setupPanel").hidden = false;
                getElement("connectionBadge").textContent = report ? "连接失败 · 显示上次结果" : "连接失败 · 没有数据";
            }
        } finally {
            window.clearTimeout(timeout);
            if (version === requestVersion) {
                getElement("connectButton").disabled = false;
                getElement("refreshButton").disabled = !token;
            }
        }
    }

    /** 退出时清除内存与可见记录，而不是只把按钮变回登录状态。 */
    function disconnect() {
        requestVersion += 1;
        if (controller) {
            controller.abort();
        }
        token = "";
        endpoint = "";
        report = null;
        getElement("adminToken").value = "";
        location.reload();
    }

    getElement("connectForm").addEventListener("submit", (event) => {
        event.preventDefault();
        const parsedToken = parseAdminToken(getElement("adminToken").value);
        if (parsedToken.error) {
            showTokenError(parsedToken.error);
            return;
        }
        getElement("adminToken").setAttribute("aria-invalid", "false");
        getElement("tokenError").hidden = true;
        getElement("tokenError").textContent = "";
        let address;
        try {
            address = new URL(getElement("apiEndpoint").value.trim());
        } catch (error) {
            getElement("dashboardStatus").textContent = "请填写有效的 HTTPS 统计服务地址。";
            getElement("apiEndpoint").focus();
            return;
        }
        if (address.protocol !== "https:" || address.username || address.password || address.search || address.hash
            || address.pathname !== "/") {
            getElement("dashboardStatus").textContent = "请填写 HTTPS 服务根地址，不要包含路径、查询参数或用户名。";
            getElement("apiEndpoint").focus();
            return;
        }
        endpoint = address.origin;
        token = parsedToken.value;
        getElement("adminToken").value = "";
        loadReport();
    });
    getElement("adminToken").addEventListener("input", () => {
        getElement("adminToken").setAttribute("aria-invalid", "false");
        getElement("tokenError").hidden = true;
        getElement("tokenError").textContent = "";
    });
    getElement("rangeForm").addEventListener("submit", (event) => { event.preventDefault(); loadReport(); });
    getElement("previousPage").addEventListener("click", () => { if (report) { loadReport(report.page - 1); } });
    getElement("nextPage").addEventListener("click", () => { if (report) { loadReport(report.page + 1); } });
    getElement("disconnectButton").addEventListener("click", disconnect);
    getElement("exportButton").addEventListener("click", () => {
        if (!report) {
            return;
        }
        const rows = [["北京时间", "页面", "地区", "停留毫秒", "阅读毫秒", "观看毫秒"],
            ...report.visits.map((visit) => [formatTime(visit.startedAt), report.titles[visit.path], regionName(visit),
                visit.visibleMs, visit.readingMs, visit.motionMs])];
        // 防止地区文本被电子表格解释为公式，CSV 所有字段均加引号并转义。
        const csv = rows.map((row) => row.map((value) => {
            const text = String(value ?? "");
            const safe = /^[=+@\-\t\r]/.test(text) ? "'" + text : text;
            return '"' + safe.replaceAll('"', '""') + '"';
        }).join(",")).join("\r\n");
        const objectUrl = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
        const anchor = document.createElement("a");
        anchor.href = objectUrl;
        anchor.download = "慢页访问-" + report.from + "-第" + report.page + "页.csv";
        anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), MILLISECONDS_PER_SECOND);
    });
    window.addEventListener("pageshow", (event) => {
        if (event.persisted) {
            disconnect();
        }
    });
    window.addEventListener("pagehide", () => {
        token = "";
        if (controller) {
            controller.abort();
        }
    });
})();
