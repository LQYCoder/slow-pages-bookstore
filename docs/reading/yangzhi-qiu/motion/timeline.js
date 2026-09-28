/**
 * 不依赖 DOM 的时间轴计算；浏览器直接加载，Node 可独立验证边界。
 * 创建者：Codex；创建日期：2026/09/28。
 */
(function (globalScope) {
    "use strict";
    const MIN_DURATION = 0.1;

    /** 把外部时间限制在有效区间，非有限数字回到起点。 */
    function clampTime(value, duration) {
        const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
        const safeValue = Number.isFinite(value) ? value : 0;
        return Math.min(safeDuration, Math.max(0, safeValue));
    }

    /** 生成连续分镜区间；无效配置应在启动时明确失败，避免出现空白播放器。 */
    function createTimeline(sceneList) {
        if (!Array.isArray(sceneList) || sceneList.length === 0) {
            throw new TypeError("至少需要一个有效分镜。");
        }
        let elapsed = 0;
        const chapters = sceneList.map(function (scene) {
            if (!Number.isFinite(scene.duration) || scene.duration < MIN_DURATION) {
                throw new TypeError("分镜时长必须是正数。");
            }
            const start = elapsed;
            elapsed += scene.duration;
            return Object.freeze({ start, end: elapsed, duration: scene.duration });
        });
        return Object.freeze({ chapters, duration: elapsed });
    }

    /** 章节使用左闭右开区间；总时长对应最后一幕的结束位置。 */
    function locateScene(timeline, position) {
        const time = clampTime(position, timeline.duration);
        const lastIndex = timeline.chapters.length - 1;
        let index = timeline.chapters.findIndex(function (chapter) {
            return time < chapter.end;
        });
        if (index < 0) {
            index = lastIndex;
        }
        const chapter = timeline.chapters[index];
        const localTime = time - chapter.start;
        return { index, localTime, progress: localTime / chapter.duration };
    }

    /** 字幕沿用本幕最近一个时间点的文字，最后一句持续到本幕结束。 */
    function getCue(cueList, localTime) {
        let text = "";
        for (const cue of cueList) {
            if (localTime < cue.at) {
                break;
            }
            text = cue.text;
        }
        return text;
    }

    /** 时间展示向下取整，避免尚未走到片尾时显示已结束。 */
    function formatTime(seconds) {
        const SECONDS_PER_MINUTE = 60;
        const value = Math.floor(Math.max(0, Number.isFinite(seconds) ? seconds : 0));
        const minutes = Math.floor(value / SECONDS_PER_MINUTE);
        return String(minutes).padStart(2, "0") + ":"
            + String(value % SECONDS_PER_MINUTE).padStart(2, "0");
    }

    const api = Object.freeze({ clampTime, createTimeline, locateScene, getCue, formatTime });
    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    } else {
        globalScope.ReadingTimeline = api;
    }
}(typeof window !== "undefined" ? window : globalThis));
