/**
 * Pet API IPC 处理器
 * T035 [US1] 实现 Pet API IPC 处理器
 *
 * 处理渲染进程与主进程之间的宠物管理 IPC 通信
 *
 * @see specs/001-desktop-3d-pet/contracts/ipc-api.md Pet API
 */

import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { getLogger } from '../logger';
import {
  Pet,
  PetSkin,
  CreatePetInput,
  UpdatePetInput,
  CreatePetSkinInput,
  PetAnimationState,
  SkinSource,
} from '../../shared/types/models';
import {
  getPetRepository,
  IPetRepository,
  validatePetInput,
} from '../../shared/models/pet';
import {
  getPetSkinRepository,
  IPetSkinRepository,
  validatePetSkinInput,
  UpdatePetSkinInput,
} from '../../shared/models/pet-skin';

const logger = getLogger('pet-handler');

// ============================================================================
// IPC Channel 定义
// ============================================================================

/**
 * Pet IPC Channels
 */
export const PetChannels = {
  // Pet 操作
  GET: 'pet:get',
  GET_ALL: 'pet:get-all',
  GET_STATE: 'pet:get-state',
  SET_ANIMATION: 'pet:set-animation',
  SAVE_POSITION: 'pet:save-position',
  CREATE: 'pet:create',
  UPDATE: 'pet:update',
  DELETE: 'pet:delete',
  UPDATE_POSITION: 'pet:update-position',
  UPDATE_ANIMATION: 'pet:update-animation',
  UPDATE_SKIN: 'pet:update-skin',
  SET_VISIBILITY: 'pet:set-visibility',
  ENSURE_DEFAULT: 'pet:ensure-default',
  GET_FIRST: 'pet:get-first',
  
  // PetSkin 操作
  SKIN_GET: 'pet:skin:get',
  SKIN_GET_ALL: 'pet:skin:get-all',
  SKIN_CREATE: 'pet:skin:create',
  SKIN_UPDATE: 'pet:skin:update',
  SKIN_DELETE: 'pet:skin:delete',
  SKIN_SET_DEFAULT: 'pet:skin:set-default',
  SKIN_GET_DEFAULT: 'pet:skin:get-default',
  SKIN_GET_BY_SOURCE: 'pet:skin:get-by-source',
  SKIN_ENSURE_DEFAULT: 'pet:skin:ensure-default',
} as const;

// ============================================================================
// 类型定义
// ============================================================================

/**
 * IPC 错误接口
 */
interface IPCError {
  code: string;
  message: string;
  details?: unknown;
}

/**
 * 位置更新参数
 */
interface UpdatePositionParams {
  id: string;
  x: number;
  y: number;
  displayIndex?: number;
}

/**
 * 动画更新参数
 */
interface UpdateAnimationParams {
  id: string;
  state: PetAnimationState;
}

/**
 * 皮肤更新参数
 */
interface UpdateSkinParams {
  id: string;
  skinId: string | null;
}

/**
 * 可见性更新参数
 */
interface SetVisibilityParams {
  id: string;
  isVisible: boolean;
}

// ============================================================================
// Pet Repository 实例管理
// ============================================================================

let petRepository: IPetRepository | null = null;
let petSkinRepository: IPetSkinRepository | null = null;

/**
 * 获取 Pet Repository 实例
 */
function getPetRepo(): IPetRepository {
  if (!petRepository) {
    petRepository = getPetRepository();
  }
  return petRepository;
}

/**
 * 获取 PetSkin Repository 实例
 */
function getPetSkinRepo(): IPetSkinRepository {
  if (!petSkinRepository) {
    petSkinRepository = getPetSkinRepository();
  }
  return petSkinRepository;
}

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 创建 IPC 错误对象
 */
function createIPCError(code: string, message: string, details?: unknown): IPCError {
  return {
    code,
    message,
    details,
  };
}

/**
 * 验证字符串 ID
 */
function validateId(id: unknown, fieldName = 'id'): string {
  if (typeof id !== 'string' || id.trim().length === 0) {
    throw createIPCError('ERR_INVALID_INPUT', `${fieldName} must be a non-empty string`);
  }
  return id;
}

