export interface NativeAndroidBridgeApi {
  setGameplayActive: (active: boolean) => void;
  showInterstitialAfterLevel: () => void;
  showRewardedAd: (rewardAmount: number) => void;
  getAdConfigJson: () => string;
}

declare global {
  interface Window {
    AndroidAdsBridge?: NativeAndroidBridgeApi;
  }
}

export interface UnityAdConfigState {
  isNativeAndroid: boolean;
  testMode: boolean;
  gameIdPlaceholder: string;
  bannerUnitId: string;
  interstitialUnitId: string;
  rewardedUnitId: string;
  hasValidCredentials: boolean;
}

export interface AdSdkLogEntry {
  id: number;
  time: string;
  event: string;
  detail: string;
}

export const DEFAULT_AD_CONFIG: UnityAdConfigState = {
  isNativeAndroid: false,
  testMode: true,
  gameIdPlaceholder: 'REPLACE_WITH_YOUR_UNITY_GAME_ID',
  bannerUnitId: 'Banner_Android',
  interstitialUnitId: 'Interstitial_Android',
  rewardedUnitId: 'Rewarded_Android',
  hasValidCredentials: false,
};

export function readInitialAdConfig(): UnityAdConfigState {
  if (typeof window !== 'undefined' && window.AndroidAdsBridge) {
    try {
      const parsed = JSON.parse(window.AndroidAdsBridge.getAdConfigJson());
      return {
        isNativeAndroid: Boolean(parsed.isNativeAndroid),
        testMode: Boolean(parsed.testMode),
        gameIdPlaceholder: parsed.hasValidCredentials
          ? 'Configured in BuildConfig'
          : 'REPLACE_WITH_YOUR_UNITY_GAME_ID',
        bannerUnitId: String(parsed.bannerUnitId ?? 'Banner_Android'),
        interstitialUnitId: String(parsed.interstitialUnitId ?? 'Interstitial_Android'),
        rewardedUnitId: String(parsed.rewardedUnitId ?? 'Rewarded_Android'),
        hasValidCredentials: Boolean(parsed.hasValidCredentials),
      };
    } catch {
      return { ...DEFAULT_AD_CONFIG, isNativeAndroid: true };
    }
  }
  return DEFAULT_AD_CONFIG;
}
