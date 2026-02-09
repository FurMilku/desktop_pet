/**
 * Skin API IPC 处理器
 * T101 [US6] 实现 Skin API IPC 处理器
 * 
 * 功能：
 * - 处理照片换肤相关的 IPC 请求
 * - 集成品种识别、模型生成、骨骼绑定三个服务
 * - 提供换肤流程的完整 API
 */

import { ipcMain, IpcMainInvokeEvent, dialog } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import log from 'electron-log';
import {
  BreedRecognitionService,
  BreedRecognitionResult,
  BreedRecognitionOptions,
  getBreedRecognitionService,
  initializeBreedRecognitionService,
} from '../services/breed-recognition';
import {
  ModelGenerationService,
  ModelGenerationOptions,
  ModelGenerationProgress,
  GeneratedModel,
  getModelGenerationService,
  initializeModelGenerationService,
} from '../services/model-generation';
import {
  RigBindingService,
  RigBindingOptions,
  RigBindingProgress,
  RigBindingResult,
  getRigBindingService,
  initializeRigBindingService,
} from '../services/rig-binding';

// 换肤流程状态
export type SkinProcessStatus = 
  | 'idle'
  | 'recognizing'
  | 'generating'
  | 'binding'
  | 'completed'
  | 'failed';

// 换肤流程进度
export interface SkinProcessProgress {
  status: SkinProcessStatus;
  step: number; // 1-3
  totalSteps: number;
  currentStepName: string;
  overallProgress: number; // 0-100
  stepProgress: number; // 0-100
  message?: string;
  error?: string;
}

// 换肤流程选项
export interface SkinProcessOptions {
  skipRecognition?: boolean;
  breed?: string;
  species?: 'cat' | 'dog';
  modelQuality?: 'low' | 'medium' | 'high';
  generateRig?: boolean;
}

// 换肤流程结果
export interface SkinProcessResult {
  success: boolean;
  breed?: BreedRecognitionResult;
  model?: GeneratedModel;
  rig?: RigBindingResult;
  error?: string;
  totalTime: number;
}

// 活动换肤任务
interface ActiveSkinTask {
  id: string;
  status: SkinProcessStatus;
  progress: SkinProcessProgress;
  startTime: number;
  cancelled: boolean;
  currentTaskId?: string; // 当前子任务ID
}

/**
 * Skin IPC 处理器
 */
export class SkinHandler {
  private breedService: BreedRecognitionService | null = null;
  private modelService: ModelGenerationService | null = null;
  private rigService: RigBindingService | null = null;
  private activeTasks: Map<string, ActiveSkinTask> = new Map();
  private initialized = false;

  /**
   * 注册 IPC 处理器
   */
  async register(): Promise<void> {
    log.info('[SkinHandler] Registering IPC handlers...');

    // 初始化服务
    await this.initializeServices();

    // 注册处理器
    ipcMain.handle('skin:recognize-breed', this.handleRecognizeBreed.bind(this));
    ipcMain.handle('skin:generate-model', this.handleGenerateModel.bind(this));
    ipcMain.handle('skin:bind-rig', this.handleBindRig.bind(this));
    ipcMain.handle('skin:process-full', this.handleProcessFull.bind(this));
    ipcMain.handle('skin:get-progress', this.handleGetProgress.bind(this));
    ipcMain.handle('skin:cancel', this.handleCancel.bind(this));
    ipcMain.handle('skin:select-image', this.handleSelectImage.bind(this));
    ipcMain.handle('skin:get-supported-breeds', this.handleGetSupportedBreeds.bind(this));
    ipcMain.handle('skin:get-available-providers', this.handleGetAvailableProviders.bind(this));
    ipcMain.handle('skin:get-skeleton-templates', this.handleGetSkeletonTemplates.bind(this));

    this.initialized = true;
    log.info('[SkinHandler] IPC handlers registered successfully');
  }

