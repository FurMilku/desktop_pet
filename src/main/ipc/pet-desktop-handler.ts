import { ipcMain, IpcMainInvokeEvent } from 'electron';
import {
  DEFAULT_MODEL_SCALE,
  normalizePetDesktopConfig,
  type PetDesktopConfig,
} from '../../shared/config/pet-desktop-settings';
import {
  applyDisplayScaleToModelScale,
  sanitizeIncomingModelScale,
} from '../../shared/config/display-scale';
import { emitToWindow } from '../ipc-handlers';
import { getLogger } from '../logger';
import { getWindowManager } from '../window-manager';
import type { ClickAnimationSequenceFile } from '../../shared/config/click-animation-sequence-file';
import {
  createNewClickSequence,
  deleteClickSequence,
  listClickSequences,
  loadClickSequence,
  saveClickSequence,
} from '../click-sequence-store';
import {
  enrichPetDesktopConfig,
  getCachedAnimationClipNames,
  loadPetDesktopConfig,
  loadPetDesktopConfigForModel,
  persistModelResolutionForFile,
  savePetDesktopConfig,
  setCachedAnimationClipNames,
} from '../pet-desktop-config-store';
import { openPetSettingsWindow } from '../settings-window';
import { listPetModelFileNames } from '../utils/pet-model-path';

const logger = getLogger('pet-desktop-handler');

export interface PetLiveLayout {
  windowWidth: number;
  windowHeight: number;
  /** 宠物窗口实际生效的显示缩放（含 Windows 显示缩放） */
  modelScale: number;
  /** 持久化 stored 缩放（不含 Windows 显示缩放） */
  storedModelScale: number;
  /** 宠物窗口所在显示器的 Windows 缩放倍率 */
  petDisplayScaleFactor: number;
  modelBrightness: number;
  position: { x: number; y: number; monitor: number };
}

export const PetDesktopChannels = {
  GET_DESKTOP_CONFIG: 'pet:get-desktop-config',
  SET_DESKTOP_CONFIG: 'pet:set-desktop-config',
  PREVIEW_DESKTOP_CONFIG: 'pet:preview-desktop-config',
  GET_LIVE_LAYOUT: 'pet:get-live-layout',
  OPEN_SETTINGS: 'pet:open-settings',
  REPORT_ANIMATION_CLIPS: 'pet:report-animation-clips',
  GET_ANIMATION_CLIPS: 'pet:get-animation-clips',
  LIST_CLICK_SEQUENCES: 'pet:list-click-sequences',
  GET_CLICK_SEQUENCE: 'pet:get-click-sequence',
  SAVE_CLICK_SEQUENCE: 'pet:save-click-sequence',
  DELETE_CLICK_SEQUENCE: 'pet:delete-click-sequence',
  CREATE_CLICK_SEQUENCE: 'pet:create-click-sequence',
  LIST_MODELS: 'pet:list-models',
  GET_CONFIG_FOR_MODEL: 'pet:get-config-for-model',
  REPORT_MODEL_RESOLUTION: 'pet:report-model-resolution',
} as const;

/** 最近一次预览/应用时的模型缩放（主进程缓存，供设置窗实时显示） */
let liveModelScale = DEFAULT_MODEL_SCALE;
let liveModelBrightness = 1;

async function handleGetDesktopConfig(): Promise<PetDesktopConfig> {
  const config = enrichPetDesktopConfig(loadPetDesktopConfig());
  liveModelScale = config.modelScale;
  liveModelBrightness = config.modelBrightness;
  return config;
}

async function handleSetDesktopConfig(
  _event: IpcMainInvokeEvent,
  config: PetDesktopConfig
): Promise<PetDesktopConfig> {
  const saved = savePetDesktopConfig(normalizePetDesktopConfig(config));
  liveModelScale = saved.modelScale;
  liveModelBrightness = saved.modelBrightness;
  emitPetDesktopConfigToMainWindow(saved, 'pet:desktop-config-changed');
  logger.info('Desktop config updated and broadcast');
  return saved;
}