/**
 * 验证数字
 */
function validateNumber(value: unknown, fieldName: string, options?: { min?: number; max?: number }): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw createIPCError('ERR_INVALID_INPUT', `${fieldName} must be a valid number`);
  }
  if (options?.min !== undefined && value < options.min) {
    throw createIPCError('ERR_INVALID_INPUT', `${fieldName} must be at least ${options.min}`);
  }
  if (options?.max !== undefined && value > options.max) {
    throw createIPCError('ERR_INVALID_INPUT', `${fieldName} must be at most ${options.max}`);
  }
  return value;
}

/**
 * 验证布尔值
 */
function validateBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== 'boolean') {
    throw createIPCError('ERR_INVALID_INPUT', `${fieldName} must be a boolean`);
  }
  return value;
}

// ============================================================================
// Pet IPC 处理器实现
// ============================================================================

/**
 * 处理获取宠物请求
 */
async function handleGetPet(_event: IpcMainInvokeEvent, id: string): Promise<Pet | null> {
  try {
    logger.debug('Handle get pet', { id });
    validateId(id);
    
    const repo = getPetRepo();
    return repo.findById(id);
  } catch (error) {
    logger.error('Failed to get pet', error);
    if ((error as IPCError).code) {
      throw error;
    }
    throw createIPCError('ERR_INTERNAL', `Failed to get pet: ${error}`);
  }
}

/**
 * 处理获取所有宠物请求
 */
async function handleGetAllPets(_event: IpcMainInvokeEvent): Promise<Pet[]> {
  try {
    logger.debug('Handle get all pets');
    
    const repo = getPetRepo();
    return repo.findAll();
  } catch (error) {
    logger.error('Failed to get all pets', error);
    throw createIPCError('ERR_INTERNAL', `Failed to get all pets: ${error}`);
  }
}

/**
 * PetState 接口（用于渲染进程）
 */
interface PetState {
  animation: PetAnimationState;
  position: {
    x: number;
    y: number;
    monitor: number;
  };
  skinId: string;
  emotionalValue: number;
}

/**
 * 动画选项
 */
interface AnimationOptions {
  duration?: number;
  loop?: boolean;
  transition?: string;
}

/**
 * 位置信息
 */
interface PetPosition {
  x: number;
  y: number;
  monitor: number;
}

/**
 * 处理获取宠物状态请求（渲染进程使用）
 */
async function handleGetPetState(_event: IpcMainInvokeEvent): Promise<PetState> {
  try {
    logger.debug('Handle get pet state');
    
    const repo = getPetRepo();
    const pet = repo.findFirst();
    
    if (!pet) {
      // 确保存在默认宠物
      const defaultPet = repo.ensureDefaultPet();
      return {
        animation: defaultPet.animationState,
        position: {
          x: defaultPet.positionX,
          y: defaultPet.positionY,
          monitor: defaultPet.displayIndex,
        },
        skinId: defaultPet.currentSkinId || 'default',
        emotionalValue: 50, // 默认情绪值
      };
    }
    
    return {
      animation: pet.animationState,
      position: {
        x: pet.positionX,
        y: pet.positionY,
        monitor: pet.displayIndex,
      },
      skinId: pet.currentSkinId || 'default',
      emotionalValue: 50, // TODO: 从持久化存储中获取情绪值
    };
  } catch (error) {
    logger.error('Failed to get pet state', error);
    throw createIPCError('ERR_INTERNAL', `Failed to get pet state: ${error}`);
  }
}

/**
 * 处理设置动画请求
 */
