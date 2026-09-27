package io.github.humdrfgry.unlockmusic;

import static org.junit.Assert.*;
import android.Manifest;
import android.content.Context;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.os.SystemClock;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Collections;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Real installed-APK/WebView instrumentation; no HTML injection or browser mocks. */
@RunWith(AndroidJUnit4.class)
public final class OfflineStartupTest {
    private ActivityScenario<MainActivity> scenario;
    private WebView web;
    private Context context;

    @Before public void launch() throws Exception {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        scenario = ActivityScenario.launch(MainActivity.class);
        scenario.onActivity(activity -> web = findWebView(activity.findViewById(android.R.id.content)));
        assertNotNull("Activity must contain a real WebView", web);
        await("Boolean(window.OfflineUI && document.getElementById('demo-btn'))", 30000);
    }
    @After public void close() { if (scenario != null) scenario.close(); }

    @Test public void coldStartRendersBundledPageWithoutInternetPermission() throws Exception {
        PackageInfo info = context.getPackageManager().getPackageInfo(context.getPackageName(), PackageManager.GET_PERMISSIONS);
        assertFalse(Arrays.asList(info.requestedPermissions == null ? new String[0] : info.requestedPermissions)
            .contains(Manifest.permission.INTERNET));
        assertEquals(JSONObject.quote(OfflinePageClient.PAGE_URL), js("location.href"));
        assertEquals("true", js("window.isSecureContext"));
        assertEquals("\"UTF-8\"", js("document.characterSet"));
        assertEquals("true", js("document.title.includes('Unlock Music') && !document.body.innerText.includes('ERR_HTTP_RESPONSE_CODE_FAILURE')"));
        assertEquals("true", js("document.documentElement.scrollWidth <= innerWidth"));
        screenshot("startup.png");
        JSONObject device = new JSONObject();
        PackageInfo provider = WebView.getCurrentWebViewPackage();
        device.put("api", Build.VERSION.SDK_INT).put("fingerprint", Build.FINGERPRINT);
        device.put("webview", provider == null ? "unknown" : provider.packageName + " " + provider.versionName);
        device.put("page", OfflinePageClient.PAGE_URL).put("physical_device", false);
        write("device.json", device.toString(2).getBytes(StandardCharsets.UTF_8));
    }

    @Test public void reloadServesTheBundledDocumentAgain() throws Exception {
        js("window.__oldPage = true");
        scenario.onActivity(activity -> web.reload());
        await("Boolean(!window.__oldPage && window.OfflineUI && document.getElementById('demo-btn'))", 30000);
        assertEquals(JSONObject.quote(OfflinePageClient.PAGE_URL), js("location.href"));
    }

    @Test public void demoDecodesInsideTheInstalledApk() throws Exception {
        js("document.getElementById('demo-btn').click()");
        await("document.getElementById('stat-done').textContent === '03'", 30000);
        assertEquals("\"00\"", js("document.getElementById('stat-error').textContent"));
        assertEquals("3", js("document.querySelectorAll('[data-action=download]').length"));
        assertEquals("\"function\"", js("typeof OfflineNative.beginExport"));
        screenshot("decoded-samples.png");
    }

    @Test public void embeddedImagesAndBlobWorkersStillLoad() throws Exception {
        js("window.__imageResult = ''; var image = new Image(); image.onload = function(){window.__imageResult='ok'}; " +
            "image.onerror=function(){window.__imageResult='error'}; image.src='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'");
        await("window.__imageResult === 'ok'", 10000);
        js("window.__workerResult=''; var workerUrl=URL.createObjectURL(new Blob(['onmessage=function(e){postMessage(e.data)}'],{type:'text/javascript'}));" +
            "var probeWorker=new Worker(workerUrl); probeWorker.onmessage=function(e){window.__workerResult=e.data;probeWorker.terminate();URL.revokeObjectURL(workerUrl)};probeWorker.postMessage('offline-worker-ok')");
        await("window.__workerResult === 'offline-worker-ok'", 10000);
    }

    @Test public void realNativeBridgeStagesAndCancelsExport() throws Exception {
        assertEquals("\"OK\"", js("window.__exportToken=OfflineNative.beginExport('probe.txt','text/plain',4); OfflineNative.appendExport(window.__exportToken,'VEVTVA==')"));
        File dir = new File(context.getCacheDir(), "offline-exports");
        File[] files = dir.listFiles();
        assertNotNull(files);
        assertEquals(1, files.length);
        try (InputStream input = new java.io.FileInputStream(files[0])) {
            assertArrayEquals("TEST".getBytes(StandardCharsets.UTF_8), read(input));
        }
        js("OfflineNative.cancelExport(window.__exportToken)");
        assertEquals(0, dir.listFiles().length);
    }