function sanitizeDesktopConfigModelScale(
  incoming: PetDesktopConfig,
  petDisplayScale: number,
  options?: { referenceModelFileName?: string | null }
): PetDesktopConfig {
  const normalized = normalizePetDesktopConfig(incoming);
  const referenceModel =
    options?.referenceModelFileName !== undefined
      ? options.referenceModelFileName
      : loadPetDesktopConfig().modelFileName;
  const forModel = loadPetDesktopConfigForModel(normalized.modelFileName);
  const switchingModel = normalized.modelFileName !== referenceModel;
  const modelScale = sanitizeIncomingModelScale(
    normalized.modelScale,
    forModel.modelScale,
    petDisplayScale,
    { switchingModel }
  );

  if (switchingModel || modelScale !== normalized.modelScale) {
    return normalizePetDesktopConfig({
      ...normalized,
      modelScale,
      ...(switchingModel
        ? {
            modelBrightness: forModel.modelBrightness,
            sourceAnimationFps: forModel.sourceAnimationFps,
            playbackSpeed: forModel.playbackSpeed,
          }
        : {}),
    });
  }

  return normalized;
}

function sanitizePreviewDesktopConfig(
  incoming: PetDesktopConfig,
  petDisplayScale: number
): PetDesktopConfig {
  const active = loadPetDesktopConfig();
  return sanitizeDesktopConfigModelScale(incoming, petDisplayScale, {
    referenceModelFileName: active.modelFileName,
  });
}

async function handlePreviewDesktopConfig(
  _event: IpcMainInvokeEvent,
  config: PetDesktopConfig
): Promise<PetLiveLayout> {
  const petDisplayScale = getWindowManager().getCurrentDisplay().scaleFactor;
  const normalized = enrichPetDesktopConfig(
    sanitizePreviewDesktopConfig(config, petDisplayScale)
  );
  liveModelScale = normalized.modelScale;
  liveModelBrightness = normalized.modelBrightness;
  emitPetDesktopConfigToMainWindow(normalized, 'pet:desktop-config-preview');
  return getLiveLayoutFromMainWindow();
}

function emitPetDesktopConfigToMainWindow(
  config: PetDesktopConfig,
  channel: string
): void {
  const petWindow = getWindowManager().getWindow();
  emitToWindow(petWindow, channel, config);
}

export function getLiveLayoutFromMainWindow(): PetLiveLayout {
  const state = getWindowManager().getWindowState();
  const displayScale = getWindowManager().getCurrentDisplay().scaleFactor;
  return {
    windowWidth: state.size.width,
    windowHeight: state.size.height,
    modelScale: applyDisplayScaleToModelScale(liveModelScale, displayScale),
    storedModelScale: liveModelScale,
    petDisplayScaleFactor: displayScale,
    modelBrightness: liveModelBrightness,
    position: {
      x: state.position.x,
      y: state.position.y,
      monitor: state.position.monitorId,
    },
  };
}

async function handleOpenSettings(): Promise<void> {
  openPetSettingsWindow();
}

async function handleReportAnimationClips(
  _event: IpcMainInvokeEvent,
  clipNames: string[]
): Promise<void> {
  setCachedAnimationClipNames(Array.isArray(clipNames) ? clipNames : []);
}

async function handleGetAnimationClips(): Promise<string[]> {
  return getCachedAnimationClipNames();
}

async function handleListClickSequences(
  _event: IpcMainInvokeEvent,
  modelFileName?: string | null
) {
  return listClickSequences(modelFileName);
}

async function handleGetClickSequence(
  _event: IpcMainInvokeEvent,
  id: string,
  modelFileName?: string | null
): Promise<ClickAnimationSequenceFile | null> {
  return typeof id === 'string' ? loadClickSequence(id, modelFileName) : null;
}

async function handleSaveClickSequence(
  _event: IpcMainInvokeEvent,
  id: string,
  file: ClickAnimationSequenceFile,
  modelFileName?: string | null
): Promise<ClickAnimationSequenceFile> {
  if (typeof id !== 'string' || !id.trim()) {
    throw new Error('Invalid sequence id');
  }
  return saveClickSequence(id.trim(), file, modelFileName);
}

async function handleDeleteClickSequence(
  _event: IpcMainInvokeEvent,
  id: string,
  modelFileName?: string | null
): Promise<boolean> {
  return typeof id === 'string' ? deleteClickSequence(id, modelFileName) : false;
}

async function handleCreateClickSequence(
  _event: IpcMainInvokeEvent,
  displayName: string,
  modelFileName?: string | null
): Promise<{ id: string; file: ClickAnimationSequenceFile }> {
  return createNewClickSequence(
    typeof displayName === 'string' ? displayName : '新序列',
    modelFileName
  );
}

async function handleListModels(): Promise<string[]> {
  return listPetModelFileNames();
}

