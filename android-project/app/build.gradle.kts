import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Optional keystore.properties loader for release signing (never commit secrets to VCS)
val keystorePropertiesFile = rootProject.file("keystore.properties")
val keystoreProperties = Properties().apply {
    if (keystorePropertiesFile.exists()) {
        load(keystorePropertiesFile.inputStream())
    }
}

android {
    namespace = "com.apexhorizon.stunt3d"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.apexhorizon.stunt3d"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        // =========================================================================
        // UNITY ADS CONFIGURATION PLACEHOLDERS
        // Replace REPLACE_WITH_YOUR_UNITY_GAME_ID with your real Unity Dashboard
        // Android Game ID before building a release APK.
        // =========================================================================
        buildConfigField("String", "UNITY_GAME_ID", "\"REPLACE_WITH_YOUR_UNITY_GAME_ID\"")
        buildConfigField("String", "UNITY_BANNER_ID", "\"Banner_Android\"")
        buildConfigField("String", "UNITY_INTERSTITIAL_ID", "\"Interstitial_Android\"")
        buildConfigField("String", "UNITY_REWARDED_ID", "\"Rewarded_Android\"")
    }

    signingConfigs {
        create("release") {
            if (keystorePropertiesFile.exists()) {
                storeFile = file(keystoreProperties.getProperty("storeFile"))
                storePassword = keystoreProperties.getProperty("storePassword")
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        debug {
            // Test Mode ENABLED automatically for debug builds
            buildConfigField("boolean", "UNITY_TEST_MODE", "true")
            applicationIdSuffix = ".debug"
            isDebuggable = true
        }
        release {
            // IMPORTANT: Test Mode DISABLED automatically for production release builds
            buildConfigField("boolean", "UNITY_TEST_MODE", "false")
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            if (keystorePropertiesFile.exists()) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        buildConfig = true
        viewBinding = true
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.constraintlayout:constraintlayout:2.2.0")
    implementation("androidx.webkit:webkit:1.12.1")

    // Official Unity Ads SDK for Android (4.22.0)
    implementation("com.unity3d.ads:unity-ads:4.22.0")
}
