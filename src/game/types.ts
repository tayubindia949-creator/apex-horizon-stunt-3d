export type CarId = 'valkyrie' | 'viper' | 'titan' | 'phantom';

export type PaintId = 'amber' | 'cobalt' | 'crimson' | 'obsidian' | 'glacier' | 'emerald';

export type CameraMode = 'chase' | 'dynamic' | 'hood';

export type GameScreen = 'menu' | 'playing' | 'paused' | 'level_complete';

export interface UpgradeLevels {
  engine: number;     // 1..5
  nitro: number;      // 1..5
  suspension: number; // 1..5
}

export interface CarSpec {
  id: CarId;
  name: string;
  classLabel: string;
  description: string;
  price: number;
  baseSpeed: number;      // km/h top speed
  baseAccel: number;      // m/s^2
  baseHandling: number;   // turn responsiveness
  baseNitroPower: number; // boost multiplier
  bodyStyle: 'coupe' | 'hyper' | 'baja' | 'proto';
  defaultPaint: PaintId;
}

export interface PaintFinish {
  id: PaintId;
  name: string;
  hex: string;
  metalness: number;
  roughness: number;
  clearcoat: number;
}

export interface RampDef {
  id: string;
  x: number;
  z: number;
  width: number;
  length: number;
  height: number;
  yaw: number; // radians, direction of climb (+Z local when yaw=0)
  isBoost?: boolean;
}

export interface RingDef {
  id: string;
  x: number;
  y: number;
  z: number;
  radius: number;
  yaw: number;
  points: number;
}

export interface CoinDef {
  id: string;
  x: number;
  y: number;
  z: number;
  value: number;
}

export interface CheckpointDef {
  id: string;
  x: number;
  z: number;
  width: number;
  yaw: number;
}

export interface PillarObstacleDef {
  x: number;
  z: number;
  radius: number;
  height: number;
}

export interface LevelMission {
  minCoins: number;
  minStuntScore: number;
  minRings: number;
  minCheckpoints: number;
  minTopSpeedKmh: number;
  maxJumpDistM: number;
  timeLimitSec: number;
  rewardCoins: number;
}

export interface LevelDef {
  id: number;
  name: string;
  subtitle: string;
  theme: 'coastal' | 'canyon' | 'midnight' | 'summit';
  skyColor: string;
  fogColor: string;
  fogDensity: number;
  groundColor: string;
  trackColor: string;
  accentColor: string;
  arenaHalfSize: number;
  spawnPos: [number, number, number];
  spawnYaw: number;
  ramps: RampDef[];
  rings: RingDef[];
  coins: CoinDef[];
  checkpoints: CheckpointDef[];
  pillars: PillarObstacleDef[];
  mission: LevelMission;
}

export interface SaveData {
  coins: number;
  unlockedCars: CarId[];
  selectedCar: CarId;
  carUpgrades: Record<CarId, UpgradeLevels>;
  carPaints: Record<CarId, PaintId>;
  completedLevels: number[];
  bestStuntScores: Record<number, number>;
  muted: boolean;
  touchControlsEnabled: boolean;
}

export interface StuntToast {
  id: number;
  label: string;
  points: number;
}

export interface HudTelemetry {
  speedKmh: number;
  gear: string;
  rpmRatio: number;
  nitroRatio: number;
  isNitroActive: boolean;
  isAirborne: boolean;
  airTimeSec: number;
  lastJumpDistM: number;
  maxJumpDistM: number;
  topSpeedKmh: number;
  stuntScore: number;
  coinsCollected: number;
  totalCoinsInLevel: number;
  ringsCleared: number;
  totalRingsInLevel: number;
  checkpointsCleared: number;
  totalCheckpointsInLevel: number;
  timeRemainingSec: number;
  missionComplete: boolean;
}

export interface LevelResult {
  levelId: number;
  levelName: string;
  missionPassed: boolean;
  stuntScore: number;
  coinsCollected: number;
  baseRewardCoins: number;
  stuntBonusCoins: number;
  totalCoinsEarned: number;
  maxJumpDistM: number;
  topSpeedKmh: number;
  ringsCleared: number;
  checkpointsCleared: number;
}

export interface ControlInputState {
  throttle: boolean;
  brake: boolean;
  left: boolean;
  right: boolean;
  nitro: boolean;
}
