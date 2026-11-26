import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Award,
  Car,
  CheckCircle2,
  Coins,
  FolderCode,
  PauseCircle,
  Play,
  PlayCircle,
  RotateCcw,
  Trophy,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { AndroidStudioModal } from './components/AndroidStudioModal';
import { GameHud } from './components/GameHud';
import { GarageModal } from './components/GarageModal';
import { UnityBannerBar, UnityFullScreenAdModal } from './components/UnityAdOverlay';
import { getCarSpec, LEVELS } from './game/catalog';
import { StuntGameEngine } from './game/engine';
import {
  CameraMode,
  CarId,
  ControlInputState,
  GameScreen,
  HudTelemetry,
  LevelDef,
  LevelResult,
  PaintId,
  SaveData,
  StuntToast,
  UpgradeLevels,
} from './game/types';
import {
  AdSdkLogEntry,
  readInitialAdConfig,
  UnityAdConfigState,
} from './services/androidBridge';
import { loadSaveData, persistSaveData } from './services/saveStore';

const INITIAL_TELEMETRY: HudTelemetry = {
  speedKmh: 0,
  gear: '1',
  rpmRatio: 0,
  nitroRatio: 1,
  isNitroActive: false,
  isAirborne: false,
  airTimeSec: 0,
  lastJumpDistM: 0,
  maxJumpDistM: 0,
  topSpeedKmh: 0,
  stuntScore: 0,
  coinsCollected: 0,
  totalCoinsInLevel: 14,
  ringsCleared: 0,
  totalRingsInLevel: 3,
  checkpointsCleared: 0,
  totalCheckpointsInLevel: 3,
  timeRemainingSec: 90,
  missionComplete: false,
};

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<StuntGameEngine | null>(null);

  const [save, setSave] = useState<SaveData>(() => loadSaveData());
  const [screen, setScreen] = useState<GameScreen>('menu');
  const [selectedLevelId, setSelectedLevelId] = useState<number>(1);
  const [telemetry, setTelemetry] = useState<HudTelemetry>(INITIAL_TELEMETRY);
  const [stuntToast, setStuntToast] = useState<StuntToast | null>(null);
  const [levelResult, setLevelResult] = useState<LevelResult | null>(null);
  const [cameraMode, setCameraMode] = useState<CameraMode>('chase');
  const [contextLost, setContextLost] = useState(false);

  const [garageOpen, setGarageOpen] = useState(false);
  const [androidModalOpen, setAndroidModalOpen] = useState(false);
  const [menuDockCollapsed, setMenuDockCollapsed] = useState(false);

  // Unity Ads State & Bridge
  const [adConfig, setAdConfig] = useState<UnityAdConfigState>(() => readInitialAdConfig());
  const [activeWebAd, setActiveWebAd] = useState<{
    type: 'interstitial' | 'rewarded';
    rewardAmount: number;
    purpose: 'bonus_coins' | 'double_reward' | 'post_level';
  } | null>(null);
  const [rewardDoubled, setRewardDoubled] = useState(false);
  const [pendingActionAfterInterstitial, setPendingActionAfterInterstitial] = useState<
    (() => void) | null
  >(null);
  const [adLogs, setAdLogs] = useState<AdSdkLogEntry[]>(() => [
    {
      id: 1,
      time: new Date().toLocaleTimeString(),
      event: 'UnityAds.initialize',
      detail: 'Initialized Banner, Interstitial & Rewarded placements',
    },
  ]);

  const toastTimerRef = useRef<number>(0);
  const logSeqRef = useRef<number>(2);
  const pendingRewardPurposeRef = useRef<'bonus_coins' | 'double_reward'>('bonus_coins');

  const appendAdLog = useCallback((event: string, detail: string) => {
    const id = logSeqRef.current++;
    setAdLogs((prev) => [
      { id, time: new Date().toLocaleTimeString(), event, detail },
      ...prev.slice(0, 29),
    ]);
  }, []);

  // Persist save changes
  useEffect(() => {
    persistSaveData(save);
  }, [save]);

  // Keep engine showroom synced when editing cars/paints in menu
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (screen === 'menu') {
      engine.setShowroomMode(
        save.selectedCar,
        save.carPaints[save.selectedCar],
        save.carUpgrades[save.selectedCar]
      );
    }
  }, [screen, save.selectedCar, save.carPaints, save.carUpgrades]);

  // Sync mute state
  useEffect(() => {
    engineRef.current?.audio.setMuted(save.muted);
  }, [save.muted]);

  // Sync gameplay state with Native Android Bridge (hides banner while driving)
  useEffect(() => {
    const isDriving = screen === 'playing';
    window.AndroidAdsBridge?.setGameplayActive(isDriving);
    if (screen === 'menu') {
      appendAdLog('BannerView', `Menu visible (${adConfig.bannerUnitId})`);
    } else if (isDriving) {
      appendAdLog('BannerView', 'Hidden during active gameplay');
    }
  }, [screen, adConfig.bannerUnitId, appendAdLog]);

  // Mount Three.js Engine once
  useEffect(() => {
    if (!canvasMountRef.current) return;

    const engine = new StuntGameEngine(canvasMountRef.current, {
      onTelemetry: (t) => setTelemetry(t),
      onStuntToast: (label, points) => {
        const id = Date.now() + Math.random();
        setStuntToast({ id, label, points });
        window.clearTimeout(toastTimerRef.current);
        toastTimerRef.current = window.setTimeout(() => {
          setStuntToast((curr) => (curr?.id === id ? null : curr));
        }, 1650);
      },
      onLevelComplete: (result) => {
        setLevelResult(result);
        setRewardDoubled(false);
        setScreen('level_complete');
        setSave((prev) => {
          const nextCompleted =
            result.missionPassed && !prev.completedLevels.includes(result.levelId)
              ? [...prev.completedLevels, result.levelId]
              : prev.completedLevels;
          const prevBest = prev.bestStuntScores[result.levelId] ?? 0;
          return {
            ...prev,
            coins: prev.coins + result.totalCoinsEarned,
            completedLevels: nextCompleted,
            bestStuntScores: {
              ...prev.bestStuntScores,
              [result.levelId]: Math.max(prevBest, result.stuntScore),
            },
          };
        });
      },
      onContextLost: (lost) => setContextLost(lost),
    });

    engine.audio.setMuted(save.muted);
    engine.setShowroomMode(
      save.selectedCar,
      save.carPaints[save.selectedCar],
      save.carUpgrades[save.selectedCar]
    );
    engineRef.current = engine;

    return () => {
      window.clearTimeout(toastTimerRef.current);
      engine.dispose();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Native Android Unity Ads Bridge Event Listeners
  useEffect(() => {
    const onAdsStatus = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      appendAdLog('IUnityAdsInitializationListener', String(detail?.message ?? 'Updated'));
    };

    const onInterstitialClosed = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      appendAdLog('IUnityAdsShowListener', `Interstitial closed (${detail?.placementId ?? ''})`);
      setPendingActionAfterInterstitial((fn) => {
        if (fn) fn();
        return null;
      });
    };

    const onRewardedResult = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const completed = Boolean(detail?.completed);
      const amount = Number(detail?.rewardAmount ?? 0);
      appendAdLog(
        'IUnityAdsShowListener',
        completed ? `Rewarded COMPLETED (+${amount} coins)` : String(detail?.message ?? 'Skipped')
      );
      if (completed && amount > 0) {
        setSave((prev) => ({ ...prev, coins: prev.coins + amount }));
        if (pendingRewardPurposeRef.current === 'double_reward') {
          setRewardDoubled(true);
        }
      }
    };

    const onAudioFocus = (e: Event) => {
      const mutedByAd = Boolean((e as CustomEvent).detail?.muted);
      engineRef.current?.audio.setAdMuted(mutedByAd);
    };

    window.addEventListener('unityAdsStatus', onAdsStatus);
    window.addEventListener('unityInterstitialClosed', onInterstitialClosed);
    window.addEventListener('unityRewardedResult', onRewardedResult);
    window.addEventListener('unityAudioFocus', onAudioFocus);

    return () => {
      window.removeEventListener('unityAdsStatus', onAdsStatus);
      window.removeEventListener('unityInterstitialClosed', onInterstitialClosed);
      window.removeEventListener('unityRewardedResult', onRewardedResult);
      window.removeEventListener('unityAudioFocus', onAudioFocus);
    };
  }, [appendAdLog]);

  // Keyboard Controls
  useEffect(() => {
    const updateKey = (code: string, down: boolean) => {
      const engine = engineRef.current;
      if (!engine) return;
      if (code === 'KeyW' || code === 'ArrowUp') engine.keyboardInput.throttle = down;
      if (code === 'KeyS' || code === 'ArrowDown') engine.keyboardInput.brake = down;
      if (code === 'KeyA' || code === 'ArrowLeft') engine.keyboardInput.left = down;
      if (code === 'KeyD' || code === 'ArrowRight') engine.keyboardInput.right = down;
      if (code === 'Space' || code === 'ShiftLeft' || code === 'ShiftRight') {
        engine.keyboardInput.nitro = down;
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (screen !== 'playing') {
        if (e.code === 'Escape' && screen === 'paused') {
          engineRef.current?.setPaused(false);
          setScreen('playing');
        }
        return;
      }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
      updateKey(e.code, true);
      if (e.code === 'KeyR' && !e.repeat) {
        engineRef.current?.resetCarToSpawn();
      }
      if (e.code === 'KeyC' && !e.repeat) {
        const nextCam = engineRef.current?.cycleCameraMode();
        if (nextCam) setCameraMode(nextCam);
      }
      if (e.code === 'Escape' && !e.repeat) {
        engineRef.current?.setPaused(true);
        setScreen('paused');
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      updateKey(e.code, false);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [screen]);

  const activeLevel: LevelDef =
    LEVELS.find((l) => l.id === selectedLevelId) ?? LEVELS[0];
  const activeCar = getCarSpec(save.selectedCar);

  const launchLevel = useCallback(
    (level: LevelDef) => {
      const engine = engineRef.current;
      if (!engine) return;
      engine.audio.unlock();
      engine.audio.playClick();

      const carToUse = save.unlockedCars.includes(save.selectedCar)
        ? save.selectedCar
        : 'valkyrie';

      setSelectedLevelId(level.id);
      setLevelResult(null);
      setGarageOpen(false);
      setAndroidModalOpen(false);
      setScreen('playing');

      engine.startLevel(
        level,
        carToUse,
        save.carPaints[carToUse],
        save.carUpgrades[carToUse]
      );
    },
    [save]
  );

  // Trigger voluntary Rewarded Video Ad
  const triggerRewardedAd = useCallback(
    (rewardAmount: number, purpose: 'bonus_coins' | 'double_reward') => {
      engineRef.current?.audio.unlock();
      engineRef.current?.audio.playClick();
      pendingRewardPurposeRef.current = purpose;

      if (window.AndroidAdsBridge) {
        appendAdLog('UnityAds.show', `Rewarded (${adConfig.rewardedUnitId})`);
        window.AndroidAdsBridge.showRewardedAd(rewardAmount);
        return;
      }

      engineRef.current?.audio.setAdMuted(true);
      appendAdLog('UnityAds.load', `Loaded ${adConfig.rewardedUnitId}`);
      setActiveWebAd({ type: 'rewarded', rewardAmount, purpose });
    },
    [adConfig.rewardedUnitId, appendAdLog]
  );

  // Trigger Interstitial Ad ONLY at post-level natural break
  const runAfterInterstitialBreak = useCallback(
    (nextAction: () => void) => {
      if (window.AndroidAdsBridge) {
        appendAdLog('UnityAds.show', `Interstitial (${adConfig.interstitialUnitId})`);
        setPendingActionAfterInterstitial(() => nextAction);
        window.AndroidAdsBridge.showInterstitialAfterLevel();
        return;
      }

      engineRef.current?.audio.setAdMuted(true);
      appendAdLog('UnityAds.load', `Loaded ${adConfig.interstitialUnitId}`);
      setPendingActionAfterInterstitial(() => nextAction);
      setActiveWebAd({ type: 'interstitial', rewardAmount: 0, purpose: 'post_level' });
    },
    [adConfig.interstitialUnitId, appendAdLog]
  );

  const handleWebAdComplete = (completed: boolean) => {
    const current = activeWebAd;
    setActiveWebAd(null);
    engineRef.current?.audio.setAdMuted(false);

    if (!current) return;

    if (current.type === 'rewarded') {
      if (completed) {
        appendAdLog(
          'onUnityAdsShowComplete',
          `${adConfig.rewardedUnitId} COMPLETED (+${current.rewardAmount} coins)`
        );
        setSave((prev) => ({ ...prev, coins: prev.coins + current.rewardAmount }));
        if (current.purpose === 'double_reward') {
          setRewardDoubled(true);
        }
      } else {
        appendAdLog('onUnityAdsShowComplete', `${adConfig.rewardedUnitId} SKIPPED (no reward)`);
      }
      return;
    }

    if (current.type === 'interstitial') {
      appendAdLog('onUnityAdsShowComplete', `${adConfig.interstitialUnitId} closed`);
      const fn = pendingActionAfterInterstitial;
      setPendingActionAfterInterstitial(null);
      if (fn) fn();
    }
  };

  const handleTouchChange = useCallback(
    (key: keyof ControlInputState, active: boolean) => {
      const engine = engineRef.current;
      if (!engine) return;
      engine.audio.unlock();
      engine.touchInput[key] = active;
    },
    []
  );

  const handleSelectCar = (id: CarId) => {
    engineRef.current?.audio.unlock();
    engineRef.current?.audio.playClick();
    setSave((prev) => ({ ...prev, selectedCar: id }));
  };

  const handleUnlockCar = (id: CarId, price: number) => {
    engineRef.current?.audio.unlock();
    engineRef.current?.audio.playCoin();
    setSave((prev) => {
      if (prev.coins < price || prev.unlockedCars.includes(id)) return prev;
      return {
        ...prev,
        coins: prev.coins - price,
        unlockedCars: [...prev.unlockedCars, id],
        selectedCar: id,
      };
    });
  };

  const handleSelectPaint = (carId: CarId, paintId: PaintId) => {
    engineRef.current?.audio.unlock();
    engineRef.current?.audio.playClick();
    setSave((prev) => ({
      ...prev,
      carPaints: { ...prev.carPaints, [carId]: paintId },
    }));
  };

  const handleUpgradeStat = (carId: CarId, stat: keyof UpgradeLevels, cost: number) => {
    engineRef.current?.audio.unlock();
    engineRef.current?.audio.playClick();
    setSave((prev) => {
      const current = prev.carUpgrades[carId][stat];
      if (current >= 5 || prev.coins < cost) return prev;
      return {
        ...prev,
        coins: prev.coins - cost,
        carUpgrades: {
          ...prev.carUpgrades,
          [carId]: {
            ...prev.carUpgrades[carId],
            [stat]: current + 1,
          },
        },
      };
    });
  };

  const isSelectedUnlocked = save.unlockedCars.includes(save.selectedCar);

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-[#0B0E14]">
      {/* Isolated Full-Bleed WebGL 3D Viewport */}
      <div className="relative flex-1 overflow-hidden">
        <div ref={canvasMountRef} className="absolute inset-0" />

        {contextLost && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#0B0E14]/95 p-6 text-center">
            <div className="max-w-sm rounded-2xl border border-white/10 bg-[#121722] p-6">
              <h2 className="font-display text-lg font-bold text-white">
                3D Graphics Context Paused
              </h2>
              <p className="mt-2 text-xs text-slate-400">
                WebGL context was interrupted by the browser. Reloading graphics pipeline...
              </p>
            </div>
          </div>
        )}

        {/* MENU OVERLAY (Showroom 3D Car stays 100% visible in center) */}
        {screen === 'menu' && (
          <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between">
            {/* Top Bar Contract: Brand | Nav Links | Primary Action */}
            <header className="pointer-events-auto flex items-center justify-between gap-4 border-b border-white/10 bg-[#0B0E14]/86 px-4 py-3 sm:px-6">
              <div className="font-display text-lg sm:text-xl font-bold tracking-tight text-white whitespace-nowrap shrink-0">
                Apex Horizon Stunt 3D
              </div>

              <nav className="flex items-center gap-4 sm:gap-6 text-xs sm:text-sm font-medium text-slate-300">
                <button
                  onClick={() => {
                    engineRef.current?.audio.unlock();
                    engineRef.current?.audio.playClick();
                    setGarageOpen(true);
                  }}
                  className="flex items-center gap-1.5 hover:text-amber-400 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Car className="h-4 w-4 text-amber-400" />
                  <span>Garage</span>
                </button>
                <button
                  onClick={() => {
                    engineRef.current?.audio.unlock();
                    engineRef.current?.audio.playClick();
                    setAndroidModalOpen(true);
                  }}
                  className="flex items-center gap-1.5 hover:text-cyan-400 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <FolderCode className="h-4 w-4 text-cyan-400" />
                  <span className="hidden sm:inline">Android Studio &amp; Ads</span>
                  <span className="sm:hidden">APK &amp; Ads</span>
                </button>
                <button
                  onClick={() => {
                    engineRef.current?.audio.unlock();
                    setSave((prev) => ({ ...prev, muted: !prev.muted }));
                  }}
                  aria-label="Toggle Sound"
                  className="hover:text-white transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  {save.muted ? (
                    <VolumeX className="h-4 w-4 text-rose-400" />
                  ) : (
                    <Volume2 className="h-4 w-4 text-emerald-400" />
                  )}
                </button>
              </nav>

              <div className="flex items-center gap-3 shrink-0">
                <div className="hidden sm:flex items-center gap-1.5 font-mono-tabular text-sm font-semibold text-amber-400">
                  <Coins className="h-4 w-4" />
                  <span>{save.coins.toLocaleString()}</span>
                </div>
                <button
                  onClick={() => launchLevel(activeLevel)}
                  className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Play className="h-3.5 w-3.5 fill-current" />
                  <span>Drive Now</span>
                </button>
              </div>
            </header>

            {/* Bottom Collapsible Dock: Car Info, Level Selector & Rewarded Ad */}
            <div className="pointer-events-auto mx-auto mb-3 w-full max-w-5xl px-3 sm:px-5">
              <div className="mb-1.5 flex items-center justify-between px-1">
                <div className="text-xs text-slate-300">
                  <span className="font-display font-bold text-white">{activeCar.name}</span>
                  <span className="mx-2 text-slate-600">·</span>
                  <span className="text-slate-400">{activeCar.classLabel}</span>
                  {!isSelectedUnlocked && (
                    <span className="ml-2 text-amber-400">
                      (Locked — opens with Valkyrie GT until unlocked in Garage)
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setMenuDockCollapsed((v) => !v)}
                  className="rounded-md border border-white/10 bg-[#0B0E14]/90 px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:text-white cursor-pointer"
                >
                  {menuDockCollapsed ? 'Show Levels' : 'Hide Dock'}
                </button>
              </div>

              {!menuDockCollapsed && (
                <div className="rounded-2xl border border-white/10 bg-[#0B0E14]/90 p-3.5 shadow-2xl">
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                    {LEVELS.map((lvl) => {
                      const selected = lvl.id === selectedLevelId;
                      const done = save.completedLevels.includes(lvl.id);
                      const best = save.bestStuntScores[lvl.id] ?? 0;
                      return (
                        <button
                          key={lvl.id}
                          onClick={() => {
                            engineRef.current?.audio.unlock();
                            engineRef.current?.audio.playClick();
                            setSelectedLevelId(lvl.id);
                          }}
                          className={`rounded-xl border p-3 text-left transition-colors cursor-pointer ${
                            selected
                              ? 'border-amber-400 bg-amber-500/12'
                              : 'border-white/10 bg-[#141A28]/90 hover:border-white/25'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono-tabular text-[11px] font-semibold text-amber-400">
                              Level 0{lvl.id}
                            </span>
                            {done && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />}
                          </div>
                          <div className="mt-0.5 font-display text-sm font-bold text-white truncate">
                            {lvl.name}
                          </div>
                          <div className="mt-1 text-[11px] text-slate-400 truncate">
                            {lvl.mission.minCoins} coins · {lvl.mission.minStuntScore} pts ·{' '}
                            {lvl.mission.maxJumpDistM}m jump
                          </div>
                          <div className="mt-1.5 flex items-center justify-between text-[11px]">
                            <span className="text-amber-300 font-mono-tabular">
                              +{lvl.mission.rewardCoins} reward
                            </span>
                            {best > 0 && (
                              <span className="text-slate-400 font-mono-tabular">
                                Best {best.toLocaleString()}
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3">
                    <div className="flex items-center gap-3 text-xs text-slate-300">
                      <span>
                        Mission: Collect {activeLevel.mission.minCoins} coins,{' '}
                        {activeLevel.mission.minRings} sky rings,{' '}
                        {activeLevel.mission.minCheckpoints} gates &amp;{' '}
                        {activeLevel.mission.minStuntScore.toLocaleString()} stunt pts
                      </span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <button
                        onClick={() => triggerRewardedAd(250, 'bonus_coins')}
                        className="flex items-center gap-1.5 rounded-lg border border-emerald-400/40 bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/25 cursor-pointer whitespace-nowrap shrink-0"
                      >
                        <PlayCircle className="h-4 w-4" />
                        <span>Free +250 Coins (Ad)</span>
                      </button>
                      <button
                        onClick={() => launchLevel(activeLevel)}
                        className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-5 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400 cursor-pointer whitespace-nowrap shrink-0"
                      >
                        <Play className="h-4 w-4 fill-current" />
                        <span>Start Level {activeLevel.id}</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ACTIVE GAMEPLAY HUD */}
        {screen === 'playing' && (
          <GameHud
            level={activeLevel}
            telemetry={telemetry}
            stuntToast={stuntToast}
            cameraMode={cameraMode}
            muted={save.muted}
            touchControlsEnabled={save.touchControlsEnabled}
            onToggleCamera={() => {
              const next = engineRef.current?.cycleCameraMode();
              if (next) setCameraMode(next);
            }}
            onResetCar={() => engineRef.current?.resetCarToSpawn()}
            onToggleMute={() => setSave((prev) => ({ ...prev, muted: !prev.muted }))}
            onToggleTouchControls={() =>
              setSave((prev) => ({
                ...prev,
                touchControlsEnabled: !prev.touchControlsEnabled,
              }))
            }
            onPause={() => {
              engineRef.current?.setPaused(true);
              setScreen('paused');
            }}
            onFinishEarly={() => engineRef.current?.finishLevel()}
            onTouchChange={handleTouchChange}
          />
        )}

        {/* PAUSE MODAL */}
        {screen === 'paused' && (
          <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/75 p-4">
            <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#111622] p-6 text-center shadow-2xl">
              <PauseCircle className="mx-auto h-10 w-10 text-amber-400" />
              <h2 className="mt-3 font-display text-xl font-bold text-white">Race Paused</h2>
              <p className="mt-1 text-xs text-slate-400">{activeLevel.name}</p>
              <div className="mt-5 space-y-2.5">
                <button
                  onClick={() => {
                    engineRef.current?.setPaused(false);
                    setScreen('playing');
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 py-2.5 text-sm font-bold text-slate-950 hover:bg-amber-400 cursor-pointer"
                >
                  <Play className="h-4 w-4 fill-current" />
                  <span>Resume Driving</span>
                </button>
                <button
                  onClick={() => launchLevel(activeLevel)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-[#171D2B] py-2.5 text-sm font-semibold text-white hover:bg-white/10 cursor-pointer"
                >
                  <RotateCcw className="h-4 w-4" />
                  <span>Restart Level</span>
                </button>
                <button
                  onClick={() => setScreen('menu')}
                  className="w-full rounded-xl border border-white/10 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/5 cursor-pointer"
                >
                  Exit to Menu
                </button>
              </div>
            </div>
          </div>
        )}

        {/* LEVEL COMPLETE SUMMARY + POST-LEVEL INTERSTITIAL & REWARDED DOUBLE */}
        {screen === 'level_complete' && levelResult && (
          <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/80 p-4">
            <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#111622] p-6 shadow-2xl">
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-12 w-12 items-center justify-center rounded-xl ${
                    levelResult.missionPassed
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-amber-500/20 text-amber-400'
                  }`}
                >
                  {levelResult.missionPassed ? (
                    <Trophy className="h-6 w-6" />
                  ) : (
                    <Award className="h-6 w-6" />
                  )}
                </div>
                <div>
                  <h2 className="font-display text-xl font-bold text-white">
                    {levelResult.missionPassed ? 'Mission Complete' : 'Run Finished'}
                  </h2>
                  <p className="text-xs text-slate-400">{levelResult.levelName}</p>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3 rounded-xl border border-white/10 bg-[#171D2B] p-4 text-xs">
                <div>
                  <div className="text-slate-400">Stunt Score</div>
                  <div className="font-mono-tabular text-base font-bold text-amber-400">
                    {levelResult.stuntScore.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-slate-400">Coins Earned</div>
                  <div className="font-mono-tabular text-base font-bold text-emerald-400">
                    +
                    {(rewardDoubled
                      ? levelResult.totalCoinsEarned * 2
                      : levelResult.totalCoinsEarned
                    ).toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-slate-400">Max Jump Distance</div>
                  <div className="font-mono-tabular text-sm font-semibold text-white">
                    {levelResult.maxJumpDistM} m
                  </div>
                </div>
                <div>
                  <div className="text-slate-400">Peak Speed</div>
                  <div className="font-mono-tabular text-sm font-semibold text-cyan-400">
                    {levelResult.topSpeedKmh} km/h
                  </div>
                </div>
              </div>

              {!rewardDoubled && (
                <button
                  onClick={() =>
                    triggerRewardedAd(levelResult.totalCoinsEarned, 'double_reward')
                  }
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-400/40 bg-emerald-500/15 py-2.5 text-xs font-bold text-emerald-300 hover:bg-emerald-500/25 cursor-pointer"
                >
                  <PlayCircle className="h-4 w-4" />
                  <span>
                    Watch Ad to Double Reward (+{levelResult.totalCoinsEarned} Bonus Coins)
                  </span>
                </button>
              )}

              <div className="mt-4 flex gap-3">
                <button
                  onClick={() =>
                    runAfterInterstitialBreak(() => setScreen('menu'))
                  }
                  className="flex-1 rounded-xl border border-white/15 bg-[#171D2B] py-2.5 text-xs font-semibold text-slate-200 hover:bg-white/10 cursor-pointer"
                >
                  Main Menu
                </button>
                <button
                  onClick={() => {
                    const nextLevel =
                      LEVELS.find((l) => l.id === levelResult.levelId + 1) ?? LEVELS[0];
                    runAfterInterstitialBreak(() => launchLevel(nextLevel));
                  }}
                  className="flex-1 rounded-xl bg-amber-500 py-2.5 text-xs font-bold text-slate-950 hover:bg-amber-400 cursor-pointer"
                >
                  Next Level
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Non-blocking Menu Bottom Banner Ad (hidden during active driving!) */}
      <UnityBannerBar visible={screen === 'menu'} adConfig={adConfig} />

      {/* Garage Modal */}
      {garageOpen && (
        <GarageModal
          save={save}
          onClose={() => setGarageOpen(false)}
          onSelectCar={handleSelectCar}
          onUnlockCar={handleUnlockCar}
          onSelectPaint={handleSelectPaint}
          onUpgradeStat={handleUpgradeStat}
          onWatchRewardedAd={() => triggerRewardedAd(250, 'bonus_coins')}
        />
      )}

      {/* Android Studio Project & Unity Ads SDK Inspector */}
      {androidModalOpen && (
        <AndroidStudioModal
          adConfig={adConfig}
          adLogs={adLogs}
          onToggleTestMode={() => {
            setAdConfig((prev) => {
              const nextMode = !prev.testMode;
              appendAdLog(
                'UnityAds.testMode',
                nextMode ? 'Switched to Test Mode (Debug)' : 'Switched to Production Mode (Release)'
              );
              return { ...prev, testMode: nextMode };
            });
          }}
          onClose={() => setAndroidModalOpen(false)}
        />
      )}

      {/* Web Preview Fullscreen Interstitial / Rewarded Video Simulator */}
      <UnityFullScreenAdModal
        adType={activeWebAd?.type ?? null}
        adConfig={adConfig}
        rewardAmount={activeWebAd?.rewardAmount ?? 0}
        onComplete={handleWebAdComplete}
      />
    </div>
  );
}
