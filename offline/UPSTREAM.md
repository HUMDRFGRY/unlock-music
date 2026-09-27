# 上游来源与本地移植说明

来源仓库：https://github.com/HUMDRFGRY/unlock-music

读取快照：`dc518c5522bba43bd6248b58b56ecd1bb6058895`（Update README.md）。仓库 package.json 标示应用版本 v1.9.1。

主要来源：`README.md`、`package.json`、`LICENSE`，以及 `src/decrypt/ncm.ts`、`qmc.ts`、`qmcMask.ts`、`kwm.ts`、`xm.ts`、`tm.ts`。固定快照链接形式：

`https://github.com/HUMDRFGRY/unlock-music/blob/dc518c5522bba43bd6248b58b56ecd1bb6058895/<path>`

NCM 的结构、AES 密钥/元数据与音频密钥流，旧 QMC 的后缀映射、44 到 128 项掩码映射及边界处理，KWM 的文件密钥掩码，XM 偏移/字节变换和旧 TM 容器头修复均参考以上文件。

## 移植选择

本版不是原 Vue 工程的编译产物。为提供无依赖的单文件运行形式，重新实现界面、受限格式解析、AES-128 逆变换、Blob Worker、队列、本地播放与 ZIP writer。Android Activity 内置同一份生成页面。

移除了运行时远程封面查询、远程密钥查询与使用记录上报。未引入旧统计代码、服务工作线程、外部字体、在线资源或 CDN。

原始音频字节不被重新编码。未移植原库第三方 ID3/FLAC 标签重写、图像缩放及新格式实验性回退；格式缺口在界面与 README 中明确标注。

不登录音乐平台、不抓取在线歌曲、不模拟平台授权、不保证各平台最新格式兼容。仅处理有权转换的本地文件。

原解码代码 Copyright (c) 2019–2021 MengYX；本仓库及离线包保留完整 MIT License。
