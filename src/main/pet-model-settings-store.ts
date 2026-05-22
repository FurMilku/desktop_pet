import * as fs from 'fs';
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
    return normalizePetModelSettings(raw);
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

  const normalized = petModelSettingsForStorage(normalizePetModelSettings(settings));
  fs.writeFileSync(filePath, JSON.stringify(normalized, null, 2), 'utf-8');
  logger.info('Model settings saved', { filePath });
  return normalized;
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
    modelScale: legacy.modelScale ?? 1,
    modelBrightness: legacy.modelBrightness ?? 1,
    clickAnimation: legacy.clickAnimation ?? createDefaultPetModelSettings().clickAnimation,
  });
  logger.info('Migrated legacy DB model fields to per-model JSON', { filePath });
}
