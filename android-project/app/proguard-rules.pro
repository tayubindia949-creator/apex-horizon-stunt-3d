# Keep Unity Ads SDK classes and callbacks
-keepattributes SourceFile,LineNumberTable
-keepattributes *Annotation*

-keep class com.unity3d.ads.** { *; }
-keep class com.unity3d.services.** { *; }
-dontwarn com.unity3d.services.**

# Keep JavascriptInterface methods exposed to the 3D WebView game engine
-keepclassmembers class com.apexhorizon.stunt3d.MainActivity$AndroidAdsBridge {
    @android.webkit.JavascriptInterface <methods>;
}