  /**
   * 注销 IPC 处理器
   */
  async unregister(): Promise<void> {
    log.info('[SkinHandler] Unregistering IPC handlers...');

    ipcMain.removeHandler('skin:recognize-breed');
    ipcMain.removeHandler('skin:generate-model');
    ipcMain.removeHandler('skin:bind-rig');
    ipcMain.removeHandler('skin:process-full');
    ipcMain.removeHandler('skin:get-progress');
    ipcMain.removeHandler('skin:cancel');
    ipcMain.removeHandler('skin:select-image');
    ipcMain.removeHandler('skin:get-supported-breeds');
    ipcMain.removeHandler('skin:get-available-providers');
    ipcMain.removeHandler('skin:get-skeleton-templates');

    // 取消所有活动任务
    for (const [taskId] of this.activeTasks) {
      await this.cancelTask(taskId);
    }

    // 销毁服务
    await this.disposeServices();

    this.initialized = false;
    log.info('[SkinHandler] IPC handlers unregistered');
  }

  /**
   * 初始化服务
   */
  private async initializeServices(): Promise<void> {
    try {
      this.breedService = await initializeBreedRecognitionService();
      this.modelService = await initializeModelGenerationService();
      this.rigService = await initializeRigBindingService();
      log.info('[SkinHandler] All services initialized');
    } catch (error) {
      log.error('[SkinHandler] Failed to initialize services:', error);
      throw error;
    }
  }

  /**
   * 销毁服务
   */
  private async disposeServices(): Promise<void> {
    try {
      await this.breedService?.dispose();
      await this.modelService?.dispose();
      await this.rigService?.dispose();
      log.info('[SkinHandler] All services disposed');
    } catch (error) {
      log.error('[SkinHandler] Error disposing services:', error);
    }
  }

  /**
   * 处理品种识别请求
   */
  private async handleRecognizeBreed(
    event: IpcMainInvokeEvent,
    imagePath: string,
    options?: BreedRecognitionOptions
  ): Promise<BreedRecognitionResult> {
    log.info('[SkinHandler] Recognizing breed from:', imagePath);

    if (!this.breedService) {
      throw new Error('Breed recognition service not initialized');
    }

    try {
      const result = await this.breedService.recognizeBreed(imagePath, options);
      log.info('[SkinHandler] Breed recognition result:', result.breed, result.confidence);
      return result;
    } catch (error) {
      log.error('[SkinHandler] Breed recognition failed:', error);
      throw error;
    }
  }

  /**
   * 处理模型生成请求
   */
  private async handleGenerateModel(
    event: IpcMainInvokeEvent,
    imagePath: string,
    options?: ModelGenerationOptions
  ): Promise<GeneratedModel> {
    log.info('[SkinHandler] Generating model from:', imagePath);

    if (!this.modelService) {
      throw new Error('Model generation service not initialized');
    }

    const taskId = this.generateTaskId();

    try {
      const result = await this.modelService.generateFromImage(imagePath, {
        ...options,
        onProgress: (progress) => {
          this.emitProgressToRenderer(event, 'model-generation', taskId, progress);
        },
      });
      log.info('[SkinHandler] Model generated:', result.modelPath);
      return result;
    } catch (error) {
      log.error('[SkinHandler] Model generation failed:', error);
      throw error;
    }
  }

  /**
   * 处理骨骼绑定请求
   */
  private async handleBindRig(
    event: IpcMainInvokeEvent,
    modelPath: string,
    options?: RigBindingOptions
  ): Promise<RigBindingResult> {
    log.info('[SkinHandler] Binding rig to:', modelPath);

    if (!this.rigService) {
      throw new Error('Rig binding service not initialized');
    }

    try {
      const result = await this.rigService.bindRig(modelPath, {
        ...options,
        onProgress: (progress) => {
          this.emitProgressToRenderer(event, 'rig-binding', 'current', progress);
        },
      });
      log.info('[SkinHandler] Rig bound:', result.riggedModelPath);
      return result;
    } catch (error) {
      log.error('[SkinHandler] Rig binding failed:', error);
      throw error;
    }
  }

