import { getGlobalDatabaseService } from '../shared/services/database';

import {
  clickAnimationSettingsForStorage,
  createDefaultPetDesktopConfig,
  extractGlobalDesktopConfig,
  mergeGlobalAndModelSettings,
  normalizePetDesktopConfig,
  parseSequencePoolKey,
  PET_DESKTOP_CONFIG_KEY,
  type ClickAnimationSettings,
  type PetDesktopConfig,
  type PetGlobalDesktopConfig,
} from '../shared/config/pet-desktop-settings';

import {

  loadClickSequence,

  loadClickSequenceSteps,

  saveClickSequence,

} from './click-sequence-store';

import {
  loadPetModelSettings,
  migrateLegacyModelFieldsToJson,
  savePetModelSettings,
  updatePetModelResolution,
} from './pet-model-settings-store';

import { getWindowManager } from './window-manager';

import { getLogger } from './logger';



const logger = getLogger('pet-desktop-config');



let cachedConfig: PetDesktopConfig | null = null;

let cachedClipNames: string[] = [];



function getFallbackPosition(): { x: number; y: number; monitor: number } | undefined {

  try {

    const wm = getWindowManager();

    const state = wm.getWindowState();

    return {

      x: state.position.x,

      y: state.position.y,

      monitor: state.position.monitorId,

    };

  } catch {

    return undefined;

  }

}



/** 将旧版 DB 内嵌 sequence 迁移到模型目录 default.json */

function migrateLegacyInlineSequence(

  parsed: {

    clickAnimation?: { mode?: string; sequence?: { clipName: string; delayAfterMs?: number }[] };

  },

  modelFileName: string | null

): void {

  const ca = parsed.clickAnimation;

  if (ca?.mode !== 'sequence' || !Array.isArray(ca.sequence) || ca.sequence.length === 0) {

    return;

  }

  if (loadClickSequence('default', modelFileName)) {

    return;

  }

  try {

    saveClickSequence(

      'default',

      {

        version: 1,

        name: '默认序列',

        steps: ca.sequence.map((s) => ({

          clipName: s.clipName,

          delayAfterMs: Math.max(0, Number(s.delayAfterMs) || 0),

        })),

      },

      modelFileName

    );

    logger.info('Migrated legacy inline click sequence to default.json');

  } catch (error) {

    logger.warn('Legacy sequence migration failed', error);

  }

}



function loadGlobalDesktopConfig(): PetGlobalDesktopConfig {

  const fallbackPosition = getFallbackPosition();

  const base = createDefaultPetDesktopConfig(

    fallbackPosition ? { position: fallbackPosition } : undefined

  );



  const db = getGlobalDatabaseService();

  if (db.state !== 'open') {

    db.open();

  }



  try {

    const row = db.get<{ value: string }>(

      'SELECT value FROM settings WHERE key = ?',

      PET_DESKTOP_CONFIG_KEY

    );

    if (row?.value) {

      const parsed = JSON.parse(row.value) as Partial<PetDesktopConfig> & {

        clickAnimation?: { mode?: string; sequence?: { clipName: string; delayAfterMs?: number }[] };

      };



      const modelFileName =

        parsed.modelFileName !== undefined

          ? normalizePetDesktopConfig({ modelFileName: parsed.modelFileName }).modelFileName

          : base.modelFileName;



      migrateLegacyModelFieldsToJson(modelFileName, {

        modelScale: parsed.modelScale,

        modelBrightness: parsed.modelBrightness,

        clickAnimation: parsed.clickAnimation

          ? normalizePetDesktopConfig({ clickAnimation: parsed.clickAnimation }).clickAnimation

          : undefined,

      });



      migrateLegacyInlineSequence(parsed, modelFileName);



      return normalizePetDesktopConfig({

        windowWidth: parsed.windowWidth,

        windowHeight: parsed.windowHeight,

        modelFileName: parsed.modelFileName,

        fpsMonitorEnabled: parsed.fpsMonitorEnabled,

        fpsMonitorPosition: parsed.fpsMonitorPosition,

        position: parsed.position,

      });

    }

  } catch (error) {

    logger.warn('Failed to load pet desktop config', error);

  }



  return extractGlobalDesktopConfig(base);

}



