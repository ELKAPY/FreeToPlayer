package com.djplayer.app;

import android.annotation.SuppressLint;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AppCompatActivity;
import androidx.webkit.WebViewAssetLoader;

public class MainActivity extends AppCompatActivity {
    private static final String TAG = "DJPlayer";
    private WebView webView;
    private AudioManager audioManager;
    private AudioFocusRequest audioFocusRequest;

    @SuppressLint({"SetJavaScriptEnabled", "RequiresFeature"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Make status bar & navigation bar dark
        Window window = getWindow();
        window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS);
        window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        window.setStatusBarColor(Color.parseColor("#07080C"));
        window.setNavigationBarColor(Color.parseColor("#07080C"));

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            View decor = window.getDecorView();
            decor.setSystemUiVisibility(decor.getSystemUiVisibility() & ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        }

        // Initialize audio manager for background playback & audio focus
        audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        requestAudioFocus();

        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setLoadsImagesAutomatically(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);

        // Hardware acceleration & styling
        webView.setBackgroundColor(Color.parseColor("#07080C"));
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);

        // Add JavaScript interface for native bridge
        webView.addJavascriptInterface(new WebAppInterface(this), "AndroidBridge");

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                // Auto-grant media playback permissions
                request.grant(request.getResources());
            }

            @Override
            public boolean onConsoleMessage(ConsoleMessage consoleMessage) {
                Log.d(TAG, "[JS Console] " + consoleMessage.message() + " -- From line "
                        + consoleMessage.lineNumber() + " of " + consoleMessage.sourceId());
                return super.onConsoleMessage(consoleMessage);
            }
        });

        // Use WebViewAssetLoader so embedded assets load over https://appassets.androidplatform.net
        // This solves Chromium's CORS restrictions with ES Modules (<script type="module">)
        final WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                WebResourceResponse response = assetLoader.shouldInterceptRequest(request.getUrl());
                if (response != null) {
                    return response;
                }
                return super.shouldInterceptRequest(view, request);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    Log.e(TAG, "WebView Error (" + error.getErrorCode() + "): " + error.getDescription() + " on " + request.getUrl());
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme();
                if (scheme != null && (scheme.equalsIgnoreCase("http") || scheme.equalsIgnoreCase("https") || scheme.equalsIgnoreCase("file"))) {
                    return false; // Load inside WebView
                }
                try {
                    Intent intent = new Intent(Intent.ACTION_VIEW, uri);
                    startActivity(intent);
                    return true;
                } catch (Exception e) {
                    return false;
                }
            }
        });

        // Setup back button handling via AndroidX
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                // Ask JS if it handled back (e.g. closing full player modal or search)
                webView.evaluateJavascript("(function(){ if (window.__onAndroidBackPressed) { return window.__onAndroidBackPressed(); } return false; })()",
                    new ValueCallback<String>() {
                        @Override
                        public void onReceiveValue(String value) {
                            if ("true".equals(value)) {
                                // JS handled closing modal
                                return;
                            }
                            if (webView.canGoBack()) {
                                webView.goBack();
                            } else {
                                // Move to back instead of killing process to keep audio playing
                                moveTaskToBack(true);
                            }
                        }
                    });
            }
        });

        // Load index via secure assetLoader origin which enables all modern Web APIs and ES modules!
        webView.loadUrl("https://appassets.androidplatform.net/assets/public/index.html");
    }

    public void setKeepScreenOn(boolean keepOn) {
        if (keepOn) {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        } else {
            getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        }
    }

    private void requestAudioFocus() {
        if (audioManager == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            AudioAttributes playbackAttributes = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .build();
            audioFocusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                    .setAudioAttributes(playbackAttributes)
                    .setAcceptsDelayedFocusGain(true)
                    .setOnAudioFocusChangeListener(focusChange -> {})
                    .build();
            audioManager.requestAudioFocus(audioFocusRequest);
        } else {
            audioManager.requestAudioFocus(focusChange -> {}, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN);
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
        }
        super.onDestroy();
    }
}
