package io.github.humdrfgry.unlockmusic;

import android.content.res.AssetManager;
import android.net.Uri;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import java.util.function.Consumer;

/** A one-document asset loader. Never falls through to HTTP, disk, or a provider. */
final class OfflinePageClient extends WebViewClient {
    static final String PAGE_URL = "https://appassets.androidplatform.net/assets/index.html";
    private final AssetManager assets;
    private final Consumer<String> failure;
    private boolean errorReported;

    OfflinePageClient(AssetManager assets, Consumer<String> failure) {
        this.assets = assets;
        this.failure = failure;
    }

    static boolean isPage(Uri uri) {
        // Only a fragment may vary; do not allow queries, lookalike hosts, arbitrary
        // assets, encoded paths, credentials, ports, or externally supplied HTML.
        return PAGE_URL.equals(uri.buildUpon().fragment(null).build().toString());
    }

    @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        return !"GET".equals(request.getMethod()) || !isPage(request.getUrl());
    }

    @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        String url = request.getUrl().toString();
        if (isPage(request.getUrl())) {
            if (!"GET".equals(request.getMethod())) return blocked(405, "Method Not Allowed");
            try {
                Map<String, String> headers = new HashMap<>();
                headers.put("Cache-Control", "no-store");
                headers.put("X-Content-Type-Options", "nosniff");
                return new WebResourceResponse("text/html", "UTF-8", 200, "OK", headers,
                    assets.open("index.html"));
            } catch (IOException error) { return blocked(404, "Bundled Page Missing"); }
        }
        // Data images/audio are local resources, not network traffic. WebView normally
        // handles blob: (audio + workers) without calling this method. Never admit a
        // data: main document: it must not gain access to the native bridge.
        if (!request.isForMainFrame() && "GET".equals(request.getMethod()) &&
            (url.startsWith("data:image/") || url.startsWith("data:audio/"))) return null;
        return blocked(403, "Offline Only");
    }

    private static WebResourceResponse blocked(int status, String reason) {
        return new WebResourceResponse("text/plain", "UTF-8", status, reason,
            Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
    }

    @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
        if (request.isForMainFrame()) report("错误码 " + error.getErrorCode());
    }

    @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
        if (request.isForMainFrame()) report("状态码 " + response.getStatusCode());
    }

    private void report(String detail) {
        if (!errorReported) {
            errorReported = true;
            failure.accept("内置离线页面未能加载（" + detail + "）。这不是音乐文件错误，请安装最新修复版。");
        }
    }
}