async function handleSetAnimation(
  _event: IpcMainInvokeEvent,
  animation: PetAnimationState,
  _options?: AnimationOptions
): Promise<void> {
  try {
    logger.debug('Handle set animation', { animation });
    
    if (typeof animation !== 'string') {
      throw createIPCError('ERR_INVALID_INPUT', 'animation must be a string');
    }
    
    const repo = getPetRepo();
    const pet = repo.findFirst();
    
    if (!pet) {
      throw createIPCError('ERR_NOT_FOUND', 'No pet found');
    }
    
    repo.updateAnimationState(pet.id, animation);
    logger.debug('Animation state updated', { petId: pet.id, animation });
  } catch (error) {
    logger.error('Failed to set animation', error);
    if ((error as IPCError).code) {
      throw error;
    }
    throw createIPCError('ERR_INTERNAL', `Failed to set animation: ${error}`);
  }
}

/**
 * 处理保存位置请求
 */
async function handleSavePosition(
  _event: IpcMainInvokeEvent,
  position: PetPosition
): Promise<void> {
  try {
    logger.debug('Handle save position', position);
    
    if (!position || typeof position !== 'object') {
      throw createIPCError('ERR_INVALID_INPUT', 'position must be an object');
    }
    
    validateNumber(position.x, 'x');
    validateNumber(position.y, 'y');
    if (position.monitor !== undefined) {
      validateNumber(position.monitor, 'monitor', { min: 0 });
    }
    
    const repo = getPetRepo();
    const pet = repo.findFirst();
    
    if (!pet) {
      throw createIPCError('ERR_NOT_FOUND', 'No pet found');
    }
    
    repo.updatePosition(pet.id, position.x, position.y, position.monitor);
    logger.debug('Position saved', { petId: pet.id, position });
  } catch (error) {
    logger.error('Failed to save position', error);
    if ((error as IPCError).code) {
      throw error;
    }
    throw createIPCError('ERR_INTERNAL', `Failed to save position: ${error}`);
  }
}

/**
 * 处理获取第一个（主）宠物请求
 */
async function handleGetFirstPet(_event: IpcMainInvokeEvent): Promise<Pet | null> {
  try {
    logger.debug('Handle get first pet');
    
    const repo = getPetRepo();
    return repo.findFirst();
  } catch (error) {
    logger.error('Failed to get first pet', error);
    throw createIPCError('ERR_INTERNAL', `Failed to get first pet: ${error}`);
  }
}

/**
 * 处理创建宠物请求
 */
async function handleCreatePet(_event: IpcMainInvokeEvent, input: CreatePetInput): Promise<Pet> {
  try {
    logger.debug('Handle create pet', { input });
    
    // 验证输入
    if (!input || typeof input !== 'object') {
      throw createIPCError('ERR_INVALID_INPUT', 'Input must be an object');
    }
    
    const errors = validatePetInput(input);
    if (errors.length > 0) {
      throw createIPCError('ERR_INVALID_INPUT', errors.join('; '));
    }
    
    const repo = getPetRepo();
    return repo.create(input);
  } catch (error) {
    logger.error('Failed to create pet', error);
    if ((error as IPCError).code) {
      throw error;
    }
    throw createIPCError('ERR_INTERNAL', `Failed to create pet: ${error}`);
  }
}

/**
 * 处理更新宠物请求
 */
async function handleUpdatePet(
  _event: IpcMainInvokeEvent,
  id: string,
  input: UpdatePetInput
): Promise<Pet | null> {
  try {
    logger.debug('Handle update pet', { id, input });
    validateId(id);
    
    // 验证输入
    if (!input || typeof input !== 'object') {
      throw createIPCError('ERR_INVALID_INPUT', 'Input must be an object');
    }
    
    const errors = validatePetInput(input);
    if (errors.length > 0) {
      throw createIPCError('ERR_INVALID_INPUT', errors.join('; '));
    }
    
    const repo = getPetRepo();
    const result = repo.update(id, input);
    
    if (!result) {
      throw createIPCError('ERR_NOT_FOUND', `Pet not found: ${id}`);
    }
    
    return result;
  } catch (error) {
    logger.error('Failed to update pet', error);
    if ((error as IPCError).code) {
      throw error;
    }
    throw createIPCError('ERR_INTERNAL', `Failed to update pet: ${error}`);
  }
}

/**
 * 处理删除宠物请求
 */
