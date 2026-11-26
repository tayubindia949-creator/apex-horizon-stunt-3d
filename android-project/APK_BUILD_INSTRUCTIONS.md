# Apex Horizon Stunt 3D — Android Studio & Signed APK Build Guide

This directory (`android-project/`) is a complete, ready-to-build Android Studio project integrating the **official Unity Ads SDK (`com.unity3d.ads:unity-ads:4.22.0`)** with Banner, Interstitial, and Rewarded Video ads.

---

## 1. Sync the 3D Game Bundle into Android Assets

Before opening `android-project/` in Android Studio, build the 3D WebGL game bundle and copy it into `app/src/main/assets/www/`:

```bash
# From the repository root:
npm install
npm run build:android-assets
```

This compiles `dist/` and copies all optimized HTML/JS/CSS assets into `android-project/app/src/main/assets/www/`, which `MainActivity.kt` serves securely via `WebViewAssetLoader`.

---

## 2. Configure Your Unity Ads Credentials (Required)

Never ship with placeholder IDs. Create a project in the [Unity Cloud Dashboard](https://dashboard.unity3d.com/) under **Unity Ads Monetization**:

1. Copy your **Android Game ID** from Unity Dashboard → *Project Settings / Ad Units*.
2. Open `android-project/app/build.gradle.kts` and replace `"REPLACE_WITH_YOUR_UNITY_GAME_ID"`:
   ```kotlin
   buildConfigField("String", "UNITY_GAME_ID", "\"YOUR_ACTUAL_ANDROID_GAME_ID\"")
   ```
3. Verify your Ad Unit / Placement IDs match your Unity Dashboard:
   - Banner: `"Banner_Android"`
   - Interstitial: `"Interstitial_Android"`
   - Rewarded Video: `"Rewarded_Android"`

---

## 3. Test Mode vs. Production Mode

Test mode is controlled automatically via Gradle `buildTypes` in `app/build.gradle.kts`:

- **Debug builds (`UNITY_TEST_MODE = true`)**: Serves safe Unity test ads so you do not generate invalid traffic during development.
- **Release builds (`UNITY_TEST_MODE = false`)**: Automatically disables test mode so real production ads are served.

Before publishing, also verify **Test Mode Override** is turned **OFF** inside the Unity Dashboard for your project.

---

## 4. Generate a Release Keystore (First Time Only)

Run `keytool` (included with Android Studio's JDK) in a terminal:

```bash
keytool -genkey -v \
  -keystore apex-horizon-release.jks \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias apex-release-key
```

Create `android-project/keystore.properties` (never commit this file to Git):

```properties
storeFile=../apex-horizon-release.jks
storePassword=YOUR_STORE_PASSWORD
keyAlias=apex-release-key
keyPassword=YOUR_KEY_PASSWORD
```

---

## 5. Build a Signed Release APK in Android Studio

1. Open **Android Studio** (Ladybug / Meerkat or newer) → **Open** → select the `android-project/` folder.
2. Wait for Gradle Sync to finish downloading `com.unity3d.ads:unity-ads:4.22.0` from `mavenCentral()`.
3. Test on an Android device or emulator using the **debug** variant first (confirms Test Ads load in the menu bottom banner, post-level interstitial, and garage rewarded video).
4. Select **Build → Build Bundle(s) / APK(s) → Build APK(s)** after switching **Build Variants** to `release` (or use **Build → Generate Signed Bundle / APK → APK** and select `apex-horizon-release.jks`).
5. Or build directly from CLI:
   ```bash
   cd android-project
   ./gradlew assembleRelease
   ```
   Your signed APK is generated at:
   `android-project/app/build/outputs/apk/release/app-release.apk`

---

## 6. Unity Ads & Amazon Appstore Policy Checklist

- **No Ads During Active Gameplay**: `UnityAdsManager.setGameplayActive(true)` hides the banner and blocks interstitial/rewarded calls while driving.
- **Non-Blocking Banner Placement**: `activity_main.xml` places `banner_container` below the `WebView` (`layout_weight="1"`), preventing accidental clicks near touch pedals.
- **Voluntary Rewarded Video**: Coins are granted strictly inside `onUnityAdsShowComplete` when `state == UnityAdsShowCompletionState.COMPLETED`.
- **Privacy Policy & AD_ID**: Update `privacy_policy_url` in `res/values/strings.xml` with your live privacy policy URL before submitting to Google Play or Amazon Appstore.
- **Fire OS Compatibility**: `AndroidManifest.xml` declares `android.hardware.touchscreen` as `required="false"` and avoids Google Play Services hard dependencies.
