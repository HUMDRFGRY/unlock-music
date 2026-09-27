package io.github.humdrfgry.unlockmusic;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.DocumentsContract;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.FrameLayout;
import android.view.WindowInsets;
import org.json.JSONObject;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Offline-only shell: one bundled document, system document pickers, bounded exports. */
public final class MainActivity extends Activity {
    private static final int OPEN = 100, SAVE = 101;
    private WebView web;
    private ExportStore store;
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private ValueCallback<Uri[]> fileCallback;
    private volatile String savingToken;
    private volatile File savingFile;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        try { store = new ExportStore(new File(getCacheDir(), "offline-exports")); }
        catch (Exception e) { fatal("无法初始化本地缓存：" + e.getMessage()); return; }
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(24, 32, 21));
        web = new WebView(this);
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets safe = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                v.setPadding(safe.left, safe.top, safe.right, safe.bottom);
            } else {
                v.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                    insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            }
            return insets;
        });
        root.requestApplyInsets();
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true); // Only documents selected by the system picker.
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setBlockNetworkLoads(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        WebView.setWebContentsDebuggingEnabled(false);
        web.setBackgroundColor(Color.rgb(24, 32, 21));
        web.addJavascriptInterface(new Bridge(), "OfflineNative");
        web.setWebViewClient(new OfflinePageClient(getAssets(), this::fatal));
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onPermissionRequest(PermissionRequest request) { request.deny(); }
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("*/*"); // Encrypted music frequently has no audio MIME type.
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                intent.putExtra(Intent.EXTRA_LOCAL_ONLY, true);
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                try { startActivityForResult(intent, OPEN); }
                catch (Exception e) { fileCallback.onReceiveValue(null); fileCallback = null; }
                return true;
            }
        });
        // Load one exact URL that OfflinePageClient serves from APK assets. No data:
        // navigation, remote server, INTERNET permission, or file:// access is needed.
        web.loadUrl(OfflinePageClient.PAGE_URL);
    }

    private final class Bridge {
        @JavascriptInterface public String beginExport(String name, String mime, long size) {
            try { return store.begin(name, mime, size); }
            catch (Exception e) { return "ERROR:" + e.getMessage(); }
        }
        @JavascriptInterface public String appendExport(String token, String base64) {
            try {
                if (base64 == null || base64.length() > 90000) throw new Exception("分块超过上限");
                store.append(token, Base64.decode(base64, Base64.NO_WRAP));
                return "OK";
            } catch (Exception e) { return "ERROR:" + e.getMessage(); }
        }
        @JavascriptInterface public String finishExport(String token) {
            try {
                File file = store.finish(token);
                String name = store.getName(token), mime = store.getMime(token);
                savingToken = token;
                savingFile = file;
                runOnUiThread(() -> {
                    try {
                        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                        intent.addCategory(Intent.CATEGORY_OPENABLE);
                        intent.setType(mime);
                        intent.putExtra(Intent.EXTRA_TITLE, name);
                        intent.putExtra(Intent.EXTRA_LOCAL_ONLY, true);
                        startActivityForResult(intent, SAVE);
                    } catch (Exception e) { completeSave(token, false, false, e.getMessage()); }
                });
                return "OK";
            } catch (Exception e) { return "ERROR:" + e.getMessage(); }
        }
        @JavascriptInterface public void cancelExport(String token) {
            if (token != null && !token.equals(savingToken)) store.abort(token);
        }
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == OPEN && fileCallback != null) {
            ArrayList<Uri> selected = new ArrayList<>();
            if (result == RESULT_OK && data != null) {
                if (data.getClipData() != null) {
                    for (int i = 0; i < Math.min(100, data.getClipData().getItemCount()); i++) {
                        Uri uri = data.getClipData().getItemAt(i).getUri();
                        if (uri != null && "content".equals(uri.getScheme())) selected.add(uri);
                    }
                } else if (data.getData() != null && "content".equals(data.getData().getScheme())) selected.add(data.getData());
            }
            fileCallback.onReceiveValue(selected.isEmpty() ? null : selected.toArray(new Uri[0]));
            fileCallback = null;
        } else if (request == SAVE && savingToken != null) {
            String token = savingToken; File source = savingFile;
            if (result != RESULT_OK || data == null || data.getData() == null) {
                completeSave(token, false, true, "已取消保存"); return;
            }
            Uri destination = data.getData();
            if (!"content".equals(destination.getScheme())) {
                completeSave(token, false, false, "无效的保存位置"); return;
            }
            io.execute(() -> {
                try (InputStream input = new FileInputStream(source);
                     OutputStream output = getContentResolver().openOutputStream(destination, "w")) {
                    if (output == null) throw new Exception("无法打开目标文件");
                    byte[] buffer = new byte[65536]; int n;
                    while ((n = input.read(buffer)) != -1) {
                        if (Thread.currentThread().isInterrupted()) throw new Exception("保存被中断");
                        output.write(buffer, 0, n);
                    }
                    output.flush();
                } catch (Exception e) {
                    // ACTION_CREATE_DOCUMENT created a new file, never an existing user file.
                    try { DocumentsContract.deleteDocument(getContentResolver(), destination); } catch (Exception ignored) { }
                    runOnUiThread(() -> completeSave(token, false, false, e.getMessage()));
                    return;
                }
                runOnUiThread(() -> completeSave(token, true, false, "已保存"));
            });
        }
    }

    private void completeSave(String token, boolean ok, boolean cancelled, String message) {
        store.abort(token);
        savingToken = null; savingFile = null;
        if (web != null && !isDestroyed()) web.evaluateJavascript(
            "window.onNativeSaveComplete&&window.onNativeSaveComplete(" + JSONObject.quote(token) + "," + ok + "," + cancelled + "," + JSONObject.quote(message == null ? "" : message) + ")", null);
    }
    @Override public void onBackPressed() {
        if (web == null) { finish(); return; }
        web.evaluateJavascript("window.OfflineUI?window.OfflineUI.back():'exit'", value -> {
            if ("\"handled\"".equals(value)) return;
            if ("\"confirm\"".equals(value) || savingToken != null) {
                new AlertDialog.Builder(this).setTitle("退出离线工作台？")
                    .setMessage("处理队列不会保留。请先保存需要的结果。")
                    .setNegativeButton("继续使用", null).setPositiveButton("退出", (dialog, which) -> finish()).show();
            } else finish();
        });
    }
    @Override protected void onPause() {
        if (web != null) { web.evaluateJavascript("window.OfflineUI&&window.OfflineUI.pause()", null); web.onPause(); }
        super.onPause();
    }
    @Override protected void onResume() { super.onResume(); if (web != null) web.onResume(); }
    @Override protected void onDestroy() {
        if (fileCallback != null) fileCallback.onReceiveValue(null);
        io.shutdownNow();
        if (store != null) store.close();
        if (web != null) { web.removeJavascriptInterface("OfflineNative"); web.destroy(); web = null; }
        super.onDestroy();
    }
    private void fatal(String message) {
        new AlertDialog.Builder(this).setTitle("Unlock Music 离线")
            .setMessage(message).setPositiveButton("退出", (dialog, which) -> finish()).setCancelable(false).show();
    }
}
