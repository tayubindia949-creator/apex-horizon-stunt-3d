import React, { useEffect, useState } from 'react';
import { ShieldCheck, Tv, X } from 'lucide-react';
import { UnityAdConfigState } from '../services/androidBridge';

interface UnityBannerBarProps {
  visible: boolean;
  adConfig: UnityAdConfigState;
}

export const UnityBannerBar: React.FC<UnityBannerBarProps> = ({ visible, adConfig }) => {
  if (!visible || adConfig.isNativeAndroid) return null;

  return (
    <div className="w-full border-t border-white/10 bg-[#080A0F] px-4 py-2">
      <div className="mx-auto flex h-[50px] max-w-[360px] items-center justify-between rounded border border-white/15 bg-[#121722] px-3">
        <div className="flex items-center gap-2.5">
          <Tv className="h-4 w-4 text-cyan-400 shrink-0" />
          <div className="leading-tight">
            <div className="text-xs font-semibold text-white">
              Unity BannerView (320×50)
            </div>
            <div className="font-mono-tabular text-[10px] text-slate-400">
              {adConfig.bannerUnitId} · {adConfig.testMode ? 'Test Mode' : 'Production Mode'}
            </div>
          </div>
        </div>
        <span className="text-[10px] font-medium text-emerald-400 whitespace-nowrap">
          Menu Safe Slot
        </span>
      </div>
    </div>
  );
};

interface ActiveAdModalProps {
  adType: 'interstitial' | 'rewarded' | null;
  adConfig: UnityAdConfigState;
  rewardAmount: number;
  onComplete: (completed: boolean) => void;
}

export const UnityFullScreenAdModal: React.FC<ActiveAdModalProps> = ({
  adType,
  adConfig,
  rewardAmount,
  onComplete,
}) => {
  const [secondsLeft, setSecondsLeft] = useState(5);

  useEffect(() => {
    if (!adType) return;
    setSecondsLeft(adType === 'rewarded' ? 5 : 3);
    const timer = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [adType]);

  if (!adType) return null;

  const isRewarded = adType === 'rewarded';
  const canClaim = secondsLeft === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/92 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-white/15 bg-[#111622] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
            <ShieldCheck className="h-4 w-4 text-cyan-400" />
            <span>
              Unity Ads SDK Preview · {adConfig.testMode ? 'Test Ad' : 'Production Ad'}
            </span>
          </div>
          {canClaim ? (
            <button
              onClick={() => onComplete(true)}
              className="flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400 cursor-pointer"
            >
              <span>{isRewarded ? `Claim +${rewardAmount} Coins` : 'Close Ad'}</span>
              <X className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              onClick={() => onComplete(false)}
              className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-slate-400 hover:text-white cursor-pointer"
            >
              {isRewarded ? `Skip (${secondsLeft}s)` : `Wait ${secondsLeft}s`}
            </button>
          )}
        </div>

        <div className="p-6 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-400">
            <Tv className="h-7 w-7" />
          </div>
          <h3 className="font-display text-lg font-bold text-white">
            {isRewarded ? 'Unity Rewarded Video' : 'Unity Interstitial Break'}
          </h3>
          <p className="mt-2 text-xs text-slate-300 leading-relaxed">
            {isRewarded
              ? `Complete the ad to earn +${rewardAmount} bonus coins via onUnityAdsShowComplete(COMPLETED). Closing early skips the reward.`
              : 'Displayed only at post-level natural breaks. On Android APK, native UnityAds.show() renders here.'}
          </p>

          <div className="mt-5 rounded-xl border border-white/10 bg-[#0B0E14] p-3 text-left font-mono-tabular text-[11px] text-slate-400 space-y-1">
            <div>
              Placement:{' '}
              <span className="text-slate-200">
                {isRewarded ? adConfig.rewardedUnitId : adConfig.interstitialUnitId}
              </span>
            </div>
            <div>
              Game ID:{' '}
              <span className="text-amber-400">{adConfig.gameIdPlaceholder}</span>
            </div>
            <div>
              Status:{' '}
              <span className={canClaim ? 'text-emerald-400' : 'text-cyan-400'}>
                {canClaim ? 'COMPLETED — Ready to close' : `Playing (${secondsLeft}s remaining)`}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
