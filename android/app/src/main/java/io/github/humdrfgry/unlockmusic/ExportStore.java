package io.github.humdrfgry.unlockmusic;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

/** One bounded, private export at a time. No caller-controlled filesystem paths. */
public final class ExportStore {
    public static final long MAX_BYTES = 300L * 1024 * 1024;
    private final File directory;
    private FileOutputStream output;
    private File file;
    private String token;
    private String name;
    private String mime;
    private long expected;
    private long written;
    private boolean ready;

    public ExportStore(File directory) throws IOException {
        this.directory = directory;
        if (!directory.isDirectory() && !directory.mkdirs()) throw new IOException("无法创建私有缓存");
        File[] leftovers = directory.listFiles();
        if (leftovers != null) for (File item : leftovers) {
            if (item.isFile() && item.getName().startsWith("export-")) item.delete();
        }
    }

    public synchronized String begin(String requestedName, String requestedMime, long size) throws IOException {
        if (token != null) throw new IOException("请先完成或取消当前保存");
        if (size <= 0 || size > MAX_BYTES) throw new IOException("导出文件超过 300 MiB 上限或为空");
        name = safeName(requestedName);
        mime = requestedMime != null && requestedMime.matches("(?:audio/[a-zA-Z0-9.+-]+|application/(?:zip|json|octet-stream))")
            ? requestedMime : "application/octet-stream";
        File next = File.createTempFile("export-", ".tmp", directory);
        try { output = new FileOutputStream(next); }
        catch (IOException e) { next.delete(); throw e; }
        file = next;
        token = UUID.randomUUID().toString();
        expected = size;
        written = 0;
        ready = false;
        return token;
    }

    private void requireToken(String id) throws IOException {
        if (token == null || !token.equals(id)) throw new IOException("保存会话已失效");
    }

    public synchronized void append(String id, byte[] chunk) throws IOException {
        requireToken(id);
        if (ready || output == null) throw new IOException("导出已结束");
        if (chunk == null || chunk.length == 0 || chunk.length > 65536 || chunk.length > expected - written)
            throw new IOException("分块大小或文件长度无效");
        output.write(chunk);
        written += chunk.length;
    }

    public synchronized File finish(String id) throws IOException {
        requireToken(id);
        if (ready) throw new IOException("导出已提交");
        if (written != expected) throw new IOException("导出数据不完整");
        output.flush();
        output.close();
        output = null;
        ready = true;
        return file;
    }

    public synchronized String getName(String id) throws IOException { requireToken(id); return name; }
    public synchronized String getMime(String id) throws IOException { requireToken(id); return mime; }
    public synchronized void abort(String id) { if (id != null && id.equals(token)) close(); }
    public synchronized void close() {
        if (output != null) try { output.close(); } catch (IOException ignored) { }
        if (file != null) file.delete();
        output = null; file = null; token = null; ready = false;
    }

    public static String safeName(String input) {
        String result = (input == null ? "audio" : input)
            .replaceAll("[\\p{Cntrl}<>:\"/\\\\|?*\\u202a-\\u202e\\u2066-\\u2069]", "_")
            .replaceAll("[. ]+$", "").trim();
        if (result.isEmpty()) result = "audio";
        if (result.matches("(?i)^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\\..*)?$")) result = "_" + result;
        int dot = result.lastIndexOf('.');
        String ext = dot > 0 && result.length() - dot <= 8 ? result.substring(dot) : "";
        String base = ext.isEmpty() ? result : result.substring(0, dot);
        while (base.getBytes(StandardCharsets.UTF_8).length > 200)
            base = base.substring(0, base.offsetByCodePoints(base.length(), -1));
        return base + ext;
    }
}
