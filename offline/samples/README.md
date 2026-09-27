# 自产演示样本：Glass Garden / 玻璃花园

本目录的音频由 `offline/tests/make_audio.py` 生成，来自同一段约4.2秒的原创合成旋律，不含商业歌曲录音。生成结果不提交 Git。

原始 WAV 与 ffmpeg 编码的 MP3/FLAC/OGG/M4A/AAC 用作参考。随后 `offline/tests/engine.test.cjs` 独立编码 NCM、QMC3、KWM，其解码输出应与原始 MP3 字节完全一致，并生成网页内嵌的 `src/demo-data.json`。

NCM 元数据故意使用 example.invalid 图片地址验证不请求在线封面。不要访问该测试地址。

自产样本不等同于各音乐平台真实下载文件的完整兼容性验证。新生成的合成音频可自由使用、修改和再分发。
