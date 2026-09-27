# Unlock Music 离线工作台 · 0.2.1

## 成品

在 [Releases](https://github.com/HUMDRFGRY/unlock-music/releases) 下载：

- `unlock-music-offline-0.2.1-debug.apk`：Android 预览版。
- `unlock-music-offline-0.2.1.html`：自包含离线网页，保存后在浏览器打开。
- `unlock-music-offline-0.2.1-web.zip`：网页、说明与许可证。

仅处理拥有或有权转换的文件。详细格式范围见 [offline/README.md](offline/README.md)。原 Vue 工程保持独立，新功能在 `offline/` 和 `android/`。

## 启动错误修复

0.2.1 修复 Android 的 `data:text/html;charset=utf-8;base64,` / `ERR_HTTP_RESPONSE_CODE_FAILURE`：原版将内置页面请求误拦截为 403。修复版从 APK assets 提供固定页面，不再使用 data: 页面加载，同时保留离线访问限制。网页 UI 与处理报告版本由 `offline/VERSION` 统一在构建时写入。

## 发布门槛与证据

PR 执行解码、浏览器、手机布局、Java 暂存、发布工具、Android 编译/Lint/签名校验，以及安装 APK 后的 API 35 模拟器启动回归。合并 `main` 后重新构建，只在全部通过后发布新的 `offline-v<版本>` 标签。APK、HTML、网页 ZIP、构建信息、测试证据和 SHA-256 校验和上传草稿，回下载核验后才公开。既有标签不会被移动。

`TEST-EVIDENCE.zip` 包含 Android 启动/解码截图和真实 instrumentation 结果。`BUILD-INFO.json` 区分模拟器与实体手机验证。模拟器测试不涵盖所有系统文档提供器或用户真实音乐文件；手机安装、文件多选与保存仍请以实机结果为准。

Android 预览版使用调试签名，不是商店发行版。不同构建的调试签名可能不同；覆盖安装失败时先保存已有文件，再卸载旧版后安装。详见 [android/README.md](android/README.md)。