  /**
   * 处理完整换肤流程
   */
  private async handleProcessFull(
    event: IpcMainInvokeEvent,
    imagePath: string,
    options?: SkinProcessOptions
  ): Promise<SkinProcessResult> {
    log.info('[SkinHandler] Starting full skin process for:', imagePath);

    const taskId = this.generateTaskId();
    const startTime = Date.now();

    // 创建任务
    const task: ActiveSkinTask = {
      id: taskId,
      status: 'idle',
      progress: {
        status: 'idle',
        step: 0,
        totalSteps: 3,
        currentStepName: 'Initializing',
        overallProgress: 0,
        stepProgress: 0,
      },
      startTime,
      cancelled: false,
    };

    this.activeTasks.set(taskId, task);

    try {
      let breedResult: BreedRecognitionResult | undefined;
      let modelResult: GeneratedModel | undefined;
      let rigResult: RigBindingResult | undefined;

      // 步骤 1: 品种识别
      if (!options?.skipRecognition) {
        this.updateTaskProgress(taskId, {
          status: 'recognizing',
          step: 1,
          totalSteps: 3,
          currentStepName: 'Recognizing breed',
          overallProgress: 5,
          stepProgress: 0,
        });
        this.emitProgressToRenderer(event, 'skin-process', taskId, task.progress);

        if (task.cancelled) throw new Error('Process cancelled');

        breedResult = await this.breedService!.recognizeBreed(imagePath, {
          includeAlternatives: true,
        });

        this.updateTaskProgress(taskId, {
          status: 'recognizing',
          step: 1,
          totalSteps: 3,
          currentStepName: 'Breed recognized',
          overallProgress: 25,
          stepProgress: 100,
          message: `Detected: ${breedResult.breed} (${Math.round(breedResult.confidence * 100)}%)`,
        });
        this.emitProgressToRenderer(event, 'skin-process', taskId, task.progress);
      }

      // 步骤 2: 生成3D模型
      this.updateTaskProgress(taskId, {
        status: 'generating',
        step: 2,
        totalSteps: 3,
        currentStepName: 'Generating 3D model',
        overallProgress: 30,
        stepProgress: 0,
      });
      this.emitProgressToRenderer(event, 'skin-process', taskId, task.progress);

      if (task.cancelled) throw new Error('Process cancelled');

      modelResult = await this.modelService!.generateFromImage(imagePath, {
        quality: options?.modelQuality ?? 'medium',
        generateRig: false, // 我们单独处理骨骼绑定
        onProgress: (progress) => {
          const overallProgress = 30 + (progress.progress * 0.35);
          this.updateTaskProgress(taskId, {
            status: 'generating',
            step: 2,
            totalSteps: 3,
            currentStepName: progress.stage,
            overallProgress,
            stepProgress: progress.progress,
          });
          this.emitProgressToRenderer(event, 'skin-process', taskId, task.progress);
        },
      });

      // 步骤 3: 绑定骨骼
      if (options?.generateRig !== false) {
        this.updateTaskProgress(taskId, {
          status: 'binding',
          step: 3,
          totalSteps: 3,
          currentStepName: 'Binding skeleton',
          overallProgress: 70,
          stepProgress: 0,
        });
        this.emitProgressToRenderer(event, 'skin-process', taskId, task.progress);

        if (task.cancelled) throw new Error('Process cancelled');

        // 确定骨骼类型
        const skeletonType = breedResult?.species === 'cat' ? 'cat' : 
                           breedResult?.species === 'dog' ? 'dog' : 
                           'generic_quadruped';

        rigResult = await this.rigService!.bindRig(modelResult.modelPath, {
          skeletonType,
          optimizeWeights: true,
          onProgress: (progress) => {
            const overallProgress = 70 + (progress.progress * 0.28);
            this.updateTaskProgress(taskId, {
              status: 'binding',
              step: 3,
              totalSteps: 3,
              currentStepName: progress.stage,
              overallProgress,
              stepProgress: progress.progress,
            });
            this.emitProgressToRenderer(event, 'skin-process', taskId, task.progress);
          },
        });
      }

      // 完成
      this.updateTaskProgress(taskId, {
        status: 'completed',
        step: 3,
        totalSteps: 3,
        currentStepName: 'Completed',
        overallProgress: 100,
        stepProgress: 100,
        message: 'Skin process completed successfully',
      });
      this.emitProgressToRenderer(event, 'skin-process', taskId, task.progress);

      const totalTime = Date.now() - startTime;

      const result: SkinProcessResult = {
        success: true,
        breed: breedResult,
        model: modelResult,
        rig: rigResult,
        totalTime,
      };

      log.info('[SkinHandler] Full skin process completed in', totalTime, 'ms');
      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      this.updateTaskProgress(taskId, {
        status: 'failed',
        step: task.progress.step,
        totalSteps: 3,
        currentStepName: 'Failed',
        overallProgress: task.progress.overallProgress,
        stepProgress: 0,
        error: errorMessage,
      });
      this.emitProgressToRenderer(event, 'skin-process', taskId, task.progress);

      log.error('[SkinHandler] Full skin process failed:', error);

      return {
        success: false,
        error: errorMessage,
        totalTime: Date.now() - startTime,
      };
    } finally {
      // 清理任务
      this.activeTasks.delete(taskId);
    }
  }

