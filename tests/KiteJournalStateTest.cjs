/** 共读状态边界测试，不访问浏览器或网络。创建者：Codex；2026/09/30。 */
const test = require("node:test");
const assert = require("node:assert/strict");
const stateApi = require("../docs/reading/kite-runner/state.js");
const discovery = require("../docs/library/discovery.js");

test("KiteJournalStateTest: malformed and oversized storage recover without deleting other books", () => {
    for (const content of ["{", "x".repeat(12001), '{"version":2,"chapter":"kite"}']) {
        const values = new Map([[stateApi.STORAGE_KEY, content], ["oldBookmarks", "keep"]]);
        const store = stateApi.createStore({
            getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value)
        });
        assert.equal(store.read().chapter, "");
        assert.equal(store.write(store.read()).persisted, true);
        assert.equal(values.get("oldBookmarks"), "keep");
    }
});

test("KiteJournalStateTest: fields use allowlists, answer lengths are bounded and copies are isolated", () => {
    const store = stateApi.createStore(null);
    const result = store.write({
        version: 1, chapter: "javascript:alert(1)", night: "true", largeText: true,
        answers: { recognition: "字".repeat(501), responsibility: "<script>literal</script>", patience: 123 },
        injected: "discard"
    });
    assert.equal(result.persisted, false);
    assert.equal(result.state.chapter, "");
    assert.equal(result.state.night, false);
    assert.equal(result.state.largeText, true);
    assert.equal(result.state.answers.recognition.length, 500);
    assert.equal(result.state.answers.responsibility, "<script>literal</script>");
    assert.equal(result.state.answers.patience, "");
    assert.equal(Object.hasOwn(result.state, "injected"), false);
    result.state.answers.recognition = "changed";
    assert.equal(store.read().answers.recognition.length, 500);
});

test("KiteJournalStateTest: denied storage retains an in-memory answer and reports persistence failure", () => {
    const store = stateApi.createStore({
        getItem() { throw new Error("blocked"); },
        setItem() { throw new Error("quota"); }
    });
    const state = store.read();
    state.answers.patience = "慢一点";
    assert.equal(store.write(state).persisted, false);
    assert.equal(store.read().answers.patience, "慢一点");
});

test("BookDiscoveryTest: time, theme, language and query combine without loosening conditions", () => {
    const book = { id: "kong-yiji", title: "孔乙己", language: "zh-CN" };
    assert.equal(discovery.matches(book, { time: "10", theme: "self", language: "zh-CN", query: "鲁迅" }), true);
    assert.equal(discovery.matches(book, { time: "10", theme: "relationships" }), false);
    assert.equal(discovery.matches(book, { time: "10", language: "fr" }), false);
    assert.equal(discovery.matches(book, { time: "long" }), false);
    assert.equal(discovery.matches(book, { query: "不存在" }), false);
    assert.equal(discovery.matches(book, { time: "invalid" }), false);
    assert.equal(discovery.matches({ id: "unknown" }, {}), false);
});
