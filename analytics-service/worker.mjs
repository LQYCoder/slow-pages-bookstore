/**
 * 独立访问统计 API：Cloudflare Workers + D1，无第三方运行依赖。
 * 创建者：Codex；创建日期：2026/09/28。
 * 所有管理查询必须鉴权；IP 只用于接入层限流与 Cloudflare 地区元数据，不保存原值。
 */
const MAX_BODY_BYTES = 2048;
const MAX_DAY_MS = 86400000;
const TIMEZONE_OFFSET_MS = 8 * 60 * 60 * 1000;
const FIRST_SAMPLE_ALLOWANCE_MS = 5000;
const MAX_QUERY_DAYS = 31;
const RETENTION_DAYS = 90;
const PAGE_SIZE = 50;
const MIN_SECRET_LENGTH = 32;
const MAX_AUTH_LENGTH = 256;
const MAX_REGION_LENGTH = 80;
const UUID_PATTERN = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const COUNTRY_PATTERN = /^[A-Z]{2}$/;
const BOT_PATTERN = /bot\b|spider|crawler|headless|preview|facebookexternalhit/i;
const PATHS = Object.freeze({
    "index.html": "书架首页",
    "library/hometown/index.html": "故乡 · 全文",
    "library/kong-yiji/index.html": "孔乙己 · 全文",
    "library/madman-diary/index.html": "狂人日记 · 全文",
    "library/ah-q/index.html": "阿Q正传 · 全文",
    "library/medicine/index.html": "药 · 全文",
    "library/boule-de-suif/index.html": "羊脂球 · 法文全文",
    "reading/yangzhi-qiu/index.html": "羊脂球 · 共读手记",
    "reading/yangzhi-qiu/motion/index.html": "羊脂球 · 动态共读"
});
const UPSERT_SQL = `INSERT INTO visit
    (id, day, visitor_hash, path, country, region, city, visible_ms, reading_ms, motion_ms, create_time, update_time)
    VALUES (?, ?, ?, ?, ?, ?, ?, MIN(?, ${FIRST_SAMPLE_ALLOWANCE_MS}), MIN(?, ${FIRST_SAMPLE_ALLOWANCE_MS}), MIN(?, ${FIRST_SAMPLE_ALLOWANCE_MS}), ?, ?)
    ON CONFLICT(id) DO UPDATE SET
        visible_ms = MAX(visit.visible_ms, MIN(?, MAX(0, ? - visit.create_time + ${FIRST_SAMPLE_ALLOWANCE_MS}))),
        reading_ms = MAX(visit.reading_ms, MIN(?, MAX(0, ? - visit.create_time + ${FIRST_SAMPLE_ALLOWANCE_MS}))),
        motion_ms = MAX(visit.motion_ms, MIN(?, MAX(0, ? - visit.create_time + ${FIRST_SAMPLE_ALLOWANCE_MS}))),
        update_time = MAX(visit.update_time, ?)
    WHERE visit.visitor_hash = excluded.visitor_hash AND visit.path = excluded.path AND visit.day = excluded.day`;
const TOTAL_SQL = `SELECT COUNT(*) AS pageViews, COUNT(DISTINCT visitor_hash) AS visitorDays,
    COALESCE(SUM(visible_ms), 0) AS visibleMs, COALESCE(SUM(reading_ms), 0) AS readingMs,
    COALESCE(SUM(motion_ms), 0) AS motionMs,
    COALESCE(SUM(CASE WHEN reading_ms > 0 THEN 1 ELSE 0 END), 0) AS readingViews
    FROM visit WHERE day >= ? AND day <= ?`;

/** 按固定统计时区分日，避免访客提供的时间决定数据库日期。 */
export function dayKey(timestamp) {
    return new Date(timestamp + TIMEZONE_OFFSET_MS).toISOString().slice(0, 10);
}

