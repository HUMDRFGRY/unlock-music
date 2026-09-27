# Android 离线版

下载成品请进入仓库 [Releases](https://github.com/HUMDRFGRY/unlock-music/releases)，选择 `offline-v0.2.1` 的 `unlock-music-offline-0.2.1-debug.apk`。源码本身不是 APK。预览版未采用稳定正式签名；覆盖安装若提示签名冲突，请先保存已有导出文件，再卸载旧预览版后安装。

## 0.2.1 启动修复

0.2.0 的 `shouldInterceptRequest` 无条件返回 403，与 `loadDataWithBaseURL` 内部使用的 data: 请求冲突，可能显示 `data:text/html;charset=utf-8;base64,` / `net::ERR_HTTP_RESPONSE_CODE_FAILURE`。这属于程序启动问题，不是音乐文件、网络或用户权限问题。

0.2.1 改用一个固定 HTTPS 形式的本地地址，由 `OfflinePageClient` 在拦截回调内直接提供 APK 中 `index.html` 的 200 响应；不建立网络连接，不需要服务器。仅允许精确页面路径和页内锚点，其他路径、主机、查询参数、任意 data: 主文档仍被拒绝。内嵌 data 图片/音频交回 WebView 处理，blob 音频/Worker 继续由 WebView 处理。没有开启 INTERNET、file:// 跨域、明文流量或混合内容权限。

## 构建与运行测试

在已配备 Python 3、Node.js、ffmpeg、JDK 17、Android SDK 35、Gradle 8.11.1 的开发环境，从仓库根目录运行：

```sh
python offline/tests/make_audio.py
node offline/tests/engine.test.cjs
python offline/build.py
gradle -p android assembleDebug assembleDebugAndroidTest lintDebug
```

APK 在 `android/app/build/outputs/apk/debug/app-debug.apk`。测试依赖仅进入独立的 instrumentation 测试 APK，不进入发布 APK。运行 Android API 35 模拟器后执行：

```sh
bash .github/scripts/run-android-tests.sh
```

CI 在 GitHub Actions 的硬件加速模拟器中安装这两个 APK，执行 AndroidJUnitRunner。覆盖冷启动、重新加载、真实 WebView 中自产演示样本解码、data 图片、Blob Worker、真实 JavaScript→Java 分块暂存和取消，以及页面/导航白名单。测试时关闭模拟器 Wi-Fi 与移动数据，目标 APK 不声明网络权限。

打包要求全部六项测试通过、运行记录与当前 APK SHA-256 一致，并附启动截图、解码截图、系统及 WebView 版本；缺项/失败/跳过阻止发布。结果以该版本关联 Actions 和 `TEST-EVIDENCE.zip` 为准，不把源码中的测试声明当成通过记录。

## 仍需实体手机验收的部分

模拟器回归不代表已验证所有厂商系统。系统文件多选、云端/本地文档提供器、另存为、取消/磁盘满、手势导航和不同系统 WebView 版本仍需真机测试。Android 8.0 是 minSdk 配置下限，不是对旧 WebView 的兼容承诺。

文件通过系统文档选择器导入和保存，不申请整盘存储权限。导出最多 300 MiB、每块 48 KiB，只允许一个保存会话，校验输出长度；缓存位于应用私有目录，保存/取消或下次启动时清理。原音乐文件不被覆盖。
