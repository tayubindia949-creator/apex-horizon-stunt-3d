package com.apexhorizon.stunt3d

import android.app.Application
import android.util.Log
import com.unity3d.ads.IUnityAdsInitializationListener
import com.unity3d.ads.UnityAds
import com.unity3d.ads.metadata.MetaData

class GameApplication : Application() {

    companion object {
        private const val TAG = "GameApplication"
    }

    override fun onCreate() {
        super.onCreate()
        configurePrivacyMetadata()
        initializeUnityAds()
    }

    /**
     * Configure privacy metadata flags in accordance with Unity Ads
     * and Amazon Appstore privacy transparency requirements.
     */
    private fun configurePrivacyMetadata() {
        val gdprMetaData = MetaData(this)
        gdprMetaData.set("gdpr.consent", true)
        gdprMetaData.commit()

        val privacyMetaData = MetaData(this)
        privacyMetaData.set("privacy.consent", true)
        privacyMetaData.commit()
    }

    private fun initializeUnityAds() {
        if (!AdConfig.hasValidCredentials()) {
            Log.w(
                TAG,
                "Unity Game ID is still set to placeholder (${AdConfig.PLACEHOLDER_GAME_ID}). " +
                    "Replace UNITY_GAME_ID in app/build.gradle.kts before publishing."
            )
            return
        }

        UnityAds.initialize(
            applicationContext,
            AdConfig.unityGameId,
            AdConfig.isTestMode,
            object : IUnityAdsInitializationListener {
                override fun onInitializationComplete() {
                    Log.i(TAG, "Unity Ads SDK initialized (testMode=${AdConfig.isTestMode})")
                }

                override fun onInitializationFailed(
                    error: UnityAds.UnityAdsInitializationError?,
                    message: String?
                ) {
                    Log.e(TAG, "Unity Ads initialization failed: [$error] $message")
                }
            }
        )
    }
}
