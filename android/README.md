# Android 离线版

原生 Activity + 系统 WebView，内置构建产生的 `../offline/index.html`，不是远端网站套壳，不维护第二套解码算法。

## 成品与验证范围

在 [Releases](https://github.com/HUMDRFGRY/unlock-music/releases) 下载 `unlock-music-offline-<版本>-debug.apk`。选择以 `offline-v` 开头的离线版预发行标签。只有 Actions 编译、lint、签名校验和附件回下载核验成功后才公开 Release。

这是 **调试签名 Demo**，没有配置生产签名证书，也没有上架应用商店。不同 runner 的签名可能变化，升级可能需要卸载重装；先保存所需文件。安装时按系统提示对当前来源授权，不要关闭系统安全防护。

最低 Android 8.0（API26）是工程配置，不是经过真机验证的兼容承诺。测试证据记录于每次发布附件；浏览器桥接模拟和 JVM 测试不能证明真实系统文件提供器兼容。

## 本地构建

需要 Python 3、Node.js、ffmpeg、JDK17、Gradle8.11.1、Android SDK Platform35 / Build Tools35.0.0。AGP 固定8.9.2，首次获取 SDK 和依赖需要联网。

```sh
python offline/tests/make_audio.py
node offline/tests/engine.test.cjs
python offline/build.py
# 设置 ANDROID_HOME，或 android/local.properties 中填写 sdk.dir。
gradle -p android --no-daemon assembleDebug lintDebug
```

产物为 `android/app/build/outputs/apk/debug/app-debug.apk`。preBuild 自动复制唯一的生成 HTML 到 assets。未附 Gradle Wrapper JAR，可使用已安装 Gradle，或运行 `gradle -p android wrapper --gradle-version 8.11.1`。

## 导入、保存与离线约束

使用系统 ACTION_OPEN_DOCUMENT 多选本地文件，ACTION_CREATE_DOCUMENT 另存为；Manifest 不申请 INTERNET、存储、媒体扫描或整盘访问权限。云盘文件提供器可能自行联网，建议选择本机文件。

loadDataWithBaseURL 的固定 HTTPS origin 仅用于已内置页面，不发起网络连接。WebView 禁止网络加载、外部导航、file URL 跨域、混合内容和第三方权限请求，CSP 禁止 connect 和 iframe，JavaScript bridge 只提供给内置页面。

导出逐块48KiB，单次最多300MiB；只允许一个保存会话，核验总字节数，临时文件位于应用私有缓存，路径由程序生成。取消/成功/下次启动清理临时导出。写入失败尝试删除新建的不完整目标文件；文件提供器拒绝删除时可能需要手工清理残留。

网页输入上限128MiB/文件、256MiB/队列、100文件；非流式处理，建议小批量。退出或系统回收进程不恢复队列，切后台暂停试听，不提供后台播放服务。

## 待真机检查

冷启动、飞行模式、NCM 多文件导入、中文长文件名、试听、单曲和 ZIP 保存/CRC、取消重试、磁盘满/权限拒绝、旋转、刘海和手势导航区域，以及多个 Android/WebView 版本。

设计依据：
- https://developer.android.com/develop/ui/views/layout/webapps/load-local-content
- https://developer.android.com/training/data-storage/shared/documents-files
- https://developer.android.com/build/releases/agp-8-9-0-release-notes

代码遵循仓库 MIT License，仅处理有权转换的文件。
