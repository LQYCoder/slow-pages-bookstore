# 慢页 · 经典全文阅读与动态共读

纯 HTML、CSS、JavaScript 静态网站，包含经典全文书架、独立阅读页、莫泊桑《羊脂球》共读笔记和六幕动态阅读。
无需构建、后端、数据库或收费生成服务。

## GitHub Pages 发布

1. 将本目录内的 `docs` 文件夹和 README.md 上传至 GitHub 仓库根目录。不要只上传 ZIP。
2. 进入仓库 **Settings → Pages**。
3. **Build and deployment → Source** 选择 **Deploy from a branch**。
4. Branch 选择 **main**（或实际上传使用的分支），Folder 选择 **/docs**，点击 Save。
5. 等待 Pages 部署完成，使用该页面显示的 Visit site 地址访问。

普通项目网站地址为 `https://账号.github.io/仓库名/`。
动态阅读位于该网站的 `reading/yangzhi-qiu/motion/index.html`。
书店首页和《羊脂球》共读页均已提供入口。
GitHub Free 的 Pages 需要使用公开仓库；仓库中的源代码与素材会公开。

## 本地查看

打开 `docs/index.html`，或直接打开 `docs/reading/yangzhi-qiu/motion/index.html`。
可选本地 HTTP 预览：在本目录运行 `python3 -m http.server 8768 --directory docs`。

## 阅读入口

- [书店首页](https://lqycoder.github.io/slow-pages-bookstore/)
- [看故事](https://lqycoder.github.io/slow-pages-bookstore/reading/yangzhi-qiu/motion/index.html)
- [完整中文阅读·故乡](https://lqycoder.github.io/slow-pages-bookstore/library/hometown/index.html)
- [羊脂球·法文全文](https://lqycoder.github.io/slow-pages-bookstore/library/boule-de-suif/index.html)
- [深入共读](https://lqycoder.github.io/slow-pages-bookstore/reading/yangzhi-qiu/index.html#review)

2026/09/28 刊物版：放映与原文分别显示，切换保留分镜与阅读位置。
深度书评、图文手记和分享素材分开呈现；录音和减少动态统一收在阅读设置。

## 功能

- 六幕动态阅读：运镜、环境动画、字幕、播放暂停续播、重播、进度拖动。
- 手机左右滑动切幕、逐幕文字阅读、减少动态偏好。
- 原文自译与解读字幕切换，附 14 段法文选段与中文自译。
- 本地旁白导入：文件不上传、不持久化；刷新或离开页面后需重新导入。
- 无录音时默认静音；发布包不包含私人旁白录音。

## 文字与图像说明

莫泊桑原作选段来源：
https://www.gutenberg.org/files/10746/10746-h/10746-h.htm
中文为本站依据法文的自译（AI 辅助），非指定出版译本；书评和解读与原文分开标注。
插画为 AI 生成的文学意象，不作为史实或人物数量的证据。
原书店四本原创试读为概念作品，不提供真实销售。

## 新增经典全文

五部中文小说：《故乡》《孔乙己》《狂人日记》《阿Q正传》《药》，均为鲁迅原作。
保留来源分章及旧词、标点，来源为维基文库简体显示，各书页提供固定修订链接。
《羊脂球》提供 Project Gutenberg #10746 所收同名篇目的完整法文；不包含尚未核实的完整中文译本。

全文页支持目录、每部一枚段落书签、进度恢复、四档字号、纸白/浅绿/夜读和主动“读完”标记。
同一浏览器保存阅读记录，无登录、无跨设备同步。旧版试读与摘句仍保留。
动态选段与全文段落可双向跳转。全部正文均为静态 HTML，离线或关闭脚本也可以读。
在线界面的核对原文链接为可选外部资源，阅读本身不依赖外部服务。

## 私人访问与阅读统计

[统计看板](https://lqycoder.github.io/slow-pages-bookstore/analytics/index.html)
提供每日访客与浏览、平均停留、阅读与动态观看时长、地区、访问时间、分页明细和 CSV 导出。
2026-09-29 已部署 Cloudflare Workers + D1，本次发布开启 docs/analytics/config.js 的采集开关。
仅统计启用后成功送达的记录。默认 workers.dev 在部分网络下不可达，可能漏记；看板连接失败不代表零访问。

部署后台请参考 analytics-service/README.md。服务端保存管理 secret，公开前端只有 endpoint。
看板已自动填入公开接收地址，查看报表仍需站点所有者持有的管理密钥。
手工验收流程为 Verify analytics ingestion；验收记录核对后按随机 ID 清理，不计入正式数据。
不要把管理密钥或真实统计数据库上传到本仓库。无后端时不能仅改开关就获得访问数据。