    @Test public void resourceAndNavigationPolicyRejectsEverythingExceptTheLocalPage() throws Exception {
        OfflinePageClient client = new OfflinePageClient(context.getAssets(), message -> fail(message));
        WebResourceResponse page = client.shouldInterceptRequest(null, request(OfflinePageClient.PAGE_URL, true, "GET"));
        assertNotNull(page);
        assertEquals(200, page.getStatusCode());
        try (InputStream bundled = context.getAssets().open("index.html"); InputStream served = page.getData()) {
            assertArrayEquals(read(bundled), read(served));
        }
        assertFalse(client.shouldOverrideUrlLoading(null, request(OfflinePageClient.PAGE_URL + "#main", true, "GET")));
        for (String url : new String[]{
            "https://example.com/", "http://appassets.androidplatform.net/assets/index.html",
            "https://appassets.androidplatform.net.evil.invalid/assets/index.html",
            "https://appassets.androidplatform.net/assets/../index.html",
            "https://appassets.androidplatform.net/assets/index.html?other=true",
            "file:///etc/hosts", "content://unknown/private", "data:text/html;charset=utf-8;base64,",
            "data:image/svg+xml,<svg/>", "blob:https://appassets.androidplatform.net/other"
        }) {
            assertTrue(url, client.shouldOverrideUrlLoading(null, request(url, true, "GET")));
            assertEquals(url, 403, client.shouldInterceptRequest(null, request(url, true, "GET")).getStatusCode());
        }
        assertEquals(405, client.shouldInterceptRequest(null, request(OfflinePageClient.PAGE_URL, true, "POST")).getStatusCode());
        assertNull(client.shouldInterceptRequest(null, request("data:image/png;base64,AA==", false, "GET")));
        assertEquals(403, client.shouldInterceptRequest(null, request("data:text/html;base64,AA==", false, "GET")).getStatusCode());
    }

    private String js(String expression) throws Exception {
        AtomicReference<String> result = new AtomicReference<>();
        CountDownLatch done = new CountDownLatch(1);
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() ->
            web.evaluateJavascript(expression, value -> { result.set(value); done.countDown(); }));
        assertTrue("WebView JavaScript callback timed out", done.await(5, TimeUnit.SECONDS));
        return result.get();
    }
    private void await(String expression, long timeout) throws Exception {
        long end = SystemClock.elapsedRealtime() + timeout;
        do {
            if ("true".equals(js(expression))) return;
            SystemClock.sleep(100);
        } while (SystemClock.elapsedRealtime() < end);
        fail("WebView never satisfied: " + expression + "; url=" + js("location.href") + "; title=" + js("document.title"));
    }
    private static WebView findWebView(View view) {
        if (view instanceof WebView) return (WebView) view;
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int i=0; i<group.getChildCount(); i++) {
                WebView found = findWebView(group.getChildAt(i));
                if (found != null) return found;
            }
        }
        return null;
    }
    private static byte[] read(InputStream input) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192]; int n;
        while ((n=input.read(buffer)) != -1) output.write(buffer,0,n);
        return output.toByteArray();
    }
    private void write(String name, byte[] bytes) throws Exception {
        File dir = new File(context.getFilesDir(), "instrumentation");
        assertTrue(dir.isDirectory() || dir.mkdirs());
        try (FileOutputStream output = new FileOutputStream(new File(dir, name))) { output.write(bytes); }
    }
    private void screenshot(String name) throws Exception {
        Bitmap image = InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot();
        assertNotNull("Device screenshot failed", image);
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        assertTrue(image.compress(Bitmap.CompressFormat.PNG, 100, bytes));
        image.recycle(); write(name, bytes.toByteArray());
    }
    private static WebResourceRequest request(String url, boolean main, String method) {
        return new WebResourceRequest() {
            public Uri getUrl() { return Uri.parse(url); }
            public boolean isForMainFrame() { return main; }
            public boolean isRedirect() { return false; }
            public boolean hasGesture() { return false; }
            public String getMethod() { return method; }
            public Map<String,String> getRequestHeaders() { return Collections.emptyMap(); }
        };
    }
}
