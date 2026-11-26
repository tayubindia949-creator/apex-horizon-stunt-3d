package com.apexhorizon.stunt3d

import android.app.Activity
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import com.unity3d.ads.IUnityAdsInitializationListener
import com.unity3d.ads.IUnityAdsLoadListener
import com.unity3d.ads.IUnityAdsShowListener
import com.unity3d.ads.UnityAds
import com.unity3d.ads.UnityAdsShowOptions
import com.unity3d.services.banners.BannerErrorInfo
import com.unity3d.services.banners.BannerView
import com.unity3d.services.banners.UnityBannerSize

/**
 * Manages Unity Ads SDK 4.22.0 lifecycle for Banner, Interstitial, and Rewarded Video ads.
 *
 * Policy enforcement:
 * - Never displays any ad format while `isGameplayActive` is true.
 * - Banner resides strictly in a dedicated bottom menu container outside interactive controls.
 * - Interstitials obey cooldown pacing and are shown only at post-level natural breaks.
 * - Rewarded videos are strictly voluntary and award coins only on COMPLETED callback.
 */
class UnityAdsManager(
    private val activity: Activity,
    private val bannerContainer: FrameLayout,
    private val callback: AdEventCallback
) {

    interface AdEventCallback {
        fun onAdSdkStatusChanged(initialized: Boolean, testMode: Boolean, message: String)
        fun onInterstitialClosed(placementId: String)
        fun onRewardedAdResult(completed: Boolean, rewardAmount: Int, message: String)
        fun onPauseGameAudio()
        fun onResumeGameAudio()
    }

    companion object {
        private const val TAG = "UnityAdsManager"
    }

    private val mainHandler = Handler(Looper.getMainLooper())
    private var bannerView: BannerView? = null
    private var isBannerLoaded = false
    private var isInterstitialLoaded = false
    private var isRewardedLoaded = false
    private var isGameplayActive = false
    private var lastInterstitialShownAt = 0L

    fun ensureInitializedAndPreload() {
        if (!AdConfig.hasValidCredentials()) {
            callback.onAdSdkStatusChanged(
                initialized = false,
                testMode = AdConfig.isTestMode,
                message = "Placeholder Game ID active. Replace UNITY_GAME_ID in app/build.gradle.kts."
            )
            return
        }

        if (UnityAds.isInitialized) {
            callback.onAdSdkStatusChanged(
                initialized = true,
                testMode = AdConfig.isTestMode,
                message = "Unity Ads SDK ready"
            )
            preloadAllAds()
            return
        }

        UnityAds.initialize(
            activity.applicationContext,
            AdConfig.unityGameId,
            AdConfig.isTestMode,
            object : IUnityAdsInitializationListener {
                override fun onInitializationComplete() {
                    mainHandler.post {
                        callback.onAdSdkStatusChanged(
                            initialized = true,
                            testMode = AdConfig.isTestMode,
                            message = "Unity Ads SDK initialized"
                        )
                        preloadAllAds()
                    }
                }

                override fun onInitializationFailed(
                    error: UnityAds.UnityAdsInitializationError?,
                    message: String?
                ) {
                    val errText = "Init failed: $error - $message"
                    Log.e(TAG, errText)
                    mainHandler.post {
                        callback.onAdSdkStatusChanged(false, AdConfig.isTestMode, errText)
                    }
                }
            }
        )
    }

    private fun preloadAllAds() {
        loadBannerAd()
        loadInterstitialAd()
        loadRewardedAd()
    }

    /**
     * Toggles active driving state. When driving starts, banner is immediately hidden
     * so no ad ever overlaps steering/throttle controls or appears during active gameplay.
     */
    fun setGameplayActive(active: Boolean) {
        isGameplayActive = active
        mainHandler.post {
            if (active) {
                bannerContainer.visibility = View.GONE
            } else if (isBannerLoaded) {
                bannerContainer.visibility = View.VISIBLE
            }
        }
    }

    // =========================================================================
    // 1. BANNER ADS (Menu Bottom Only)
    // =========================================================================

    fun loadBannerAd() {
        if (!UnityAds.isInitialized) return

        mainHandler.post {
            bannerView?.destroy()
            val banner = BannerView(
                activity,
                AdConfig.bannerAdUnitId,
                UnityBannerSize(320, 50)
            )
            banner.listener = object : BannerView.IListener {
                override fun onBannerLoaded(bannerAdView: BannerView?) {
                    Log.i(TAG, "Banner loaded")
                    isBannerLoaded = true
                    mainHandler.post {
                        bannerAdView?.let { view ->
                            (view.parent as? ViewGroup)?.removeView(view)
                            bannerContainer.removeAllViews()
                            bannerContainer.addView(view)
                            bannerContainer.visibility =
                                if (isGameplayActive) View.GONE else View.VISIBLE
                        }
                    }
                }

                override fun onBannerShown(bannerAdView: BannerView?) {
                    Log.d(TAG, "Banner shown")
                }

                override fun onBannerClick(bannerAdView: BannerView?) {
                    Log.d(TAG, "Banner clicked")
                }

                override fun onBannerFailedToLoad(
                    bannerAdView: BannerView?,
                    errorInfo: BannerErrorInfo?
                ) {
                    Log.e(TAG, "Banner failed to load: ${errorInfo?.errorCode} ${errorInfo?.errorMessage}")
                    isBannerLoaded = false
                    mainHandler.post {
                        bannerContainer.visibility = View.GONE
                    }
                }

                override fun onBannerLeftApplication(bannerAdView: BannerView?) {
                    Log.d(TAG, "Banner left application")
                }
            }
            bannerView = banner
            banner.load()
        }
    }

    // =========================================================================
    // 2. INTERSTITIAL ADS (Post-Level Natural Break Only)
    // =========================================================================

    fun loadInterstitialAd() {
        if (!UnityAds.isInitialized) return
        UnityAds.load(AdConfig.interstitialAdUnitId, object : IUnityAdsLoadListener {
            override fun onUnityAdsAdLoaded(placementId: String?) {
                Log.i(TAG, "Interstitial loaded: $placementId")
                isInterstitialLoaded = true
            }

            override fun onUnityAdsFailedToLoad(
                placementId: String?,
                error: UnityAds.UnityAdsLoadError?,
                message: String?
            ) {
                Log.e(TAG, "Interstitial load failed ($placementId): $error - $message")
                isInterstitialLoaded = false
            }
        })
    }

    fun showInterstitialAfterLevel() {
        if (isGameplayActive) {
            Log.w(TAG, "Blocked interstitial: cannot show ads during active gameplay.")
            callback.onInterstitialClosed(AdConfig.interstitialAdUnitId)
            return
        }

        val now = System.currentTimeMillis()
        if (now - lastInterstitialShownAt < AdConfig.INTERSTITIAL_COOLDOWN_MS) {
            Log.i(TAG, "Skipping interstitial due to cooldown pacing.")
            callback.onInterstitialClosed(AdConfig.interstitialAdUnitId)
            return
        }

        if (!UnityAds.isInitialized || !isInterstitialLoaded) {
            Log.i(TAG, "Interstitial not ready; continuing smoothly.")
            loadInterstitialAd()
            callback.onInterstitialClosed(AdConfig.interstitialAdUnitId)
            return
        }

        mainHandler.post {
            callback.onPauseGameAudio()
            UnityAds.show(
                activity,
                AdConfig.interstitialAdUnitId,
                UnityAdsShowOptions(),
                object : IUnityAdsShowListener {
                    override fun onUnityAdsShowFailure(
                        placementId: String?,
                        error: UnityAds.UnityAdsShowError?,
                        message: String?
                    ) {
                        Log.e(TAG, "Interstitial show failed: $error - $message")
                        isInterstitialLoaded = false
                        callback.onResumeGameAudio()
                        callback.onInterstitialClosed(placementId ?: AdConfig.interstitialAdUnitId)
                        loadInterstitialAd()
                    }

                    override fun onUnityAdsShowStart(placementId: String?) {
                        Log.i(TAG, "Interstitial started: $placementId")
                        lastInterstitialShownAt = System.currentTimeMillis()
                    }

                    override fun onUnityAdsShowClick(placementId: String?) {
                        Log.d(TAG, "Interstitial clicked: $placementId")
                    }

                    override fun onUnityAdsShowComplete(
                        placementId: String?,
                        state: UnityAds.UnityAdsShowCompletionState?
                    ) {
                        Log.i(TAG, "Interstitial complete: $state")
                        isInterstitialLoaded = false
                        callback.onResumeGameAudio()
                        callback.onInterstitialClosed(placementId ?: AdConfig.interstitialAdUnitId)
                        loadInterstitialAd()
                    }
                }
            )
        }
    }

    // =========================================================================
    // 3. REWARDED VIDEO ADS (Voluntary Player Opt-In)
    // =========================================================================

    fun loadRewardedAd() {
        if (!UnityAds.isInitialized) return
        UnityAds.load(AdConfig.rewardedAdUnitId, object : IUnityAdsLoadListener {
            override fun onUnityAdsAdLoaded(placementId: String?) {
                Log.i(TAG, "Rewarded video loaded: $placementId")
                isRewardedLoaded = true
            }

            override fun onUnityAdsFailedToLoad(
                placementId: String?,
                error: UnityAds.UnityAdsLoadError?,
                message: String?
            ) {
                Log.e(TAG, "Rewarded video load failed ($placementId): $error - $message")
                isRewardedLoaded = false
            }
        })
    }

    fun showRewardedAd(rewardAmount: Int = AdConfig.REWARDED_COINS_BONUS) {
        if (isGameplayActive) {
            callback.onRewardedAdResult(false, 0, "Cannot open rewarded ad while driving.")
            return
        }

        if (!UnityAds.isInitialized || !isRewardedLoaded) {
            loadRewardedAd()
            callback.onRewardedAdResult(false, 0, "Rewarded video is still loading. Please try again.")
            return
        }

        mainHandler.post {
            callback.onPauseGameAudio()
            UnityAds.show(
                activity,
                AdConfig.rewardedAdUnitId,
                UnityAdsShowOptions(),
                object : IUnityAdsShowListener {
                    override fun onUnityAdsShowFailure(
                        placementId: String?,
                        error: UnityAds.UnityAdsShowError?,
                        message: String?
                    ) {
                        Log.e(TAG, "Rewarded show failed: $error - $message")
                        isRewardedLoaded = false
                        callback.onResumeGameAudio()
                        callback.onRewardedAdResult(false, 0, "Ad failed to play: $message")
                        loadRewardedAd()
                    }

                    override fun onUnityAdsShowStart(placementId: String?) {
                        Log.i(TAG, "Rewarded ad started: $placementId")
                    }

                    override fun onUnityAdsShowClick(placementId: String?) {
                        Log.d(TAG, "Rewarded ad clicked: $placementId")
                    }

                    override fun onUnityAdsShowComplete(
                        placementId: String?,
                        state: UnityAds.UnityAdsShowCompletionState?
                    ) {
                        isRewardedLoaded = false
                        callback.onResumeGameAudio()
                        val earned = state == UnityAds.UnityAdsShowCompletionState.COMPLETED
                        if (earned) {
                            callback.onRewardedAdResult(true, rewardAmount, "Bonus coins awarded!")
                        } else {
                            callback.onRewardedAdResult(false, 0, "Watch full video to earn reward.")
                        }
                        loadRewardedAd()
                    }
                }
            )
        }
    }

    fun destroy() {
        bannerView?.destroy()
        bannerView = null
        bannerContainer.removeAllViews()
    }
}
