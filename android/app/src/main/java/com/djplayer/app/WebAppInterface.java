package com.djplayer.app;

import android.content.Context;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.webkit.JavascriptInterface;
import android.widget.Toast;

public class WebAppInterface {
    private final MainActivity activity;
    private final Vibrator vibrator;

    public WebAppInterface(MainActivity activity) {
        this.activity = activity;
        this.vibrator = (Vibrator) activity.getSystemService(Context.VIBRATOR_SERVICE);
    }

    @JavascriptInterface
    public boolean isAndroidApp() {
        return true;
    }

    @JavascriptInterface
    public void vibrate(long milliseconds) {
        if (vibrator != null && vibrator.hasVibrator()) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(VibrationEffect.createOneShot(milliseconds, VibrationEffect.DEFAULT_AMPLITUDE));
            } else {
                vibrator.vibrate(milliseconds);
            }
        }
    }

    @JavascriptInterface
    public void showToast(String message) {
        activity.runOnUiThread(() -> Toast.makeText(activity, message, Toast.LENGTH_SHORT).show());
    }

    @JavascriptInterface
    public void setKeepScreenOn(boolean keepOn) {
        activity.runOnUiThread(() -> activity.setKeepScreenOn(keepOn));
    }

    @JavascriptInterface
    public String getDeviceModel() {
        return Build.MANUFACTURER + " " + Build.MODEL;
    }
}
