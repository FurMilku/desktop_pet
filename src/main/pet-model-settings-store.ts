import * as fs from 'fs';
import {
  migrateLegacySequencesForModel,
  sanitizeClickAnimationForModel,
} from './click-sequence-store';
import { DEFAULT_MODEL_SCALE } from '../shared/config/pet-desktop-settings';
import {
  createDefaultPetModelSettings,
  normalizePetModelSettings,
  petModelSettingsForStorage,
  type PetModelSettings,
} from '../shared/config/pet-model-settings';
import { getLogger } from './logger';
import { resolvePetModelSettingsFilePath } from './utils/pet-model-path';

const logger = getLogger('pet-model-settings');

/**
 * 加载模型设置；文件不存在时自动创建默认 JSON
 */
export function loadPetModelSettings(
  modelFileName?: string | null
): PetModelSettings {
  const filePath = resolvePetModelSettingsFilePath(modelFileName);
  if (!filePath) {
    return createDefaultPetModelSettings();
  }

  if (!fs.existsSync(filePath)) {
    const defaults = createDefaultPetModelSettings();
    savePetModelSettings(modelFileName, defaults);
    logger.info('Created default model settings', { filePath });
    return defaults;
  }

  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Partial<PetModelSettings>;
    let settings = normalizePetModelSettings(raw);
    migrateLegacySequencesForModel(modelFileName, settings.clickAnimation);
    const sanitizedClick = sanitizeClickAnimationForModel(
      settings.clickAnimation,
      modelFileName
    );
    const clickChanged =
      sanitizedClick.activeSequenceId !== settings.clickAnimation.activeSequenceId ||
      sanitizedClick.pool.length !== settings.clickAnimation.pool.length ||
      sanitizedClick.pool.some(
        (e, i) => e.clipName !== settings.clickAnimation.pool[i]?.clipName
      );
    if (clickChanged) {
      settings = { ...settings, clickAnimation: sanitizedClick };
      savePetModelSettings(modelFileName, settings);
      logger.info('Removed invalid cross-model click sequence references', {
        modelFileName,
      });
    }
    return settings;
  } catch (error) {
    logger.warn('Failed to load model settings, using defaults', { filePath, error });
    return createDefaultPetModelSettings();
  }
}

export function savePetModelSettings(
  modelFileName: string | null | undefined,
  settings: PetModelSettings
): PetModelSettings {
  const filePath = resolvePetModelSettingsFilePath(modelFileName);
  if (!filePath) {
    throw new Error('Model settings path unavailable');
  }

  const normalized = normalizePetModelSettings(settings);
  const sanitizedClick = sanitizeClickAnimationForModel(
    normalized.clickAnimation,
    modelFileName
  );
  const toStore = petModelSettingsForStorage({
    ...normalized,
    clickAnimation: sanitizedClick,
  });
  fs.writeFileSync(filePath, JSON.stringify(toStore, null, 2), 'utf-8');
  logger.info('Model settings saved', { filePath });
  return toStore;
}

/** 仅更新模型 JSON 中的包围盒尺寸字段 */
export function updatePetModelResolution(
  modelFileName: string | null | undefined,
  resolution: { width: number; height: number; depth: number }
): void {
  const filePath = resolvePetModelSettingsFilePath(modelFileName);
  if (!filePath) {
    return;
  }

  const current = loadPetModelSettings(modelFileName);
  savePetModelSettings(modelFileName, {
    ...current,
    modelResolution: resolution,
  });
}

/** 将旧版数据库中的模型字段迁移到当前模型的 JSON（仅当 JSON 尚不存在） */
export function migrateLegacyModelFieldsToJson(
  modelFileName: string | null | undefined,
  legacy: {
    modelScale?: number;
    modelBrightness?: number;
    clickAnimation?: PetModelSettings['clickAnimation'];
  }
): void {
  const filePath = resolvePetModelSettingsFilePath(modelFileName);
  if (!filePath || fs.existsSync(filePath)) {
    return;
  }

  savePetModelSettings(modelFileName, {
    ...createDefaultPetModelSettings(),
    modelScale: legacy.modelScale ?? DEFAULT_MODEL_SCALE,
    modelBrightness: legacy.modelBrightness ?? 1,
    clickAnimation: legacy.clickAnimation ?? createDefaultPetModelSettings().clickAnimation,
  });
  logger.info('Migrated legacy DB model fields to per-model JSON', { filePath });
}