async function handleDeletePet(_event: IpcMainInvokeEvent, id: string): Promise<boolean> {
  try {
    logger.debug('Handle delete pet', { id });
    validateId(id);
    
    const repo = getPetRepo();
    const result = repo.delete(id);
    
    if (!result) {
      throw createIPCError('ERR_NOT_FOUND', `Pet not found: ${id}`);
    }
    
    return true;
  } catch (error) {
    logger.error('Failed to delete pet', error);
    if ((error as IPCError).code) {
      throw error;
    }
    throw createIPCError('ERR_INTERNAL', `Failed to delete pet: ${error}`);
  }
}

/**
 * 处理更新宠物位置请求
 */
async function handleUpdatePosition(
  _event: IpcMainInvokeEvent,
  params: UpdatePositionParams
): Promise<Pet | null> {
  try {
    logger.debug('Handle update position', params);
    
    validateId(params.id);
    validateNumber(params.x, 'x');
    validateNumber(params.y, 'y');
    if (params.displayIndex !== undefined) {
      validateNumber(params.displayIndex, 'displayIndex', { min: 0 });
    }
    
    const repo = getPetRepo();
    const result = repo.updatePosition(params.id, params.x, params.y, params.displayIndex);
    
    if (!result) {
      throw createIPCError('ERR_NOT_FOUND', `Pet not found: ${params.id}`);
    }
    
    return result;
  } catch (error) {
    logger.error('Failed to update pet position', error);
    if ((error as IPCError).code) {
      throw error;
    }
    throw createIPCError('ERR_INTERNAL', `Failed to update pet position: ${error}`);
  }
}

/**
 * 处理更新宠物动画状态请求
 */
async function handleUpdateAnimation(
  _event: IpcMainInvokeEvent,
  params: UpdateAnimationParams
): Promise<Pet | null> {
  try {
    logger.debug('Handle update animation', params);
    
    validateId(params.id);
    if (typeof params.state !== 'string') {
      throw createIPCError('ERR_INVALID_INPUT', 'state must be a string');
    }
    
    const repo = getPetRepo();
    const result = repo.updateAnimationState(params.id, params.state);
    
    if (!result) {
      throw createIPCError('ERR_NOT_FOUND', `Pet not found: ${params.id}`);
    }
    
    return result;
  } catch (error) {
    logger.error('Failed to update pet animation', error);
    if ((error as IPCError).code) {
      throw error;
    }
    throw createIPCError('ERR_INTERNAL', `Failed to update pet animation: ${error}`);
  }
}

/**
 * 处理更新宠物皮肤请求
 */
async function handleUpdatePetSkin(
  _event: IpcMainInvokeEvent,
  params: UpdateSkinParams
): Promise<Pet | null> {
  try {
    logger.debug('Handle update pet skin', params);
    
    validateId(params.id);
    if (params.skinId !== null) {
      validateId(params.skinId, 'skinId');
    }
    
    const repo = getPetRepo();
    const result = repo.updateSkin(params.id, params.skinId);
    
    if (!result) {
      throw createIPCError('ERR_NOT_FOUND', `Pet not found: ${params.id}`);
    }
    
    return result;
  } catch (error) {
    logger.error('Failed to update pet skin', error);
    if ((error as IPCError).code) {
      throw error;
    }
    throw createIPCError('ERR_INTERNAL', `Failed to update pet skin: ${error}`);
  }
}

/**
 * 处理设置宠物可见性请求
 */
async function handleSetVisibility(
  _event: IpcMainInvokeEvent,
  params: SetVisibilityParams
): Promise<Pet | null> {
  try {
    logger.debug('Handle set visibility', params);
    
    validateId(params.id);
    validateBoolean(params.isVisible, 'isVisible');
    
    const repo = getPetRepo();
    const result = repo.setVisibility(params.id, params.isVisible);
    
    if (!result) {
      throw createIPCError('ERR_NOT_FOUND', `Pet not found: ${params.id}`);
    }
    
    return result;
  } catch (error) {
    logger.error('Failed to set pet visibility', error);
    if ((error as IPCError).code) {
      throw error;
    }
    throw createIPCError('ERR_INTERNAL', `Failed to set pet visibility: ${error}`);
  }
}