async function handleGetConfigForModel(
  _event: IpcMainInvokeEvent,
  modelFileName: string | null
): Promise<PetDesktopConfig> {
  const name =
    typeof modelFileName === 'string' && modelFileName.trim()
      ? modelFileName.trim()
      : null;
  return enrichPetDesktopConfig(loadPetDesktopConfigForModel(name));
}

async function handleReportModelResolution(
  _event: IpcMainInvokeEvent,
  payload: {
    modelFileName?: string | null;
    width?: number;
    height?: number;
    depth?: number;
  }
): Promise<void> {
  const width = Number(payload?.width);
  const height = Number(payload?.height);
  const depth = Number(payload?.depth);
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    !Number.isFinite(depth) ||
    width <= 0 ||
    height <= 0 ||
    depth <= 0
  ) {
    return;
  }
  const modelFileName =
    typeof payload?.modelFileName === 'string' && payload.modelFileName.trim()
      ? payload.modelFileName.trim()
      : loadPetDesktopConfig().modelFileName;
  persistModelResolutionForFile(modelFileName, {
    width,
    height,
    depth,
  });
}

export function registerPetDesktopHandlers(): void {
  ipcMain.handle(PetDesktopChannels.GET_DESKTOP_CONFIG, handleGetDesktopConfig);
  ipcMain.handle(PetDesktopChannels.SET_DESKTOP_CONFIG, handleSetDesktopConfig);
  ipcMain.handle(PetDesktopChannels.PREVIEW_DESKTOP_CONFIG, handlePreviewDesktopConfig);
  ipcMain.handle(PetDesktopChannels.GET_LIVE_LAYOUT, () => getLiveLayoutFromMainWindow());
  ipcMain.handle(PetDesktopChannels.OPEN_SETTINGS, handleOpenSettings);
  ipcMain.handle(PetDesktopChannels.REPORT_ANIMATION_CLIPS, handleReportAnimationClips);
  ipcMain.handle(PetDesktopChannels.GET_ANIMATION_CLIPS, handleGetAnimationClips);
  ipcMain.handle(PetDesktopChannels.LIST_CLICK_SEQUENCES, handleListClickSequences);
  ipcMain.handle(PetDesktopChannels.GET_CLICK_SEQUENCE, handleGetClickSequence);
  ipcMain.handle(PetDesktopChannels.SAVE_CLICK_SEQUENCE, handleSaveClickSequence);
  ipcMain.handle(PetDesktopChannels.DELETE_CLICK_SEQUENCE, handleDeleteClickSequence);
  ipcMain.handle(PetDesktopChannels.CREATE_CLICK_SEQUENCE, handleCreateClickSequence);
  ipcMain.handle(PetDesktopChannels.LIST_MODELS, handleListModels);
  ipcMain.handle(PetDesktopChannels.GET_CONFIG_FOR_MODEL, handleGetConfigForModel);
  ipcMain.handle(PetDesktopChannels.REPORT_MODEL_RESOLUTION, handleReportModelResolution);
  logger.info('Pet desktop config IPC handlers registered');
}

export function unregisterPetDesktopHandlers(): void {
  ipcMain.removeHandler(PetDesktopChannels.GET_DESKTOP_CONFIG);
  ipcMain.removeHandler(PetDesktopChannels.SET_DESKTOP_CONFIG);
  ipcMain.removeHandler(PetDesktopChannels.PREVIEW_DESKTOP_CONFIG);
  ipcMain.removeHandler(PetDesktopChannels.GET_LIVE_LAYOUT);
  ipcMain.removeHandler(PetDesktopChannels.OPEN_SETTINGS);
  ipcMain.removeHandler(PetDesktopChannels.REPORT_ANIMATION_CLIPS);
  ipcMain.removeHandler(PetDesktopChannels.GET_ANIMATION_CLIPS);
  ipcMain.removeHandler(PetDesktopChannels.LIST_CLICK_SEQUENCES);
  ipcMain.removeHandler(PetDesktopChannels.GET_CLICK_SEQUENCE);
  ipcMain.removeHandler(PetDesktopChannels.SAVE_CLICK_SEQUENCE);
  ipcMain.removeHandler(PetDesktopChannels.DELETE_CLICK_SEQUENCE);
  ipcMain.removeHandler(PetDesktopChannels.CREATE_CLICK_SEQUENCE);
  ipcMain.removeHandler(PetDesktopChannels.LIST_MODELS);
  ipcMain.removeHandler(PetDesktopChannels.GET_CONFIG_FOR_MODEL);
  ipcMain.removeHandler(PetDesktopChannels.REPORT_MODEL_RESOLUTION);
}
