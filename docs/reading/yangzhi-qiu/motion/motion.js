/**
 * 离线动态共读播放器：单一时间轴驱动画面、字幕与可选本地旁白。
 * 创建者：Codex；创建日期：2026/09/28。
 * 不请求外部服务、不持久化录音；关闭或替换时释放临时音频地址。
 */
(function () {
    "use strict";
    const STORY = window.READING_STORY;
    const ENGINE = window.ReadingTimeline;
    const EXCERPTS = window.READING_EXCERPTS;
    const TIMELINE = ENGINE.createTimeline(STORY);
    const STATUS = Object.freeze({ IDLE: "idle", PLAYING: "playing", PAUSED: "paused", ENDED: "ended" });
    const MILLISECONDS_PER_SECOND = 1000;
    const MAX_FRAME_SECONDS = 0.25;
    const MAX_AUDIO_BYTES = 40 * 1024 * 1024;
    const MIN_AUDIO_SECONDS = 10;
    const MAX_AUDIO_SECONDS = 600;
    const AUDIO_LOAD_TIMEOUT = 15000;
    const SWIPE_DISTANCE = 45;
    const SWIPE_DIRECTION_RATIO = 1.3;
    const SNOW_COUNT = 19;
    const PERCENT = 100;
    const MOBILE_READING_QUERY = "(max-width: 560px)";
    const AUDIO_EXTENSION = /\.(mp3|wav|m4a|ogg|webm|aac|flac)$/i;
    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const elements = {};
    const elementIds = [
        "stage", "sceneArt", "sceneLabel", "sceneTitle", "sceneNote", "sceneCounter", "subtitle", "snow",
        "startButton", "playButton", "previousButton", "nextButton", "replayButton", "seekBar",
        "currentTime", "totalTime", "chapterRail", "playbackStatus", "reduceMotion", "ending",
        "transcript", "transcriptBody", "readMode", "audioSettings", "audioDialog", "audioFile",
        "audioStatus", "voiceEnabled", "removeAudio", "imageFallback", "originalMode", "interpretationMode",
        "modeDescription", "subtitleLabel", "sourceTitle", "sourceContext", "sourceParagraphs",
        "sourceFrench", "frenchOriginal", "pauseForText", "scriptDownload",
        "cinemaViewButton", "textViewButton", "cinemaPanel", "textPanel"
    ];
    for (const elementId of elementIds) {
        elements[elementId] = document.getElementById(elementId);
    }
    const state = {
        status: STATUS.IDLE, position: 0, sceneIndex: -1, cue: "", frameId: null, lastFrame: 0,
        reduced: motionPreference.matches, muted: true, audio: null, audioUrl: "", durationScale: 1,
        loadVersion: 0, pendingAudio: null, pendingUrl: "", pendingTimer: null, touchStart: null,
        clockLabel: "", customMotion: false, contentMode: "original"
    };
    const chapterButtons = [];
    const progressBars = [];

    /** 逐幕文字与按钮通过文本节点建立；不把录音文件名或文案作为 HTML 注入。 */
    function buildChapters() {
        STORY.forEach(function (scene, index) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "chapter-button";
            button.setAttribute("aria-label", "第 " + (index + 1) + " 幕：" + scene.label);
            const preview = document.createElement("div");
            preview.className = "chapter-preview";
            const image = document.createElement("img");
            image.src = "../assets/" + scene.art + ".png";
            image.alt = "";
            const number = document.createElement("span");
            number.className = "chapter-number";
            number.textContent = String(index + 1).padStart(2, "0");
            preview.append(image, number);
            const label = document.createElement("span");
            label.className = "chapter-text";
            label.textContent = scene.label;
            const progress = document.createElement("span");
            progress.className = "chapter-progress";
            button.append(preview, label, progress);
            button.addEventListener("click", function () { selectChapter(index); });
            elements.chapterRail.append(button);
            chapterButtons.push(button);
            progressBars.push(progress);
            const chapter = document.createElement("article");
            chapter.className = "transcript-chapter";
            const heading = document.createElement("h3");
            heading.textContent = String(index + 1).padStart(2, "0") + " / " + scene.label;
            chapter.append(heading);
            appendTranscriptSource(chapter, EXCERPTS[scene.id]);
            const interpretationLabel = document.createElement("p");
            interpretationLabel.className = "translation-note";
            interpretationLabel.textContent = "慢页解读 / 非原文引句";
            chapter.append(interpretationLabel);
            for (const cue of scene.cues) {
                const paragraph = document.createElement("p");
                paragraph.textContent = cue.text;
                chapter.append(paragraph);
            }
            const revisit = document.createElement("button");
            revisit.type = "button";
            revisit.textContent = "回到这一幕 ↑";
            revisit.addEventListener("click", function () {
                setReadingView("cinema");
                selectChapter(index);
                elements.stage.scrollIntoView({ behavior: "auto", block: "center" });
                elements.playButton.focus({ preventScroll: true });
            });
            chapter.append(revisit);
            elements.transcriptBody.append(chapter);
        });
    }

    /** 使用安全文本节点展示原文；选段之间标注省略，避免造成连续全文的误解。 */
    function appendSourceParagraphs(container, excerpt, field) {
        excerpt.paragraphs.forEach(function (paragraph, index) {
            if (index > 0 && paragraph.omissionBefore) {
                const omission = document.createElement("p");
                omission.className = "excerpt-omission";
                omission.textContent = "〔中间略〕";
                container.append(omission);
            }
            const text = document.createElement("p");
            text.textContent = paragraph[field];
            container.append(text);
        });
    }

    /** 逐幕展开稿也包含原文，离线阅读时不依赖跳转外部网站。 */
    function appendTranscriptSource(chapter, excerpt) {
        const label = document.createElement("p");
        label.className = "translation-note";
        label.textContent = "原文节选 / 本站中文自译（AI 辅助）";
        chapter.append(label);
        appendSourceParagraphs(chapter, excerpt, "chinese");
        const details = document.createElement("details");
        details.className = "french-original";
        const summary = document.createElement("summary");
        summary.textContent = "对照法文原文 ＋";
        const french = document.createElement("div");
        french.lang = "fr";
        appendSourceParagraphs(french, excerpt, "french");
        details.append(summary, french);
        chapter.append(details);
    }

    /** 当前分镜的较长选段与画面同步；查看法文时由交互事件暂停。 */
    function updateSource(scene) {
        const excerpt = EXCERPTS[scene.id];
        elements.sourceTitle.textContent = excerpt.location;
        elements.sourceContext.hidden = !excerpt.context;
        elements.sourceContext.textContent = excerpt.context || "";
        elements.sourceParagraphs.replaceChildren();
        elements.sourceFrench.replaceChildren();
        appendSourceParagraphs(elements.sourceParagraphs, excerpt, "chinese");
        appendSourceParagraphs(elements.sourceFrench, excerpt, "french");
    }

    /** 切换文本只改变字幕来源，不改变时间轴；已有录音先静音，避免朗读与字幕错配。 */
    function setContentMode(mode) {
        if (mode === state.contentMode) {
            return;
        }
        pause("已切换字幕并暂停。确认阅读内容后，点击播放继续。");
        state.contentMode = mode;
        const original = mode === "original";
        elements.originalMode.setAttribute("aria-pressed", String(original));
        elements.interpretationMode.setAttribute("aria-pressed", String(!original));
        elements.subtitleLabel.textContent = original ? "原文节选 / 自译" : "旁白 / 解读";
        elements.modeDescription.textContent = original
            ? "法文公版原作节选 · 中文为本站自译" : "慢页原创解读 · 非小说原文引句";
        elements.scriptDownload.href = original ? "narration-original.txt" : "narration.txt";
        elements.scriptDownload.textContent = original ? "下载原文自译录音脚本 ↓" : "下载解读录音脚本 ↓";
        if (state.audio) {
            state.muted = true;
            elements.voiceEnabled.checked = false;
            elements.audioStatus.textContent = "字幕模式已改变，原录音保留但已关闭。确认内容匹配后可重新开启。";
        }
        updateControls();
    }

    /** 固定分布避免随机闪烁；雪只在相关分镜播放时运动。 */
    function buildSnow() {
        const DISTRIBUTION_STEP = 37;
        const DELAY_STEP = 0.61;
        for (let index = 0; index < SNOW_COUNT; index += 1) {
            const flake = document.createElement("span");
            flake.style.left = String((index * DISTRIBUTION_STEP) % PERCENT) + "%";
            flake.style.animationDelay = String(-index * DELAY_STEP) + "s";
            elements.snow.append(flake);
        }
    }

    /** 时间轴连续运镜；暂停时不再改变 transform，避免画面仍在暗中播放。 */
    function updateCamera(scene, progress) {
        const camera = scene.camera;
        const amount = state.reduced ? 0 : progress;
        const scale = camera.scaleFrom + (camera.scaleTo - camera.scaleFrom) * amount;
        const x = camera.xFrom + (camera.xTo - camera.xFrom) * amount;
        const y = camera.yFrom + (camera.yTo - camera.yFrom) * amount;
        elements.stage.style.setProperty("--camera-scale", state.reduced ? "1" : String(scale));
        elements.stage.style.setProperty("--camera-x", state.reduced ? "0%" : String(x) + "%");
        elements.stage.style.setProperty("--camera-y", state.reduced ? "0%" : String(y) + "%");
    }

    /** 只在分镜或字幕确实变化时更新文字，避免读屏器每帧收到相同内容。 */
    function render() {
        const location = ENGINE.locateScene(TIMELINE, state.position);
        const scene = STORY[location.index];
        if (state.sceneIndex !== location.index) {
            state.sceneIndex = location.index;
            updateSource(scene);
            elements.sceneArt.src = "../assets/" + scene.art + ".png";
            elements.stage.dataset.atmosphere = scene.atmosphere;
            elements.sceneTitle.textContent = scene.title;
            elements.sceneLabel.textContent = String(location.index + 1).padStart(2, "0")
                + " / " + scene.label + " · 镜头解读";
            elements.sceneNote.textContent = scene.note;
            elements.sceneCounter.textContent = "SCENE " + String(location.index + 1).padStart(2, "0") + " / 06";
            chapterButtons.forEach(function (button, index) {
                if (index === location.index) {
                    button.setAttribute("aria-current", "step");
                } else {
                    button.removeAttribute("aria-current");
                }
            });
        }
        const cueList = state.contentMode === "original" ? EXCERPTS[scene.id].cues : scene.cues;
        const cue = ENGINE.getCue(cueList, location.localTime);
        if (cue !== state.cue) {
            state.cue = cue;
            elements.subtitle.textContent = cue;
        }
        updateCamera(scene, location.progress);
        elements.seekBar.value = String(state.position);
        const total = TIMELINE.duration * state.durationScale;
        const label = ENGINE.formatTime(state.position * state.durationScale) + " / " + ENGINE.formatTime(total);
        if (label !== state.clockLabel) {
            state.clockLabel = label;
            elements.currentTime.textContent = ENGINE.formatTime(state.position * state.durationScale);
            elements.totalTime.textContent = ENGINE.formatTime(total);
            elements.seekBar.setAttribute("aria-valuetext", label);
        }
        progressBars.forEach(function (bar, index) {
            const chapter = TIMELINE.chapters[index];
            bar.style.width = String(ENGINE.clampTime(state.position - chapter.start, chapter.duration)
                / chapter.duration * PERCENT) + "%";
        });
        elements.previousButton.disabled = location.index === 0;
        elements.nextButton.disabled = location.index === STORY.length - 1;
        elements.startButton.hidden = state.status !== STATUS.IDLE;
        elements.ending.hidden = state.status !== STATUS.ENDED;
    }

    /** 集中维护播放状态与可见控件；环境动画与实际时间轴始终一致。 */
    function updateControls() {
        const playing = state.status === STATUS.PLAYING;
        document.body.dataset.playing = String(playing);
        document.body.dataset.status = state.status;
        elements.playButton.textContent = playing ? "Ⅱ 暂停" : state.status === STATUS.ENDED ? "↺ 重播" : "▶ 播放";
        elements.playButton.setAttribute("aria-label", playing ? "暂停播放" : "开始自动播放");
        elements.audioSettings.textContent = state.audio && !state.muted ? "设置 · 旁白 ⌁" : "设置 · 静音 ⌁";
        render();
    }

    /** 暂停会释放唯一动画帧任务，也停止旁白，保留精确阅读位置。 */
    function pause(message) {
        if (state.frameId !== null) {
            cancelAnimationFrame(state.frameId);
            state.frameId = null;
        }
        if (state.audio) {
            state.audio.pause();
        }
        if (state.status !== STATUS.ENDED) {
            state.status = STATUS.PAUSED;
        }
        if (message) {
            elements.playbackStatus.textContent = message;
        }
        updateControls();
    }

    /** 同步本地旁白；浏览器拒绝有声播放时明确退回静音，不影响文字阅读。 */
    function syncAudio() {
        if (!state.audio) {
            return;
        }
        state.audio.currentTime = state.position * state.durationScale;
        if (state.status !== STATUS.PLAYING || state.muted) {
            state.audio.pause();
            return;
        }
        const activeAudio = state.audio;
        activeAudio.play().catch(function () {
            if (state.audio !== activeAudio || state.status !== STATUS.PLAYING) {
                return;
            }
            state.muted = true;
            elements.voiceEnabled.checked = false;
            elements.playbackStatus.textContent = "浏览器未能播放录音，已继续静音阅读。可在旁白设置中重新开启。";
            updateControls();
        });
    }

    /** 片尾停留在最后一句，不循环覆盖读者的思考时间。 */
    function finish() {
        state.position = TIMELINE.duration;
        state.status = STATUS.ENDED;
        pause("这一场读完了。可以重播，也可以继续完整书评。");
    }

    /** 有旁白时以音频时钟为准；静音时使用前台经过时间，不补播后台停留。 */
    function tick(timestamp) {
        if (state.status !== STATUS.PLAYING) {
            return;
        }
        const elapsed = Math.min((timestamp - state.lastFrame) / MILLISECONDS_PER_SECOND, MAX_FRAME_SECONDS);
        state.lastFrame = timestamp;
        if (state.audio && !state.muted) {
            state.position = state.audio.currentTime / state.durationScale;
        } else {
            state.position += elapsed / state.durationScale;
        }
        if (state.position >= TIMELINE.duration) {
            finish();
            return;
        }
        render();
        state.frameId = requestAnimationFrame(tick);
    }

    /** 播放从用户点击启动；片尾再次播放自动回到起点。 */
    function play() {
        if (state.status === STATUS.PLAYING || elements.audioDialog.open
            || document.body.dataset.view !== "cinema") {
            return;
        }
        if (state.position >= TIMELINE.duration) {
            state.position = 0;
        }
        state.status = STATUS.PLAYING;
        state.lastFrame = performance.now();
        elements.playbackStatus.textContent = "正在自动播放 · 随时暂停，或左右滑动切换分镜。";
        syncAudio();
        updateControls();
        state.frameId = requestAnimationFrame(tick);
    }

    /** 手动选择分镜或拖动时间条后暂停，避免自动计时打断阅读。 */
    function seek(position) {
        pause();
        state.position = ENGINE.clampTime(position, TIMELINE.duration);
        state.status = state.position >= TIMELINE.duration ? STATUS.ENDED : STATUS.PAUSED;
        syncAudio();
        elements.playbackStatus.textContent = "已停在这里。慢慢读，点击播放继续。";
        updateControls();
    }

    function selectChapter(index) {
        const boundedIndex = Math.min(STORY.length - 1, Math.max(0, index));
        seek(TIMELINE.chapters[boundedIndex].start);
    }

    /** 释放尚未解码的录音及超时任务；快速连续选择文件时只有最后一次生效。 */
    function clearPendingAudio() {
        if (state.pendingTimer !== null) {
            clearTimeout(state.pendingTimer);
            state.pendingTimer = null;
        }
        if (state.pendingAudio) {
            state.pendingAudio.onloadedmetadata = null;
            state.pendingAudio.onerror = null;
            state.pendingAudio.removeAttribute("src");
            state.pendingAudio.load();
            state.pendingAudio = null;
        }
        if (state.pendingUrl) {
            URL.revokeObjectURL(state.pendingUrl);
            state.pendingUrl = "";
        }
    }

    /** 清理已启用的录音对象，避免 Blob URL 和媒体解码器长期占用内存。 */
    function releaseAudio() {
        if (state.audio) {
            state.audio.onended = null;
            state.audio.onerror = null;
            state.audio.pause();
            state.audio.removeAttribute("src");
            state.audio.load();
            state.audio = null;
        }
        if (state.audioUrl) {
            URL.revokeObjectURL(state.audioUrl);
            state.audioUrl = "";
        }
    }

    function removeAudio() {
        pause();
        state.loadVersion += 1;
        clearPendingAudio();
        releaseAudio();
        state.durationScale = 1;
        state.muted = true;
        elements.audioFile.value = "";
        elements.voiceEnabled.checked = false;
        elements.voiceEnabled.disabled = true;
        elements.removeAudio.disabled = true;
        elements.audioStatus.textContent = "录音已移除，恢复默认静音时间轴。";
        updateControls();
    }

    /** 校验文件尺寸、格式与解码后时长；失败时保留原来可用的录音。 */
    function importAudio(file) {
        if (!file) {
            return;
        }
        state.loadVersion += 1;
        clearPendingAudio();
        if (file.size === 0 || file.size > MAX_AUDIO_BYTES || !AUDIO_EXTENSION.test(file.name)) {
            elements.audioStatus.textContent = "请选择不超过 40 MB 的有效音频文件。";
            elements.audioFile.value = "";
            return;
        }
        const version = state.loadVersion;
        const pending = new Audio();
        state.pendingAudio = pending;
        state.pendingUrl = URL.createObjectURL(file);
        elements.audioStatus.textContent = "正在读取本地录音…";
        function failLoad(message) {
            if (version !== state.loadVersion) {
                return;
            }
            clearPendingAudio();
            elements.audioFile.value = "";
            elements.audioStatus.textContent = message;
        }
        pending.preload = "metadata";
        pending.onloadedmetadata = function () {
            if (version !== state.loadVersion) {
                return;
            }
            if (!Number.isFinite(pending.duration) || pending.duration < MIN_AUDIO_SECONDS
                || pending.duration > MAX_AUDIO_SECONDS) {
                failLoad("录音时长需在 10 秒至 10 分钟之间，请按脚本录制完整一段。");
                return;
            }
            pause();
            releaseAudio();
            clearTimeout(state.pendingTimer);
            state.pendingTimer = null;
            state.audio = pending;
            state.audioUrl = state.pendingUrl;
            state.pendingAudio = null;
            state.pendingUrl = "";
            pending.onloadedmetadata = null;
            pending.onerror = function () {
                removeAudio();
                elements.audioStatus.textContent = "录音播放失败，已恢复静音。请重新导入可播放的文件。";
                elements.playbackStatus.textContent = "录音播放失败，已暂停。可以继续静音阅读。";
            };
            pending.onended = function () {
                if (state.status === STATUS.PLAYING && !state.muted) {
                    finish();
                }
            };
            state.durationScale = pending.duration / TIMELINE.duration;
            state.muted = false;
            elements.voiceEnabled.disabled = false;
            elements.voiceEnabled.checked = true;
            elements.removeAudio.disabled = false;
            elements.audioStatus.textContent = file.name + " · " + ENGINE.formatTime(pending.duration)
                + "。已匹配六幕总时长，关闭设置后点击播放。";
            updateControls();
        };
        pending.onerror = function () {
            failLoad("浏览器无法解码这段录音，请尝试 MP3 或 WAV 文件。原有录音不会被替换。");
        };
        state.pendingTimer = setTimeout(function () {
            failLoad("读取录音超时，请尝试较小的 MP3 或 WAV 文件。");
        }, AUDIO_LOAD_TIMEOUT);
        pending.src = state.pendingUrl;
    }

    /** 尊重系统减少动态偏好；用户主动修改后优先采用当前页面的选择。 */
    function setReducedMotion(reduced) {
        state.reduced = reduced;
        document.body.dataset.reduced = String(reduced);
        elements.reduceMotion.checked = reduced;
        render();
    }

    /**
     * 切换放映与原文视图，保留分镜位置并暂停隐藏的播放器。
     * @param {string} view 仅接受 text 或 cinema；其他值回到放映。
     * @param {boolean} updateHash 是否更新可分享的视图锚点。
     * @returns {void} 不修改阅读存档，不创建额外计时器。
     */
    function setReadingView(view, updateHash = true) {
        const textView = view === "text";
        const previousPanel = textView ? elements.cinemaPanel : elements.textPanel;
        const focusWasInside = previousPanel.contains(document.activeElement);
        if (textView) {
            pause("已暂停在这一幕，读完原文后可回到画面继续。");
        }
        document.body.dataset.view = textView ? "text" : "cinema";
        elements.cinemaPanel.hidden = textView;
        elements.textPanel.hidden = !textView;
        elements.cinemaViewButton.setAttribute("aria-pressed", String(!textView));
        elements.textViewButton.setAttribute("aria-pressed", String(textView));
        if (focusWasInside) {
            const activeButton = textView ? elements.textViewButton : elements.cinemaViewButton;
            activeButton.focus({ preventScroll: true });
        }
        if (updateHash) {
            window.location.hash = textView ? "text" : "cinema";
        }
    }

    /** 阅读入口支持直达链接和浏览器前进后退；设置与内容视图相互独立。 */
    function bindReadingViews() {
        elements.cinemaViewButton.addEventListener("click", function () { setReadingView("cinema"); });
        elements.textViewButton.addEventListener("click", function () { setReadingView("text"); });
        window.addEventListener("hashchange", function () {
            setReadingView(window.location.hash === "#text" ? "text" : "cinema", false);
        });
        setReadingView(window.location.hash === "#text" ? "text" : "cinema", false);
    }

    /** 统一绑定播放与字幕操作，所有离开放映的动作都会暂停实际时间轴。 */
    function bindPlayback() {
        elements.originalMode.addEventListener("click", function () { setContentMode("original"); });
        elements.interpretationMode.addEventListener("click", function () { setContentMode("interpretation"); });
        elements.pauseForText.addEventListener("click", function () {
            setReadingView("cinema");
        });
        elements.frenchOriginal.addEventListener("toggle", function () {
            if (elements.frenchOriginal.open && state.status === STATUS.PLAYING) {
                pause("已展开法文对照，画面暂停。读完后可点击播放继续。");
            }
        });
        elements.startButton.addEventListener("click", function () {
            play();
            // 开始按钮播放后隐藏，将键盘焦点交给暂停按钮；手机同时定位画面与字幕区域。
            elements.playButton.focus({ preventScroll: true });
            if (window.matchMedia(MOBILE_READING_QUERY).matches) {
                elements.stage.scrollIntoView({ behavior: "auto", block: "start" });
            }
        });
        elements.playButton.addEventListener("click", function () {
            if (state.status === STATUS.PLAYING) {
                pause("已暂停。故事会在这里等你。");
            } else {
                play();
            }
        });
        elements.replayButton.addEventListener("click", function () { seek(0); play(); });
        elements.previousButton.addEventListener("click", function () { selectChapter(state.sceneIndex - 1); });
        elements.nextButton.addEventListener("click", function () { selectChapter(state.sceneIndex + 1); });
        elements.seekBar.addEventListener("input", function () { seek(Number(elements.seekBar.value)); });
        elements.reduceMotion.addEventListener("change", function () {
            state.customMotion = true;
            setReducedMotion(elements.reduceMotion.checked);
        });
        motionPreference.addEventListener("change", function (event) {
            if (!state.customMotion) {
                setReducedMotion(event.matches);
            }
        });
        elements.readMode.addEventListener("click", function () {
            setReadingView("text");
        });
        elements.transcript.addEventListener("toggle", function () {
            if (elements.transcript.open && state.status === STATUS.PLAYING) {
                pause("已暂停画面，可以慢慢读逐幕文字。");
            }
        });
    }

    /** 横向触摸才切幕；纵向手势留给浏览器滚动，按钮点击不触发切换。 */
    function bindNavigation() {
        elements.stage.addEventListener("pointerdown", function (event) {
            if (event.pointerType !== "touch" || event.target.closest("button, a")) {
                return;
            }
            state.touchStart = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
            elements.stage.setPointerCapture(event.pointerId);
        });
        elements.stage.addEventListener("pointerup", function (event) {
            if (!state.touchStart || event.pointerId !== state.touchStart.pointerId) {
                return;
            }
            const horizontal = event.clientX - state.touchStart.x;
            const vertical = event.clientY - state.touchStart.y;
            state.touchStart = null;
            if (Math.abs(horizontal) > SWIPE_DISTANCE
                && Math.abs(horizontal) > Math.abs(vertical) * SWIPE_DIRECTION_RATIO) {
                selectChapter(state.sceneIndex + (horizontal < 0 ? 1 : -1));
            }
        });
        elements.stage.addEventListener("pointercancel", function () { state.touchStart = null; });
        document.addEventListener("keydown", function (event) {
            if (elements.audioDialog.open || event.target.closest("input, textarea, select, button, a, summary")
                || event.altKey || event.ctrlKey || event.metaKey || event.repeat) {
                return;
            }
            if (event.code === "Space") {
                event.preventDefault();
                if (state.status === STATUS.PLAYING) {
                    pause("已暂停。故事会在这里等你。");
                } else {
                    play();
                }
            } else if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                event.preventDefault();
                selectChapter(state.sceneIndex + (event.key === "ArrowRight" ? 1 : -1));
            }
        });
    }

    function bindAudio() {
        elements.audioSettings.addEventListener("click", function () {
            pause("已暂停。旁白设置关闭后，点击播放继续。");
            elements.audioDialog.showModal();
        });
        elements.audioFile.addEventListener("change", function () { importAudio(elements.audioFile.files[0]); });
        elements.voiceEnabled.addEventListener("change", function () {
            state.muted = !elements.voiceEnabled.checked;
            syncAudio();
            updateControls();
        });
        elements.removeAudio.addEventListener("click", removeAudio);
    }

    buildChapters();
    buildSnow();
    bindPlayback();
    bindNavigation();
    bindAudio();
    setReducedMotion(motionPreference.matches);
    updateControls();
    bindReadingViews();
    elements.sceneArt.addEventListener("error", function () { elements.imageFallback.hidden = false; });
    elements.sceneArt.addEventListener("load", function () { elements.imageFallback.hidden = true; });
    document.addEventListener("visibilitychange", function () {
        if (document.hidden && state.status === STATUS.PLAYING) {
            pause("离开页面时已自动暂停。点击播放继续。");
        }
    });
    window.addEventListener("pagehide", function () {
        pause();
        state.loadVersion += 1;
        clearPendingAudio();
        releaseAudio();
        state.durationScale = 1;
        state.muted = true;
        elements.voiceEnabled.checked = false;
        elements.voiceEnabled.disabled = true;
        elements.removeAudio.disabled = true;
        elements.audioFile.value = "";
        elements.audioStatus.textContent = "离开页面后录音已释放；如需旁白，请重新选择本地文件。";
    });
    window.addEventListener("pageshow", updateControls);
}());
