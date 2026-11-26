import React from 'react';
import { Check, Coins, Lock, PlayCircle, Wrench, X } from 'lucide-react';
import {
  CAR_CATALOG,
  getEffectiveCarStats,
  getUpgradeCost,
  PAINT_FINISHES,
} from '../game/catalog';
import { CarId, PaintId, SaveData, UpgradeLevels } from '../game/types';

interface GarageModalProps {
  save: SaveData;
  onClose: () => void;
  onSelectCar: (id: CarId) => void;
  onUnlockCar: (id: CarId, price: number) => void;
  onSelectPaint: (carId: CarId, paintId: PaintId) => void;
  onUpgradeStat: (carId: CarId, stat: keyof UpgradeLevels, cost: number) => void;
  onWatchRewardedAd: () => void;
}

export const GarageModal: React.FC<GarageModalProps> = ({
  save,
  onClose,
  onSelectCar,
  onUnlockCar,
  onSelectPaint,
  onUpgradeStat,
  onWatchRewardedAd,
}) => {
  const activeCar = CAR_CATALOG.find((c) => c.id === save.selectedCar) ?? CAR_CATALOG[0];
  const isUnlocked = save.unlockedCars.includes(activeCar.id);
  const upgrades = save.carUpgrades[activeCar.id];
  const activePaint = save.carPaints[activeCar.id];
  const stats = getEffectiveCarStats(activeCar, upgrades);

  const upgradeItems: { key: keyof UpgradeLevels; label: string; desc: string }[] = [
    { key: 'engine', label: 'Twin-Turbo Engine', desc: '+11 km/h top speed & faster acceleration' },
    { key: 'nitro', label: 'Nitrous Injection', desc: '+0.65s boost tank & stronger thrust' },
    { key: 'suspension', label: 'Stunt Suspension', desc: 'Sharper corner grip & smooth jump landings' },
  ];

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/70 p-3 sm:p-6">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#111622] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <h2 className="font-display text-xl font-bold text-white">Garage &amp; Tuning Bay</h2>
            <p className="text-xs text-slate-400">
              Select vehicles, customize clearcoat finishes, and upgrade performance
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-amber-400 font-mono-tabular">
              <Coins className="h-4 w-4" />
              <span>{save.coins.toLocaleString()}</span>
            </div>
            <button
              onClick={onWatchRewardedAd}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400 cursor-pointer whitespace-nowrap shrink-0"
            >
              <PlayCircle className="h-4 w-4" />
              <span>Watch Ad (+250 Coins)</span>
            </button>
            <button
              onClick={onClose}
              aria-label="Close Garage"
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 text-slate-300 hover:bg-white/5 cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="grid flex-1 grid-cols-1 gap-5 overflow-y-auto p-5 lg:grid-cols-12">
          {/* Left Column: Car Roster */}
          <div className="space-y-2.5 lg:col-span-5">
            <div className="text-xs font-semibold text-slate-400">Vehicles</div>
            {CAR_CATALOG.map((car) => {
              const unlocked = save.unlockedCars.includes(car.id);
              const selected = save.selectedCar === car.id;
              return (
                <div
                  key={car.id}
                  onClick={() => onSelectCar(car.id)}
                  className={`cursor-pointer rounded-xl border p-3.5 transition-colors ${
                    selected
                      ? 'border-amber-400/70 bg-amber-500/10'
                      : 'border-white/10 bg-[#171D2B] hover:border-white/25'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="font-display text-base font-bold text-white">{car.name}</div>
                      <div className="text-xs text-slate-400">
                        {car.classLabel} · {car.baseSpeed} km/h base
                      </div>
                    </div>
                    {unlocked ? (
                      selected ? (
                        <span className="flex items-center gap-1 text-xs font-semibold text-amber-400">
                          <Check className="h-3.5 w-3.5" /> Equipped
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">Owned</span>
                      )
                    ) : (
                      <span className="flex items-center gap-1 text-xs font-semibold text-amber-400 font-mono-tabular">
                        <Lock className="h-3.5 w-3.5" /> {car.price}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right Column: Selected Car Specs, Paint & Upgrades */}
          <div className="space-y-5 lg:col-span-7">
            <div className="rounded-xl border border-white/10 bg-[#171D2B] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-display text-lg font-bold text-white">{activeCar.name}</h3>
                  <p className="mt-1 text-xs text-slate-300 leading-relaxed">{activeCar.description}</p>
                </div>
                {!isUnlocked && (
                  <button
                    disabled={save.coins < activeCar.price}
                    onClick={() => onUnlockCar(activeCar.id, activeCar.price)}
                    className={`rounded-lg px-4 py-2 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer ${
                      save.coins >= activeCar.price
                        ? 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                        : 'bg-slate-700 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    Unlock for {activeCar.price} Coins
                  </button>
                )}
              </div>

              <div className="mt-4 grid grid-cols-3 gap-3 border-t border-white/10 pt-3 text-xs">
                <div>
                  <div className="text-slate-400">Top Speed</div>
                  <div className="font-mono-tabular text-sm font-bold text-white">
                    {stats.topSpeedKmh} km/h
                  </div>
                </div>
                <div>
                  <div className="text-slate-400">Acceleration</div>
                  <div className="font-mono-tabular text-sm font-bold text-amber-400">
                    {stats.accel.toFixed(1)} m/s²
                  </div>
                </div>
                <div>
                  <div className="text-slate-400">Nitro Tank</div>
                  <div className="font-mono-tabular text-sm font-bold text-cyan-400">
                    {stats.nitroDurationSec.toFixed(1)}s
                  </div>
                </div>
              </div>
            </div>

            {/* Paint Selector */}
            <div>
              <div className="mb-2 text-xs font-semibold text-slate-400">Clearcoat Finish</div>
              <div className="flex flex-wrap gap-2.5">
                {PAINT_FINISHES.map((paint) => {
                  const active = activePaint === paint.id;
                  return (
                    <button
                      key={paint.id}
                      onClick={() => onSelectPaint(activeCar.id, paint.id)}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium cursor-pointer ${
                        active
                          ? 'border-amber-400 bg-amber-500/15 text-white'
                          : 'border-white/10 bg-[#171D2B] text-slate-300 hover:border-white/25'
                      }`}
                    >
                      <span
                        className="h-3.5 w-3.5 rounded-sm border border-white/20"
                        style={{ backgroundColor: paint.hex }}
                      />
                      <span>{paint.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Performance Upgrades */}
            <div className="space-y-2.5">
              <div className="text-xs font-semibold text-slate-400">Performance Upgrades</div>
              {upgradeItems.map((item) => {
                const lvl = upgrades[item.key];
                const maxed = lvl >= 5;
                const cost = getUpgradeCost(lvl);
                const canBuy = isUnlocked && !maxed && save.coins >= cost;
                return (
                  <div
                    key={item.key}
                    className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#171D2B] px-4 py-3"
                  >
                    <div>
                      <div className="flex items-center gap-2 text-sm font-semibold text-white">
                        <Wrench className="h-3.5 w-3.5 text-amber-400" />
                        <span>{item.label}</span>
                        <span className="font-mono-tabular text-xs text-slate-400">
                          Lv {lvl} / 5
                        </span>
                      </div>
                      <div className="mt-0.5 text-xs text-slate-400">{item.desc}</div>
                    </div>
                    <button
                      disabled={!canBuy}
                      onClick={() => onUpgradeStat(activeCar.id, item.key, cost)}
                      className={`rounded-lg px-3.5 py-2 text-xs font-semibold whitespace-nowrap shrink-0 ${
                        maxed
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : canBuy
                          ? 'bg-amber-500 text-slate-950 hover:bg-amber-400 cursor-pointer'
                          : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      {maxed ? 'Maxed' : !isUnlocked ? 'Locked' : `Upgrade · ${cost}`}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