/**
 * 处理确保默认宠物存在请求
 */
async function handleEnsureDefaultPet(_event: IpcMainInvokeEvent): Promise<Pet> {
  try {
    logger.debug('Handle ensure default pet');
    
    const repo = getPetRepo();
    return repo.ensureDefaultPet();
  } catch (error) {
    logger.error('Failed to ensure default pet', error);
    throw createIPCError('ERR_INTERNAL', `Failed to ensure default pet: ${error}`);
  }
}

// ============================================================================
// PetSkin IPC 处理器实现
// ============================================================================

/**
 * 处理获取皮肤请求
 */
async function handleGetSkin(_event: IpcMainInvokeEvent, id: string): Promise<PetSkin | null> {
  try {
    logger.debug('Handle get skin', { id });
    validateId(id);
    
    const repo = getPetSkinRepo();
    return repo.findById(id);
  } catch (error) {
    logger.error('Failed to get skin', error);
    if ((error as IPCError).code) {
      throw error;
    }
    throw createIPCError('ERR_INTERNAL', `Failed to get skin: ${error}`);
  }
}

/**
 * 处理获取所有皮肤请求
 */
async function handleGetAllSkins(_event: IpcMainInvokeEvent): Promise<PetSkin[]> {
  try {
    logger.debug('Handle get all skins');
    
    const repo = getPetSkinRepo();
    return repo.findAll();
  } catch (error) {
    logger.error('Failed to get all skins', error);
    throw createIPCError('ERR_INTERNAL', `Failed to get all skins: ${error}`);
  }
}

/**
 * 处理创建皮肤请求
 */
async function handleCreateSkin(
  _event: IpcMainInvokeEvent,
  input: CreatePetSkinInput
): Promise<PetSkin> {
  try {
    logger.debug('Handle create skin', { input });
    
    // 验证输入
    if (!input || typeof input !== 'object') {
      throw createIPCError('ERR_INVALID_INPUT', 'Input must be an object');
    }
    
    const errors = validatePetSkinInput(input);
    if (errors.length > 0) {
      throw createIPCError('ERR_INVALID_INPUT', errors.join('; '));
    }
    
    const repo = getPetSkinRepo();
    return repo.create(input);
  } catch (error) {
    logger.error('Failed to create skin', error);
    if ((error as IPCError).code) {
      throw error;
    }
    throw createIPCError('ERR_INTERNAL', `Failed to create skin: ${error}`);
  }
}

/**
 * 处理更新皮肤请求
 */
async function handleUpdateSkin(
  _event: IpcMainInvokeEvent,
  id: string,
  input: UpdatePetSkinInput
): Promise<PetSkin | null> {
  try {
    logger.debug('Handle update skin', { id, input });
    validateId(id);
    
    // 验证输入
    if (!input || typeof input !== 'object') {
      throw createIPCError('ERR_INVALID_INPUT', 'Input must be an object');
    }
    
    const errors = validatePetSkinInput(input);
    if (errors.length > 0) {
      throw createIPCError('ERR_INVALID_INPUT', errors.join('; '));
    }
    
    const repo = getPetSkinRepo();
    const result = repo.update(id, input);
    
    if (!result) {
      throw createIPCError('ERR_NOT_FOUND', `Skin not found: ${id}`);
    }
    
    return result;
  } catch (error) {
    logger.error('Failed to update skin', error);
    if ((error as IPCError).code) {
      throw error;
    }
    throw createIPCError('ERR_INTERNAL', `Failed to update skin: ${error}`);
  }
}

/**
 * 处理删除皮肤请求
 */
