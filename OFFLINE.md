# Unlock Music 离线版：网页与 Android

新版与原 Vue 工程独立，原 `src/`、`public/` 和 npm 依赖保留不变。

## 下载成品

进入 [Releases](https://github.com/HUMDRFGRY/unlock-music/releases)，选择 `offline-v0.2.0` 或后续离线版本。

| 附件 | 用途 |
|---|---|
| `unlock-music-offline-<版本>-debug.apk` | Android 调试签名预览版 |
| `unlock-music-offline-<版本>.html` | 全部资源内置的单文件网页 |
| `unlock-music-offline-<版本>-web.zip` | 网页、说明与 MIT 许可证 |
| `SHA256SUMS.txt` | 上述产物和构建记录的 SHA-256 校验和 |
| `BUILD-INFO.json` | 版本、源码提交、Actions 运行编号、实际文件哈希 |
| `TEST-EVIDENCE.zip` | 本次构建的浏览器、内核、原生暂存层、lint 和签名校验证据 |

未通过构建或校验的版本不会被公开为正式可下载的预览版本。不要把源码 ZIP 当作 APK。

网页保存到本机后打开；Android 安装后点击添加文件，在系统窗口选取本地音乐，再保存到选定的位置。均内置同一份解码页面，不访问远端网站。

Android APK 是 **debug 签名预览版，不是正式签名商店版本**。不同 runner 的签名可能变化，后续版本可能需要卸载重装；请先导出所需文件。应用不会保留处理队列。构建和模拟测试不等于真实手机兼容性验证。

## 开发与发布

- 网页源码：[`offline/`](offline/README.md)。
- Android 工程：[`android/`](android/README.md)。
- 上游来源及移植边界：[`offline/UPSTREAM.md`](offline/UPSTREAM.md)。
- 工作流：[`Offline Web + Android APK + Releases`](.github/workflows/offline-android.yml)。

PR 与开发分支运行只读测试/编译，不创建 Release。相关更改合并至 `main` 后运行同一套检查，再由独立的 `contents: write` 发布任务创建草稿、上传、回下载验证、公开预发行版。工作流也支持在 main 上手动勾选发布。

发布新版本需同步修改 `offline/VERSION`、Android `versionName` 并递增 `versionCode`。不移动已存在的标签，不覆盖另一个源码提交的公开成品。仅失败且源提交相同的草稿允许重试上传。

普通运行无需开发环境；首次构建下载 SDK、Gradle 和测试依赖需要网络。
