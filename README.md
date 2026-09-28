# 慢页书店 · 动态文学共读

纯 HTML、CSS、JavaScript 静态网站，包含书店、莫泊桑《羊脂球》共读笔记和六幕动态阅读。
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