function saveGlobalDesktopConfig(global: PetGlobalDesktopConfig): void {

  const db = getGlobalDatabaseService();

  if (db.state !== 'open') {

    db.open();

  }



  const normalized = normalizePetDesktopConfig(global);

  const toPersist = extractGlobalDesktopConfig(normalized);

  const now = Date.now();



  db.run(

    `INSERT INTO settings (key, value, updated_at)

     VALUES (?, ?, ?)

     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,

    PET_DESKTOP_CONFIG_KEY,

    JSON.stringify(toPersist),

    now

  );

}



export function getCachedAnimationClipNames(): string[] {

  return [...cachedClipNames];

}



export function setCachedAnimationClipNames(names: string[]): void {

  cachedClipNames = [...new Set(names.filter(Boolean))].sort();

}



export function loadPetDesktopConfig(): PetDesktopConfig {

  if (cachedConfig) {

    return cachedConfig;

  }



  const global = loadGlobalDesktopConfig();

  const modelSettings = loadPetModelSettings(global.modelFileName);

  cachedConfig = mergeGlobalAndModelSettings(global, modelSettings);

  return cachedConfig;

}



/** 按指定模型文件名加载合并配置（设置页切换模型下拉时用） */

export function loadPetDesktopConfigForModel(

  modelFileName: string | null

): PetDesktopConfig {

  const global = loadGlobalDesktopConfig();

  const modelSettings = loadPetModelSettings(modelFileName);

  return mergeGlobalAndModelSettings(

    { ...global, modelFileName: normalizePetDesktopConfig({ modelFileName }).modelFileName },

    modelSettings

  );

}



export function enrichClickAnimationSettings(

  settings: ClickAnimationSettings,

  modelFileName?: string | null

): ClickAnimationSettings {

  const steps = settings.activeSequenceId

    ? loadClickSequenceSteps(settings.activeSequenceId, modelFileName)

    : [];



  const sequenceStepsById: Record<string, ReturnType<typeof loadClickSequenceSteps>> = {};

  for (const entry of settings.pool) {

    const seqId = parseSequencePoolKey(entry.clipName);

    if (!seqId || sequenceStepsById[seqId]) {

      continue;

    }

    const seqSteps = loadClickSequenceSteps(seqId, modelFileName);

    if (seqSteps.length > 0) {

      sequenceStepsById[seqId] = seqSteps;

    }

  }



  return {

    ...settings,

    sequenceSteps: steps.length > 0 ? steps : undefined,

    sequenceStepsById:

      Object.keys(sequenceStepsById).length > 0 ? sequenceStepsById : undefined,

  };

}



export function enrichPetDesktopConfig(config: PetDesktopConfig): PetDesktopConfig {

  return {

    ...config,

    clickAnimation: enrichClickAnimationSettings(

      config.clickAnimation,

      config.modelFileName

    ),

  };

}



export function savePetDesktopConfig(config: PetDesktopConfig): PetDesktopConfig {

  const normalized = normalizePetDesktopConfig(config);

  const global = extractGlobalDesktopConfig(normalized);



  saveGlobalDesktopConfig(global);

  savePetModelSettings(normalized.modelFileName, {

    version: 1,

    modelScale: normalized.modelScale,

    modelBrightness: normalized.modelBrightness,

    sourceAnimationFps: normalized.sourceAnimationFps,

    playbackSpeed: normalized.playbackSpeed,

    clickAnimation: clickAnimationSettingsForStorage(normalized.clickAnimation),
  });



  cachedConfig = null;

  const merged = loadPetDesktopConfig();

  logger.info('Pet desktop config saved (global DB + per-model JSON)');

  return enrichPetDesktopConfig(merged);

}



export function clearPetDesktopConfigCache(): void {

  cachedConfig = null;

}

export function persistModelResolutionForFile(
  modelFileName: string | null | undefined,
  resolution: { width: number; height: number; depth: number }
): void {
  updatePetModelResolution(modelFileName, resolution);
  cachedConfig = null;
}