async function handleDeleteSkin(_event: IpcMainInvokeEvent, id: string): Promise<boolean> {
  try {
    logger.debug('Handle delete skin', { id });
    validateId(id);
    
    const repo = getPetSkinRepo();
    const result = repo.delete(id);
    
    if (!result) {
      throw createIPCError('ERR_NOT_FOUND', `Skin not found: ${id}`);
    }
    
    return true;
  } catch (error) {
    logger.error('Failed to delete skin', error);
    if ((error as IPCError).code) {
      throw error;
    }
    throw createIPCError('ERR_INTERNAL', `Failed to delete skin: ${error}`);
  }
}

/**
 * 处理设置默认皮肤请求
 */
async function handleSetDefaultSkin(
  _event: IpcMainInvokeEvent,
  id: string
): Promise<PetSkin | null> {
  try {
    logger.debug('Handle set default skin', { id });
    validateId(id);
    
    const repo = getPetSkinRepo();
    const result = repo.setDefault(id);
    
    if (!result) {
      throw createIPCError('ERR_NOT_FOUND', `Skin not found: ${id}`);
    }
    
    return result;
  } catch (error) {
    logger.error('Failed to set default skin', error);
    if ((error as IPCError).code) {
      throw error;
    }
    throw createIPCError('ERR_INTERNAL', `Failed to set default skin: ${error}`);
  }
}

/**
 * 处理获取默认皮肤请求
 */
async function handleGetDefaultSkin(_event: IpcMainInvokeEvent): Promise<PetSkin | null> {
  try {
    logger.debug('Handle get default skin');
    
    const repo = getPetSkinRepo();
    return repo.findDefault();
  } catch (error) {
    logger.error('Failed to get default skin', error);
    throw createIPCError('ERR_INTERNAL', `Failed to get default skin: ${error}`);
  }
}

/**
 * 处理根据来源获取皮肤列表请求
 */
async function handleGetSkinsBySource(
  _event: IpcMainInvokeEvent,
  source: SkinSource
): Promise<PetSkin[]> {
  try {
    logger.debug('Handle get skins by source', { source });
    
    if (typeof source !== 'string') {
      throw createIPCError('ERR_INVALID_INPUT', 'source must be a string');
    }
    
    const validSources: SkinSource[] = ['builtin', 'generated', 'imported'];
    if (!validSources.includes(source)) {
      throw createIPCError(
        'ERR_INVALID_INPUT',
        `Invalid source: ${source}. Must be one of: ${validSources.join(', ')}`
      );
    }
    
    const repo = getPetSkinRepo();
    return repo.findBySource(source);
  } catch (error) {
    logger.error('Failed to get skins by source', error);
    if ((error as IPCError).code) {
      throw error;
    }
    throw createIPCError('ERR_INTERNAL', `Failed to get skins by source: ${error}`);
  }
}

/**
 * 处理确保默认皮肤存在请求
 */
async function handleEnsureDefaultSkin(_event: IpcMainInvokeEvent): Promise<PetSkin> {
  try {
    logger.debug('Handle ensure default skin');
    
    const repo = getPetSkinRepo();
    return repo.ensureDefaultSkin();
  } catch (error) {
    logger.error('Failed to ensure default skin', error);
    throw createIPCError('ERR_INTERNAL', `Failed to ensure default skin: ${error}`);
  }
}

// ============================================================================
// IPC 处理器注册
// ============================================================================

/**
 * 注册所有 Pet IPC 处理器
 */
