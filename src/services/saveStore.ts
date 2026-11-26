import { DEFAULT_SAVE_DATA } from '../game/catalog';
import { SaveData } from '../game/types';

const STORAGE_KEY = 'apex_horizon_stunt3d_save_v1';

export function loadSaveData(): SaveData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SAVE_DATA;
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    return {
      ...DEFAULT_SAVE_DATA,
      ...parsed,
      carUpgrades: {
        ...DEFAULT_SAVE_DATA.carUpgrades,
        ...(parsed.carUpgrades ?? {}),
      },
      carPaints: {
        ...DEFAULT_SAVE_DATA.carPaints,
        ...(parsed.carPaints ?? {}),
      },
      bestStuntScores: {
        ...DEFAULT_SAVE_DATA.bestStuntScores,
        ...(parsed.bestStuntScores ?? {}),
      },
    };
  } catch {
    return DEFAULT_SAVE_DATA;
  }
}

export function persistSaveData(data: SaveData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore storage quota errors
  }
}