  /**
   * 处理获取进度请求
   */
  private async handleGetProgress(
    event: IpcMainInvokeEvent,
    taskId: string
  ): Promise<SkinProcessProgress | null> {
    const task = this.activeTasks.get(taskId);
    return task?.progress ?? null;
  }

  /**
   * 处理取消请求
   */
  private async handleCancel(
    event: IpcMainInvokeEvent,
    taskId: string
  ): Promise<boolean> {
    return this.cancelTask(taskId);
  }

  /**
   * 处理选择图片请求
   */
  private async handleSelectImage(
    event: IpcMainInvokeEvent
  ): Promise<string | null> {
    const result = await dialog.showOpenDialog({
      title: 'Select Pet Photo',
      filters: [
        { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp'] },
      ],
      properties: ['openFile'],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  }

  /**
   * 处理获取支持的品种列表请求
   */
  private async handleGetSupportedBreeds(
    event: IpcMainInvokeEvent
  ): Promise<string[]> {
    if (!this.breedService) {
      throw new Error('Breed recognition service not initialized');
    }
    return this.breedService.getSupportedBreeds();
  }

  /**
   * 处理获取可用提供商请求
   */
  private async handleGetAvailableProviders(
    event: IpcMainInvokeEvent
  ): Promise<string[]> {
    if (!this.modelService) {
      throw new Error('Model generation service not initialized');
    }
    return this.modelService.getAvailableProviders();
  }

  /**
   * 处理获取骨骼模板请求
   */
  private async handleGetSkeletonTemplates(
    event: IpcMainInvokeEvent
  ): Promise<string[]> {
    if (!this.rigService) {
      throw new Error('Rig binding service not initialized');
    }
    return this.rigService.getAvailableTemplates();
  }

  /**
   * 取消任务
   */
  private async cancelTask(taskId: string): Promise<boolean> {
    const task = this.activeTasks.get(taskId);
    if (!task) {
      return false;
    }

    log.info('[SkinHandler] Cancelling task:', taskId);

    task.cancelled = true;

    // 取消当前子任务
    if (task.currentTaskId) {
      if (task.status === 'generating') {
        await this.modelService?.cancelGeneration(task.currentTaskId);
      } else if (task.status === 'binding') {
        await this.rigService?.cancelBinding(task.currentTaskId);
      }
    }

    this.updateTaskProgress(taskId, {
      ...task.progress,
      status: 'failed',
      error: 'Cancelled by user',
    });

    return true;
  }

  /**
   * 更新任务进度
   */
  private updateTaskProgress(taskId: string, progress: SkinProcessProgress): void {
    const task = this.activeTasks.get(taskId);
    if (task) {
      task.progress = progress;
      task.status = progress.status;
    }
  }

  /**
   * 发送进度到渲染进程
   */
  private emitProgressToRenderer(
    event: IpcMainInvokeEvent,
    type: string,
    taskId: string,
    progress: unknown
  ): void {
    try {
      event.sender.send('skin:progress', { type, taskId, progress });
    } catch (error) {
      // 忽略发送错误（窗口可能已关闭）
    }
  }

  /**
   * 生成任务ID
   */
  private generateTaskId(): string {
    return `skin_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// 导出单例
let handlerInstance: SkinHandler | null = null;

export function getSkinHandler(): SkinHandler {
  if (!handlerInstance) {
    handlerInstance = new SkinHandler();
  }
  return handlerInstance;
}

export async function registerSkinHandler(): Promise<void> {
  const handler = getSkinHandler();
  await handler.register();
}

export async function unregisterSkinHandler(): Promise<void> {
  if (handlerInstance) {
    await handlerInstance.unregister();
    handlerInstance = null;
  }
}