/** 日期必须真实存在，例如二月三十一日不能被 JavaScript 自动滚到三月。 */
export function validDay(value) {
    if (typeof value !== "string" || !DAY_PATTERN.test(value)) {
        return false;
    }
    const timestamp = Date.parse(value + "T00:00:00Z");
    return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

/** 字段采用白名单，地区与访客身份不能从客户端请求覆盖。 */
export function validateEvent(value, now) {
    if (!value || Array.isArray(value) || value.version !== 1
        || typeof value.pageId !== "string" || typeof value.visitorId !== "string"
        || typeof value.path !== "string" || !UUID_PATTERN.test(value.pageId)
        || !UUID_PATTERN.test(value.visitorId) || !Object.hasOwn(PATHS, value.path) || !validDay(value.day)) {
        return false;
    }
    if (![dayKey(now), dayKey(now - MAX_DAY_MS)].includes(value.day)) {
        return false;
    }
    for (const key of ["visibleMs", "readingMs", "motionMs"]) {
        if (!Number.isSafeInteger(value[key]) || value[key] < 0 || value[key] > MAX_DAY_MS) {
            return false;
        }
    }
    return value.readingMs <= value.visibleMs && value.motionMs <= value.visibleMs;
}

/** 统一响应不回显数据库错误、密钥或请求正文。 */
function response(payload, status, origin) {
    const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff", "Vary": "Origin" };
    if (origin) {
        headers["Access-Control-Allow-Origin"] = origin;
    }
    return new Response(status === 204 ? null : JSON.stringify(payload), { status, headers });
}

/** 错误码仅用于排查，message 用作用户提示。 */
function failure(status, code, message, origin) {
    return response({ errorCode: code, errorMessage: message, message }, status, origin);
}

/** 以服务端 secret 生成按日标识；数据库不可直接还原浏览器随机 ID。 */
async function anonymize(secret, text) {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", encoder.encode(secret),
        { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(text));
    return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** 比较固定长度摘要，避免按字符早退泄露管理密钥的匹配前缀。 */
async function authorized(request, expected) {
    const header = request.headers.get("Authorization") || "";
    if (!header.startsWith("Bearer ") || header.length > MAX_AUTH_LENGTH) {
        return false;
    }
    const encoder = new TextEncoder();
    const [provided, known] = await Promise.all([
        crypto.subtle.digest("SHA-256", encoder.encode(header.slice("Bearer ".length))),
        crypto.subtle.digest("SHA-256", encoder.encode(expected))
    ]);
    const suppliedBytes = new Uint8Array(provided);
    const expectedBytes = new Uint8Array(known);
    let difference = 0;
    for (let index = 0; index < suppliedBytes.length; index += 1) {
        difference |= suppliedBytes[index] ^ expectedBytes[index];
    }
    return difference === 0;
}

/** 有界流读取，不相信 Content-Length；超限立即取消读取并释放流锁。 */
async function readEvent(request) {
    if (!request.body) {
        return { error: "empty" };
    }
    const reader = request.body.getReader();
    const chunks = [];
    let length = 0;
    try {
        while (true) {
            const part = await reader.read();
            if (part.done) {
                break;
            }
            length += part.value.byteLength;
            if (length > MAX_BODY_BYTES) {
                await reader.cancel();
                return { error: "large" };
            }
            chunks.push(part.value);
        }
    } finally {
        reader.releaseLock();
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    try {
        return { value: JSON.parse(new TextDecoder().decode(bytes)) };
    } catch (error) {
        return { error: "format" };
    }
}

/** 接入层提供地区，缺失时保留“未知”，不从浏览器传入的 city 字段猜测。 */
function geoValue(value) {
    return typeof value === "string" && value.length <= MAX_REGION_LENGTH ? value : "未知";
}

/** 参数绑定与原子 UPSERT；累计时间取最大值，重复或乱序上报不会多计。 */
async function collect(request, env, origin, now) {
    if (BOT_PATTERN.test(request.headers.get("User-Agent") || "") || request.headers.get("DNT") === "1") {
        return response(null, 204, origin);
    }
    const contentType = request.headers.get("Content-Type") || "";
    if (!contentType.startsWith("text/plain") && !contentType.startsWith("application/json")) {
        return failure(415, "A0001", "不支持的数据格式。", origin);
    }
    const input = await readEvent(request);
    if (input.error) {
        return failure(input.error === "large" ? 413 : 400, "A0001", "统计数据格式或大小不符合要求。", origin);
    }
    const event = input.value;
    if (!validateEvent(event, now)) {
        return failure(400, "A0001", "统计字段不符合要求。", origin);
    }
    const visitorHash = await anonymize(env.VISITOR_SECRET, event.day + ":" + event.visitorId);
    const recent = await env.EVENT_LIMITER.limit({ key: "visitor:" + visitorHash });
    if (!recent.success) {
        return failure(429, "A0001", "请求过于频繁，请稍后重试。", origin);
    }
    // 跨午夜的迟到补报只能修改已存在的昨天记录，不能回填任意“历史访问”。
    if (event.day !== dayKey(now)) {
        const old = await env.DB.prepare(`SELECT id FROM visit WHERE id = ? AND day = ? AND visitor_hash = ?`)
            .bind(event.pageId, event.day, visitorHash).all();
        if (!old.results.length) {
            return response(null, 204, origin);
        }
    }
    const metadata = request.cf || {};
    const country = COUNTRY_PATTERN.test(metadata.country || "") ? metadata.country : "未知";
    await env.DB.prepare(UPSERT_SQL).bind(event.pageId, event.day, visitorHash, event.path,
        country, geoValue(metadata.region), geoValue(metadata.city), event.visibleMs, event.readingMs,
        event.motionMs, now, now, event.visibleMs, now, event.readingMs, now, event.motionMs, now, now).run();
    return response(null, 204, origin);
}

/** 日期区间和页号均有上界，分页总数为零时不再执行明细查询。 */
async function statistics(request, env, origin, now) {
    if (!await authorized(request, env.ADMIN_TOKEN)) {
        return failure(401, "A0001", "管理密钥无效或未提供。", origin);
    }
    const query = new URL(request.url).searchParams;
    const from = query.get("from") || dayKey(now);
    const to = query.get("to") || dayKey(now);
    const days = (Date.parse(to) - Date.parse(from)) / MAX_DAY_MS + 1;
    if (!validDay(from) || !validDay(to) || days < 1 || days > MAX_QUERY_DAYS || to > dayKey(now)) {
        return failure(400, "A0001", "请选择不超过 31 天且不晚于今天的日期范围。", origin);
    }
    const range = [from, to];
    const total = (await env.DB.prepare(TOTAL_SQL).bind(...range).all()).results[0];
    const [dailyResult, pageResult, regionResult] = await Promise.all([
        env.DB.prepare(`SELECT day, COUNT(*) AS pageViews, COUNT(DISTINCT visitor_hash) AS visitors,
            SUM(visible_ms) AS visibleMs, SUM(reading_ms) AS readingMs
            FROM visit WHERE day >= ? AND day <= ? GROUP BY day ORDER BY day`).bind(...range).all(),
        env.DB.prepare(`SELECT path, COUNT(*) AS pageViews, COUNT(DISTINCT visitor_hash) AS visitorDays,
            SUM(visible_ms) AS visibleMs, SUM(reading_ms) AS readingMs, SUM(motion_ms) AS motionMs
            FROM visit WHERE day >= ? AND day <= ? GROUP BY path ORDER BY pageViews DESC`).bind(...range).all(),
        env.DB.prepare(`SELECT country, region, city, COUNT(*) AS pageViews,
            COUNT(DISTINCT visitor_hash) AS visitorDays FROM visit WHERE day >= ? AND day <= ?
            GROUP BY country, region, city ORDER BY pageViews DESC LIMIT 100`).bind(...range).all()
    ]);
    const pageCount = Math.max(1, Math.ceil(total.pageViews / PAGE_SIZE));
    const requestedPage = Number(query.get("page") || "1");
    const page = Number.isSafeInteger(requestedPage) ? Math.max(1, Math.min(pageCount, requestedPage)) : 1;
    const visits = total.pageViews ? (await env.DB.prepare(`SELECT create_time AS startedAt, path,
        country, region, city, visible_ms AS visibleMs, reading_ms AS readingMs, motion_ms AS motionMs
        FROM visit WHERE day >= ? AND day <= ? ORDER BY create_time DESC, id DESC LIMIT ? OFFSET ?`)
        .bind(...range, PAGE_SIZE, (page - 1) * PAGE_SIZE).all()).results : [];
    return response({ from, to, timezone: "Asia/Shanghai", generatedAt: now, totals: total,
        daily: dailyResult.results, pages: pageResult.results, regions: regionResult.results,
        visits, page, pageCount, pageSize: PAGE_SIZE, titles: PATHS }, 200, origin);
}

/** 配置缺失时拒绝请求，不把无密钥后台暴露成公开接口。 */
export async function handleRequest(request, env, now = Date.now()) {
    const origin = request.headers.get("Origin");
    if (!origin || origin !== env.ALLOWED_ORIGIN) {
        return failure(403, "A0001", "不允许此来源访问。", null);
    }
    const url = new URL(request.url);
    if (!env.ADMIN_TOKEN || env.ADMIN_TOKEN.length < MIN_SECRET_LENGTH || !env.VISITOR_SECRET
        || env.VISITOR_SECRET.length < MIN_SECRET_LENGTH || !env.DB || !env.EVENT_LIMITER || !env.REQUEST_LIMITER) {
        return failure(503, "B0001", "统计服务尚未完成配置。", origin);
    }
    if (request.method === "OPTIONS") {
        const result = response(null, 204, origin);
        result.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        result.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
        result.headers.set("Access-Control-Max-Age", "600");
        return result;
    }
    // IP 哈希仅作为边缘限流键，不写数据库。宽松上限兼顾共享网络，多层限流仍不能阻止所有伪造流量。
    const address = request.headers.get("CF-Connecting-IP") || "unknown";
    const limitKey = await anonymize(env.VISITOR_SECRET, dayKey(now) + ":rate:" + address);
    const allowed = await env.REQUEST_LIMITER.limit({ key: limitKey });
    if (!allowed.success) {
        return failure(429, "A0001", "请求过于频繁，请稍后重试。", origin);
    }
    if (url.pathname === "/events" && request.method === "POST") {
        return collect(request, env, origin, now);
    }
    if (url.pathname === "/stats" && request.method === "GET") {
        return statistics(request, env, origin, now);
    }
    return failure(404, "A0001", "接口不存在。", origin);
}

export default {
    /** 最外层返回可理解错误，不向浏览器泄露数据库异常和配置。 */
    async fetch(request, env) {
        try {
            return await handleRequest(request, env);
        } catch (error) {
            const origin = request.headers.get("Origin") === env.ALLOWED_ORIGIN ? env.ALLOWED_ORIGIN : null;
            return failure(503, "B0001", "统计服务暂时不可用，请稍后重试。", origin);
        }
    },
    /** 到期记录按首次接收时间清理；配置为每天一次，不影响正常读书。 */
    async scheduled(controller, env) {
        const cutoff = controller.scheduledTime - RETENTION_DAYS * MAX_DAY_MS;
        const expired = await env.DB.prepare("SELECT COUNT(*) AS total FROM visit WHERE create_time < ?")
            .bind(cutoff).all();
        if (expired.results[0].total > 0) {
            await env.DB.prepare("DELETE FROM visit WHERE create_time < ?").bind(cutoff).run();
        }
    }
};