export function registerPetHandlers(): void {
  logger.info('Registering Pet IPC handlers');

  // Pet 操作
  ipcMain.handle(PetChannels.GET, handleGetPet);
  ipcMain.handle(PetChannels.GET_ALL, handleGetAllPets);
  ipcMain.handle(PetChannels.GET_STATE, handleGetPetState);
  ipcMain.handle(PetChannels.SET_ANIMATION, handleSetAnimation);
  ipcMain.handle(PetChannels.SAVE_POSITION, handleSavePosition);
  ipcMain.handle(PetChannels.GET_FIRST, handleGetFirstPet);
  ipcMain.handle(PetChannels.CREATE, handleCreatePet);
  ipcMain.handle(PetChannels.UPDATE, handleUpdatePet);
  ipcMain.handle(PetChannels.DELETE, handleDeletePet);
  ipcMain.handle(PetChannels.UPDATE_POSITION, handleUpdatePosition);
  ipcMain.handle(PetChannels.UPDATE_ANIMATION, handleUpdateAnimation);
  ipcMain.handle(PetChannels.UPDATE_SKIN, handleUpdatePetSkin);
  ipcMain.handle(PetChannels.SET_VISIBILITY, handleSetVisibility);
  ipcMain.handle(PetChannels.ENSURE_DEFAULT, handleEnsureDefaultPet);

  // PetSkin 操作
  ipcMain.handle(PetChannels.SKIN_GET, handleGetSkin);
  ipcMain.handle(PetChannels.SKIN_GET_ALL, handleGetAllSkins);
  ipcMain.handle(PetChannels.SKIN_CREATE, handleCreateSkin);
  ipcMain.handle(PetChannels.SKIN_UPDATE, handleUpdateSkin);
  ipcMain.handle(PetChannels.SKIN_DELETE, handleDeleteSkin);
  ipcMain.handle(PetChannels.SKIN_SET_DEFAULT, handleSetDefaultSkin);
  ipcMain.handle(PetChannels.SKIN_GET_DEFAULT, handleGetDefaultSkin);
  ipcMain.handle(PetChannels.SKIN_GET_BY_SOURCE, handleGetSkinsBySource);
  ipcMain.handle(PetChannels.SKIN_ENSURE_DEFAULT, handleEnsureDefaultSkin);

  logger.info('Pet IPC handlers registered', {
    petChannels: Object.values(PetChannels).filter(c => !c.includes(':skin:')),
    skinChannels: Object.values(PetChannels).filter(c => c.includes(':skin:')),
  });
}

/**
 * 注销所有 Pet IPC 处理器
 */
export function unregisterPetHandlers(): void {
  logger.info('Unregistering Pet IPC handlers');

  // Pet 操作
  ipcMain.removeHandler(PetChannels.GET);
  ipcMain.removeHandler(PetChannels.GET_ALL);
  ipcMain.removeHandler(PetChannels.GET_STATE);
  ipcMain.removeHandler(PetChannels.SET_ANIMATION);
  ipcMain.removeHandler(PetChannels.SAVE_POSITION);
  ipcMain.removeHandler(PetChannels.GET_FIRST);
  ipcMain.removeHandler(PetChannels.CREATE);
  ipcMain.removeHandler(PetChannels.UPDATE);
  ipcMain.removeHandler(PetChannels.DELETE);
  ipcMain.removeHandler(PetChannels.UPDATE_POSITION);
  ipcMain.removeHandler(PetChannels.UPDATE_ANIMATION);
  ipcMain.removeHandler(PetChannels.UPDATE_SKIN);
  ipcMain.removeHandler(PetChannels.SET_VISIBILITY);
  ipcMain.removeHandler(PetChannels.ENSURE_DEFAULT);

  // PetSkin 操作
  ipcMain.removeHandler(PetChannels.SKIN_GET);
  ipcMain.removeHandler(PetChannels.SKIN_GET_ALL);
  ipcMain.removeHandler(PetChannels.SKIN_CREATE);
  ipcMain.removeHandler(PetChannels.SKIN_UPDATE);
  ipcMain.removeHandler(PetChannels.SKIN_DELETE);
  ipcMain.removeHandler(PetChannels.SKIN_SET_DEFAULT);
  ipcMain.removeHandler(PetChannels.SKIN_GET_DEFAULT);
  ipcMain.removeHandler(PetChannels.SKIN_GET_BY_SOURCE);
  ipcMain.removeHandler(PetChannels.SKIN_ENSURE_DEFAULT);

  logger.info('Pet IPC handlers unregistered');
}

/**
 * 重置 Pet 服务（用于测试）
 */
export function resetPetService(): void {
  petRepository = null;
  petSkinRepository = null;
}

// ============================================================================
// 导出
// ============================================================================

export {
  UpdatePositionParams,
  UpdateAnimationParams,
  UpdateSkinParams,
  SetVisibilityParams,
};