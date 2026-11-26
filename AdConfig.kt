package com.apexhorizon.stunt3d

/**
 * Centralized Unity Ads & Policy Configuration.
 *
 * PRODUCTION RELEASE CHECKLIST:
 * 1. Replace BuildConfig.UNITY_GAME_ID in app/build.gradle.kts with your real Unity Dashboard Game ID.
 * 2. Verify Ad Unit IDs match your Unity Monetization Dashboard Android placements.
 * 3. Build the 'release' variant in Android Studio: BuildConfig.UNITY_TEST_MODE automatically
 *    switches to `false` in release builds so real production ads are served.
 */
object AdConfig {
    const val PLACEHOLDER_GAME_ID = "REPLACE_WITH_YOUR_UNITY_GAME_ID"

    // Sourced from BuildConfig (configured in app/build.gradle.kts)
    val unityGameId: String = BuildConfig.UNITY_GAME_ID
    val bannerAdUnitId: String = BuildConfig.UNITY_BANNER_ID
    val interstitialAdUnitId: String = BuildConfig.UNITY_INTERSTITIAL_ID
    val rewardedAdUnitId: String = BuildConfig.UNITY_REWARDED_ID

    // Automatically true in debug builds, false in release builds
    val isTestMode: Boolean = BuildConfig.UNITY_TEST_MODE

    // Minimum seconds between automatic post-level interstitial ads (policy-friendly pacing)
    const val INTERSTITIAL_COOLDOWN_MS = 45_000L

    // Reward granted upon full Rewarded Video completion
    const val REWARDED_COINS_BONUS = 250

    fun hasValidCredentials(): Boolean {
        return unityGameId.isNotBlank() && unityGameId != PLACEHOLDER_GAME_ID
    }
}
