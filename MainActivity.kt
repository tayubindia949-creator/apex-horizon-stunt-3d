package com.apexhorizon.stunt3d

import android.annotation.SuppressLint
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewClientCompat
import com.apexhorizon.stunt3d.databinding.ActivityMainBinding
import org.json.JSONObject

class MainActivity : AppCompatActivity(), UnityAdsManager.AdEventCallback {

    private lateinit var binding: ActivityMainBinding
    private lateinit var unityAdsManager: UnityAdsManager

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        enableImmersiveFullscreen()

        unityAdsManager = UnityAdsManager(
            activity = this,
            bannerContainer = binding.bannerContainer,
            callback = this
        )

        setupGameWebView()
        unityAdsManager.ensureInitializedAndPreload()
    }

    private fun enableImmersiveFullscreen() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        val controller = WindowInsetsControllerCompat(window, binding.root)
        controller.hide(WindowInsetsCompat.Type.systemBars())
        controller.systemBarsBehavior =
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupGameWebView() {
        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        binding.gameWebview.apply {
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                mediaPlaybackRequiresUserGesture = false
                allowFileAccess = false
                allowContentAccess = false
                useWideViewPort = true
                loadWithOverviewMode = true
                cacheMode = WebSettings.LOAD_DEFAULT
            }

            webViewClient = object : WebViewClientCompat() {
                override fun shouldInterceptRequest(
                    view: WebView,
                    request: WebResourceRequest
                ): WebResourceResponse? {
                    return assetLoader.shouldInterceptRequest(request.url)
                }
            }

            addJavascriptInterface(AndroidAdsBridge(), "AndroidAdsBridge")
            loadUrl("https://appassets.androidplatform.net/assets/www/index.html")
        }
    }

    /**
     * Bridge exposed to the 3D WebGL game runtime so menus, level completions,
     * and voluntary rewarded video requests trigger real native Unity Ads SDK calls.
     */
    inner class AndroidAdsBridge {

        @JavascriptInterface
        fun setGameplayActive(active: Boolean) {
            unityAdsManager.setGameplayActive(active)
        }

        @JavascriptInterface
        fun showInterstitialAfterLevel() {
            unityAdsManager.showInterstitialAfterLevel()
        }

        @JavascriptInterface
        fun showRewardedAd(rewardAmount: Int) {
            unityAdsManager.showRewardedAd(rewardAmount)
        }

        @JavascriptInterface
        fun getAdConfigJson(): String {
            return JSONObject().apply {
                put("isNativeAndroid", true)
                put("testMode", AdConfig.isTestMode)
                put("hasValidCredentials", AdConfig.hasValidCredentials())
                put("bannerUnitId", AdConfig.bannerAdUnitId)
                put("interstitialUnitId", AdConfig.interstitialAdUnitId)
                put("rewardedUnitId", AdConfig.rewardedAdUnitId)
            }.toString()
        }
    }

    private fun dispatchJsEvent(eventName: String, payload: JSONObject) {
        runOnUiThread {
            val script = "window.dispatchEvent(new CustomEvent('$eventName', { detail: $payload }));"
            binding.gameWebview.evaluateJavascript(script, null)
        }
    }

    override fun onAdSdkStatusChanged(initialized: Boolean, testMode: Boolean, message: String) {
        dispatchJsEvent(
            "unityAdsStatus",
            JSONObject().apply {
                put("initialized", initialized)
                put("testMode", testMode)
                put("message", message)
            }
        )
    }

    override fun onInterstitialClosed(placementId: String) {
        dispatchJsEvent(
            "unityInterstitialClosed",
            JSONObject().apply { put("placementId", placementId) }
        )
    }

    override fun onRewardedAdResult(completed: Boolean, rewardAmount: Int, message: String) {
        dispatchJsEvent(
            "unityRewardedResult",
            JSONObject().apply {
                put("completed", completed)
                put("rewardAmount", rewardAmount)
                put("message", message)
            }
        )
    }

    override fun onPauseGameAudio() {
        dispatchJsEvent("unityAudioFocus", JSONObject().apply { put("muted", true) })
    }

    override fun onResumeGameAudio() {
        dispatchJsEvent("unityAudioFocus", JSONObject().apply { put("muted", false) })
    }

    override fun onPause() {
        super.onPause()
        binding.gameWebview.onPause()
    }

    override fun onResume() {
        super.onResume()
        enableImmersiveFullscreen()
        binding.gameWebview.onResume()
    }

    override fun onDestroy() {
        unityAdsManager.destroy()
        binding.gameWebview.destroy()
        super.onDestroy()
    }
}
