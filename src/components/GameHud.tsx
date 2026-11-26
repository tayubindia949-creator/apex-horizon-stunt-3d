import React from 'react';
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Flame,
  Gamepad2,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { CameraMode, ControlInputState, HudTelemetry, LevelDef, StuntToast } from '../game/types';

interface GameHudProps {
  level: LevelDef;
  telemetry: HudTelemetry;
  stuntToast: StuntToast | null;
  cameraMode: CameraMode;
  muted: boolean;
  touchControlsEnabled: boolean;
  onToggleCamera: () => void;
  onResetCar: () => void;
  onToggleMute: () => void;
  onToggleTouchControls: () => void;
  onPause: () => void;
  onFinishEarly: () => void;
  onTouchChange: (key: keyof ControlInputState, active: boolean) => void;
}

export const GameHud: React.FC<GameHudProps> = ({
  level,
  telemetry,
  stuntToast,
  cameraMode,
  muted,
  touchControlsEnabled,
  onToggleCamera,
  onResetCar,
  onToggleMute,
  onToggleTouchControls,
  onPause,
  onFinishEarly,
  onTouchChange,
}) => {
  const m = level.mission;

  const bindTouch = (key: keyof ControlInputState) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      onTouchChange(key, true);
    },
    onPointerUp: (e: React.PointerEvent) => {
      e.preventDefault();
      onTouchChange(key, false);
    },
    onPointerCancel: () => onTouchChange(key, false),
    onLostPointerCapture: () => onTouchChange(key, false),
  });

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between p-3 sm:p-5">
      {/* Top HUD Row */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        {/* Top-Left: Speedometer & Nitro */}
        <div className="pointer-events-auto min-w-[172px] rounded-xl border border-white/10 bg-[#0B0E14]/88 px-4 py-3 shadow-lg">
          <div className="flex items-baseline justify-between gap-4">
            <div className="flex items-baseline gap-1.5">
              <span className="font-display text-3xl font-bold tracking-tight text-white tabular-nums">
                {telemetry.speedKmh}
              </span>
              <span className="text-xs font-medium text-slate-400">km/h</span>
            </div>
            <span
              className={`font-display text-sm font-bold ${
                telemetry.gear === 'AIR'
                  ? 'text-cyan-400'
                  : telemetry.gear === 'R'
                  ? 'text-rose-400'
                  : 'text-amber-400'
              }`}
            >
              {telemetry.gear === 'AIR' ? 'AIRBORNE' : `GEAR ${telemetry.gear}`}
            </span>
          </div>

          <div className="mt-2.5">
            <div className="mb-1 flex items-center justify-between text-[11px] font-medium text-slate-400">
              <span>Nitro Boost</span>
              <span className="font-mono-tabular text-cyan-400">
                {Math.round(telemetry.nitroRatio * 100)}%
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded bg-slate-800">
              <div
                className={`h-full transition-all duration-75 ${
                  telemetry.isNitroActive ? 'bg-cyan-300' : 'bg-cyan-500'
                }`}
                style={{ width: `${Math.round(telemetry.nitroRatio * 100)}%` }}
              />
            </div>
          </div>

          <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
            <span>Stunt Score</span>
            <span className="font-mono-tabular font-semibold text-amber-400">
              {telemetry.stuntScore.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Top-Center: Compact Mission Tracker */}
        <div className="pointer-events-auto hidden md:flex items-center gap-5 rounded-xl border border-white/10 bg-[#0B0E14]/88 px-5 py-2.5 shadow-lg">
          <div>
            <div className="text-[11px] text-slate-400">Timer</div>
            <div
              className={`font-mono-tabular text-lg font-bold ${
                telemetry.timeRemainingSec <= 15 ? 'text-rose-400' : 'text-white'
              }`}
            >
              {telemetry.timeRemainingSec}s
            </div>
          </div>
          <div className="h-7 w-px bg-white/10" />
          <div>
            <div className="text-[11px] text-slate-400">Coins</div>
            <div className="font-mono-tabular text-sm font-semibold text-amber-400">
              {telemetry.coinsCollected} / {m.minCoins}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-slate-400">Sky Rings</div>
            <div className="font-mono-tabular text-sm font-semibold text-emerald-400">
              {telemetry.ringsCleared} / {m.minRings}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-slate-400">Gates</div>
            <div className="font-mono-tabular text-sm font-semibold text-cyan-400">
              {telemetry.checkpointsCleared} / {m.minCheckpoints}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-slate-400">Jump Goal</div>
            <div className="font-mono-tabular text-sm font-semibold text-slate-200">
              {telemetry.maxJumpDistM}m / {m.maxJumpDistM}m
            </div>
          </div>
          {telemetry.missionComplete && (
            <button
              onClick={onFinishEarly}
              className="ml-1 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 transition-colors hover:bg-emerald-400 whitespace-nowrap shrink-0 cursor-pointer"
            >
              Finish Run
            </button>
          )}
        </div>

        {/* Top-Right: Utility Action Bar */}
        <div className="pointer-events-auto flex items-center gap-2">
          <div className="flex md:hidden items-center gap-2 rounded-xl border border-white/10 bg-[#0B0E14]/88 px-3 py-2 text-xs font-mono-tabular">
            <span className={telemetry.timeRemainingSec <= 15 ? 'text-rose-400 font-bold' : 'text-white font-semibold'}>
              {telemetry.timeRemainingSec}s
            </span>
            <span className="text-slate-600">·</span>
            <span className="text-amber-400">
              {telemetry.coinsCollected}/{m.minCoins}c
            </span>
            <span className="text-slate-600">·</span>
            <span className="text-emerald-400">
              {telemetry.ringsCleared}/{m.minRings}r
            </span>
          </div>

          <button
            onClick={onToggleCamera}
            title="Switch Camera (C)"
            className="flex h-11 items-center gap-1.5 rounded-xl border border-white/10 bg-[#0B0E14]/88 px-3 text-xs font-medium text-slate-200 hover:bg-slate-800 cursor-pointer whitespace-nowrap shrink-0"
          >
            <Camera className="h-4 w-4 text-amber-400" />
            <span className="hidden sm:inline capitalize">{cameraMode}</span>
          </button>

          <button
            onClick={onResetCar}
            title="Reset Car (R)"
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-[#0B0E14]/88 text-slate-200 hover:bg-slate-800 cursor-pointer"
          >
            <RotateCcw className="h-4 w-4" />
          </button>

          <button
            onClick={onToggleTouchControls}
            title="Toggle Mobile Touch Controls"
            className={`flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 cursor-pointer ${
              touchControlsEnabled ? 'bg-amber-500/20 text-amber-300' : 'bg-[#0B0E14]/88 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Gamepad2 className="h-4 w-4" />
          </button>

          <button
            onClick={onToggleMute}
            title={muted ? 'Unmute Sound' : 'Mute Sound'}
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-[#0B0E14]/88 text-slate-200 hover:bg-slate-800 cursor-pointer"
          >
            {muted ? <VolumeX className="h-4 w-4 text-rose-400" /> : <Volume2 className="h-4 w-4 text-emerald-400" />}
          </button>

          <button
            onClick={onPause}
            title="Pause (Esc)"
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-[#0B0E14]/88 text-slate-200 hover:bg-slate-800 cursor-pointer"
          >
            <Pause className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Center Stunt Toast */}
      {stuntToast && (
        <div
          key={stuntToast.id}
          className="mx-auto rounded-lg border border-amber-400/40 bg-[#0B0E14]/90 px-5 py-2 text-center shadow-xl"
        >
          <div className="font-display text-lg font-bold tracking-wide text-amber-400">
            {stuntToast.label}
          </div>
          <div className="font-mono-tabular text-xs font-semibold text-white">
            +{stuntToast.points} Stunt Points
          </div>
        </div>
      )}

      {/* Bottom Controls Row */}
      <div className="flex items-end justify-between gap-4">
        {touchControlsEnabled ? (
          <>
            {/* Left Hand: Steering */}
            <div className="pointer-events-auto flex items-center gap-3">
              <button
                {...bindTouch('left')}
                aria-label="Steer Left"
                className="flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-2xl border border-white/15 bg-[#0B0E14]/82 text-white active:scale-95 active:border-amber-400 active:bg-amber-500/25 select-none touch-none"
              >
                <ChevronLeft className="h-8 w-8" />
              </button>
              <button
                {...bindTouch('right')}
                aria-label="Steer Right"
                className="flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-2xl border border-white/15 bg-[#0B0E14]/82 text-white active:scale-95 active:border-amber-400 active:bg-amber-500/25 select-none touch-none"
              >
                <ChevronRight className="h-8 w-8" />
              </button>
            </div>

            {/* Right Hand: Brake, Nitro, Throttle */}
            <div className="pointer-events-auto flex items-end gap-3">
              <button
                {...bindTouch('brake')}
                aria-label="Brake or Reverse"
                className="flex h-16 w-16 sm:h-18 sm:w-18 flex-col items-center justify-center rounded-2xl border border-rose-500/35 bg-[#0B0E14]/85 text-xs font-semibold text-rose-300 active:scale-95 active:bg-rose-500/30 select-none touch-none"
              >
                Brake
              </button>
              <button
                {...bindTouch('nitro')}
                aria-label="Nitro Boost"
                className="flex h-16 w-16 sm:h-18 sm:w-18 flex-col items-center justify-center gap-0.5 rounded-2xl border border-cyan-400/45 bg-cyan-950/75 text-xs font-semibold text-cyan-300 active:scale-95 active:bg-cyan-500/35 select-none touch-none"
              >
                <Flame className="h-5 w-5" />
                <span>Nitro</span>
              </button>
              <button
                {...bindTouch('throttle')}
                aria-label="Accelerate"
                className="flex h-20 w-20 sm:h-24 sm:w-22 flex-col items-center justify-center rounded-2xl border border-amber-400/50 bg-amber-500/20 text-sm font-bold text-amber-300 active:scale-95 active:bg-amber-500/40 select-none touch-none"
              >
                Gas
              </button>
            </div>
          </>
        ) : (
          <div className="mx-auto rounded-lg border border-white/10 bg-[#0B0E14]/82 px-4 py-1.5 text-xs text-slate-300">
            WASD / Arrows to Drive · Space for Nitro · R to Reset · C for Camera · Esc to Pause
          </div>
        )}
      </div>
    </div>
  );
};
