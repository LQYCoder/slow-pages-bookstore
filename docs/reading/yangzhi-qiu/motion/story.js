/**
 * 《羊脂球》两次进食的原创分镜解读，均非原文引句。
 * 创建者：Codex；创建日期：2026/09/28。
 * 时间以默认静音版秒数计；导入整段旁白后，各幕按同一比例匹配录音总长。
 */
window.READING_STORY = Object.freeze([
    {
        id: "departure", title: "同路的人，\n未必同行。", label: "一辆马车", duration: 9,
        art: "carriage", atmosphere: "snow", note: "战争里，一群人乘车离开鲁昂。",
        camera: { scaleFrom: 1, scaleTo: 1.07, xFrom: 0, xTo: -1, yFrom: 0, yTo: 1 },
        cues: [
            { at: 0, text: "一辆马车，载着逃离战火的人。" },
            { at: 4, text: "他们坐得很近，却并不站在一起。" }
        ]
    },
    {
        id: "sharing", title: "第一次，\n她打开了篮子。", label: "第一次进食", duration: 11,
        art: "basket", atmosphere: "warm", note: "食物传了过去，偏见暂时安静下来。",
        camera: { scaleFrom: 1.03, scaleTo: 1.12, xFrom: 0, xTo: 2, yFrom: 0, yTo: 1 },
        cues: [
            { at: 0, text: "饥饿的时候，羊脂球拿出自己的食物。" },
            { at: 5, text: "原先鄙夷她的人，接受了她的分享。" }
        ]
    },
    {
        id: "inn", title: "门外的出路，\n压在她身上。", label: "旅店里的等待", duration: 11,
        art: "door", atmosphere: "shadow", note: "施压者仍在，劝说却转向了她。",
        camera: { scaleFrom: 1, scaleTo: 1.08, xFrom: 0, xTo: -2, yFrom: 0, yTo: 0 },
        cues: [
            { at: 0, text: "军官以放行为条件，要求她与自己发生性关系。" },
            { at: 5.5, text: "同行者从愤怒，渐渐转向劝她让步。" }
        ]
    },
    {
        id: "price", title: "理由由大家说。\n代价由她承担。", label: "被挤压的拒绝", duration: 11,
        art: "door", atmosphere: "shadow", note: "当所有人都在等待，拒绝还剩多少余地？",
        camera: { scaleFrom: 1.08, scaleTo: 1.15, xFrom: -2, xTo: -4, yFrom: 0, yTo: 1 },
        cues: [
            { at: 0, text: "牺牲、责任、为了大家——说辞围住了她。" },
            { at: 5.5, text: "她在胁迫与压力下让步，众人终于能够继续赶路。" }
        ]
    },
    {
        id: "silence", title: "第二次，\n没有人递给她。", label: "第二次进食", duration: 11,
        art: "carriage", atmosphere: "cold", note: "同一辆马车，分享没有回来。",
        camera: { scaleFrom: 1.07, scaleTo: 1.16, xFrom: -1, xTo: 3, yFrom: 1, yTo: 2 },
        cues: [
            { at: 0, text: "重返马车，众人打开各自的食物。" },
            { at: 5, text: "她没有准备干粮，也没有人分给她。" }
        ]
    },
    {
        id: "afterword", title: "他们需要她，\n却容不下她。", label: "留在车里的问题", duration: 11,
        art: "basket", atmosphere: "still", note: "被需要，与被当成同伴之间，还隔着什么？",
        camera: { scaleFrom: 1.05, scaleTo: 1, xFrom: 1, xTo: 0, yFrom: 0, yTo: 0 },
        cues: [
            { at: 0, text: "食物曾经越过偏见，分食的人却没有被接纳。" },
            { at: 5, text: "即使她从未分享食物，她也一样拥有拒绝的权利。" }
        ]
    }
]);
