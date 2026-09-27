# Unlock Music 离线 Demo 0.2.0

一个独立的本地音乐处理工作台：桌面和手机网页自适应，Android APK 内置同一个页面。代码源自本仓库旧版解码逻辑的离线移植，不是原 Vue 工程的完整构建。

## 使用

从仓库 Releases 下载 HTML 或网页 ZIP，将网页完整保存到本机后用现代浏览器打开。单文件内置脚本、样式、解码器和自产演示样本，不需要首次联网缓存、Node.js 或本地服务器。

点击“体验演示样本”可处理 3 个实际编码的自产测试文件；点击“选择本地文件”或拖入音乐后，逐个解码、试听、单曲保存或批量保存 ZIP。手机版底部固定添加/保存按钮，队列以卡片显示，设置可折叠，主要触控按钮至少 44px。

Android 请下载 `-debug.apk`；通过系统文件选择器导入和另存为，不需要整盘存储或网络权限。这个版本使用调试签名，未经真实手机验收；不是应用商店正式版。不同构建的调试签名可能不同，升级可能需要先卸载，务必先导出所需文件。

## 格式范围

| 格式 | 本版行为 |
|---|---|
| NCM | 本地解码，读取外层歌名/歌手/专辑，预览文件内嵌 PNG/JPEG 封面 |
| 旧版 QMC | qmc0/qmc2/qmc3/qmcflac/qmcogg 的静态掩码路径 |
| MOO / TKM | bkcmp3/bkcflac/tkm，沿用旧 QMC 路径 |
| KWM / XM | 仓库实现的旧版算法 |
| TM0/2/3/6 | 旧版容器头修复，实际平台文件未验证 |
| MP3/FLAC/WAV/OGG/M4A/AAC | 检查后原样导出，不重新编码 |
| MFLAC/MGG/KGM/KGMA/VPR/CACHE/新版 QMC | 未集成，会报错，不调用在线密钥服务 |

同一扩展名也可能采用不同加密版本。自产样本通过不代表所有平台版本兼容。音频头与容器校验不等于完整音频帧/音质检验。保留原始编码，不会把 MP3 变成真正的无损 FLAC。

音频原有标签原样保留。NCM 外层元数据用于显示、命名和 JSON 记录，暂不重新写入音频标签，也不下载在线封面。

## 容量与数据

每个输入文件不超过 128 MiB，输入队列合计不超过 256 MiB，最多 100 个文件。解码和 ZIP 打包会额外占用内存，不是流式低内存程序；手机建议小批量处理。暂停在当前文件完成后停止，取消可停止当前文件。

不修改原文件。队列只存在当前页面内存中，刷新、关闭、退出或进程被回收后丢失，请先保存。网页版通过 Blob 下载；Android 使用每块 48 KiB 的桥接和最多 300 MiB 的应用私有临时文件，再交给系统选定的目标。成功、取消和下次启动清理临时缓存。

运行时无外部资源、CDN、统计上报、远程密钥或封面查询；CSP 设置 `connect-src 'none'`。浏览器和第三方系统文件提供器自己的后台联网行为不属于页面控制范围。

仅处理你拥有或有权转换的本地文件。

## 从源码构建

成品 HTML 和自产音频由 CI 生成，不存放在 Git 源码树。需要 Python 3、Node.js 和 ffmpeg，无 npm 依赖：

```sh
python offline/tests/make_audio.py
node offline/tests/engine.test.cjs
python offline/build.py
```

输出 `offline/index.html`。Android 的 preBuild 会复制这个页面到 APK，不维护第二套页面副本。

## 复现测试

```sh
python .github/scripts/test-release-tools.py
python -m pip install playwright==1.55.0
python -m playwright install --with-deps chromium
python offline/tests/browser_smoke.py
python offline/tests/mobile_smoke.py
mkdir -p /tmp/unlock-java-tests
javac --release 17 -encoding UTF-8 -d /tmp/unlock-java-tests android/app/src/main/java/io/github/humdrfgry/unlockmusic/ExportStore.java android/tests/ExportStoreTest.java
java -ea -cp /tmp/unlock-java-tests ExportStoreTest
```

测试包括 22 组解码内核、19 组浏览器、12 组移动布局/桥接模拟、8 组 JVM 导出暂存和 17 组发布工具检查。以具体 Actions 运行与其 `TEST-EVIDENCE.zip` 为实际结果，不把源码中的测试数量当成运行成功证明。

浏览器测试在断网的 about:blank 中载入完整 HTML；未验证 Windows 双击 file://、Safari 或 Firefox。Android JavaScript 桥接采用浏览器模拟对象，JVM 只覆盖暂存层。APK 编译、lint、签名验证由云端执行；这些都不代替系统文件选择器、保存流程和多个 WebView 版本的 Android 真机测试。待实测：飞行模式、多文件输入、中文长文件名、试听、ZIP CRC、磁盘满、取消/重试、旋转和手势导航区域。

## 源码与许可

`src/engine.js` 为解码内核，`src/app.js` 为工作台与 ZIP 导出，`src/native.js` 为可选 Android 桥接，`src/template.html` 与样式文件为界面；`build.py` 将其组合为单文件。

原解码代码 Copyright (c) 2019–2021 MengYX，MIT。许可证完整保留于 `LICENSE`，上游固定快照及移植差异见 `UPSTREAM.md`。
