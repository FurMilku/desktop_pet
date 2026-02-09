/**
 * Reminder API IPC 处理器
 *
 * 实现提醒管理相关的 IPC 通道处理：
 * - reminder:create - 创建提醒
 * - reminder:get - 获取单个提醒
 * - reminder:get-all - 获取所有提醒
 * - reminder:get-upcoming - 获取即将到来的提醒
 * - reminder:get-active - 获取活跃的提醒
 * - reminder:update - 更新提醒
 * - reminder:delete - 删除提醒
 * - reminder:complete - 完成提醒
 * - reminder:snooze - 延后提醒
 * - reminder:unsnooze - 取消延后
 * - reminder:get-stats - 获取统计信息
 * - reminder:cleanup - 清理已完成的提醒
 *
 * 事件（Main → Renderer）:
 * - reminder:created - 提醒创建事件
 * - reminder:updated - 提醒更新事件
 * - reminder:deleted - 提醒删除事件
 * - reminder:completed - 提醒完成事件
 * - reminder:triggered - 提醒触发事件
 * - reminder:snoozed - 提醒延后事件
 *
 * @see contracts/ipc-api.md - Section: Reminder API
 * @task T070 [US4] 实现 Reminder API IPC 处理器
 */

import {
  createModuleHandlers,
  IPCException,
  IPCErrorCodes,
  validators,
} from '../ipc-handlers';
import { ipcLogger } from '../logger';
import {
  ReminderService,
  getReminderService,
  ReminderServiceConfig,
} from '../services/reminder-service';
import {
  Reminder,
  CreateReminderInput,
  UpdateReminderInput,
  RepeatType,
} from '../../shared/models/reminder';

// ============================================================================
// Types
// ============================================================================

/**
 * 创建提醒请求参数
 */
export interface CreateReminderRequest {
  title: string;
  description?: string;
  triggerAt: number;
  repeatType?: RepeatType;
  repeatInterval?: number;
  category?: string;
}

/**
 * 更新提醒请求参数
 */
export interface UpdateReminderRequest {
  title?: string;
  description?: string;
  triggerAt?: number;
  repeatType?: RepeatType;
  repeatInterval?: number;
  category?: string;
  isActive?: boolean;
}

/**
 * 延后提醒请求参数
 */
export interface SnoozeReminderRequest {
  id: string;
  duration?: number; // 毫秒
}

/**
 * 清理请求参数
 */
export interface CleanupRequest {
  daysOld?: number;
}

/**
 * 提醒统计信息
 */
export interface ReminderStats {
  total: number;
  active: number;
  completed: number;
  upcoming: number;
}

// ============================================================================
// Validators
// ============================================================================

/**
 * 验证创建提醒请求
 */
function validateCreateRequest(data: unknown): true | string {
  if (!data || typeof data !== 'object') {
    return 'Request data is required';
  }

  const req = data as CreateReminderRequest;

  if (!req.title || typeof req.title !== 'string') {
    return 'title is required and must be a string';
  }

  if (req.title.trim().length === 0) {
    return 'title cannot be empty';
  }

  if (req.title.length > 200) {
    return 'title must be less than 200 characters';
  }

  if (req.description !== undefined && typeof req.description !== 'string') {
    return 'description must be a string';
  }

  if (req.description && req.description.length > 1000) {
    return 'description must be less than 1000 characters';
  }

  if (typeof req.triggerAt !== 'number') {
    return 'triggerAt is required and must be a number (timestamp)';
  }

  if (req.triggerAt < Date.now() - 60000) {
    // 允许1分钟的误差
    return 'triggerAt must be in the future';
  }

  if (req.repeatType !== undefined) {
    const validTypes: RepeatType[] = ['none', 'daily', 'weekly', 'monthly', 'custom'];
    if (!validTypes.includes(req.repeatType)) {
      return `repeatType must be one of: ${validTypes.join(', ')}`;
    }
  }

  if (req.repeatInterval !== undefined) {
    if (typeof req.repeatInterval !== 'number' || req.repeatInterval < 0) {
      return 'repeatInterval must be a non-negative number';
    }
  }

  if (req.category !== undefined && typeof req.category !== 'string') {
    return 'category must be a string';
  }

  return true;
}

/**
 * 验证更新提醒请求
 */
function validateUpdateRequest(id: unknown, data: unknown): true | string {
  const idResult = validators.string('id')(id);
  if (idResult !== true) return idResult;

  if (!data || typeof data !== 'object') {
    return 'Update data is required';
  }

  const req = data as UpdateReminderRequest;

  if (req.title !== undefined) {
    if (typeof req.title !== 'string') {
      return 'title must be a string';
    }
    if (req.title.trim().length === 0) {
      return 'title cannot be empty';
    }
    if (req.title.length > 200) {
      return 'title must be less than 200 characters';
    }
  }

  if (req.description !== undefined && typeof req.description !== 'string') {
    return 'description must be a string';
  }

  if (req.triggerAt !== undefined) {
    if (typeof req.triggerAt !== 'number') {
      return 'triggerAt must be a number (timestamp)';
    }
  }

  if (req.repeatType !== undefined) {
    const validTypes: RepeatType[] = ['none', 'daily', 'weekly', 'monthly', 'custom'];
    if (!validTypes.includes(req.repeatType)) {
      return `repeatType must be one of: ${validTypes.join(', ')}`;
    }
  }

  if (req.repeatInterval !== undefined) {
    if (typeof req.repeatInterval !== 'number' || req.repeatInterval < 0) {
      return 'repeatInterval must be a non-negative number';
    }
  }

  if (req.isActive !== undefined && typeof req.isActive !== 'boolean') {
    return 'isActive must be a boolean';
  }

  return true;
}

/**
 * 验证延后请求
 */
function validateSnoozeRequest(id: unknown, duration: unknown): true | string {
  const idResult = validators.string('id')(id);
  if (idResult !== true) return idResult;

  if (duration !== undefined) {
    if (typeof duration !== 'number') {
      return 'duration must be a number (milliseconds)';
    }
    if (duration < 60000) {
      // 最少1分钟
      return 'duration must be at least 60000 (1 minute)';
    }
    if (duration > 86400000) {
      // 最多24小时
      return 'duration must be at most 86400000 (24 hours)';
    }
  }

  return true;
}

// ============================================================================
// IPC Handlers
// ============================================================================

let reminderService: ReminderService | null = null;

/**
 * 获取提醒服务实例
 */
async function getReminderServiceInstance(): Promise<ReminderService> {
  if (!reminderService) {
    reminderService = getReminderService();
    await reminderService.initialize();
  }
  return reminderService;
}

/**
 * 注册 Reminder API IPC 处理器
 */
export function registerReminderHandlers(config?: ReminderServiceConfig): void {
  const handlers = createModuleHandlers('Reminder');

  // reminder:create - 创建提醒
  handlers.register(
    'reminder:create',
    async (_ctx, data: CreateReminderRequest) => {
      const service = await getReminderServiceInstance();

      const input: CreateReminderInput = {
        title: data.title.trim(),
        description: data.description?.trim(),
        triggerAt: data.triggerAt,
        repeatType: data.repeatType || 'none',
        repeatInterval: data.repeatInterval,
        category: data.category,
      };

      const reminder = await service.createReminder(input);

      ipcLogger.info(`Reminder created: ${reminder.id}`, {
        action: 'create',
        id: reminder.id,
        title: reminder.title,
      });

      return reminder;
    },
    {
      validate: validateCreateRequest,
    }
  );

  // reminder:get - 获取单个提醒
  handlers.register(
    'reminder:get',
    async (_ctx, id: string) => {
      const service = await getReminderServiceInstance();
      const reminder = await service.getReminder(id);

      if (!reminder) {
        throw new IPCException(
          IPCErrorCodes.ERR_NOT_FOUND,
          `Reminder not found: ${id}`
        );
      }

      return reminder;
    },
    {
      validate: validators.string('id'),
    }
  );

  // reminder:get-all - 获取所有提醒
  handlers.register('reminder:get-all', async () => {
    const service = await getReminderServiceInstance();
    return service.getAllReminders();
  });

  // reminder:get-upcoming - 获取即将到来的提醒
  handlers.register(
    'reminder:get-upcoming',
    async (_ctx, limit?: number) => {
      const service = await getReminderServiceInstance();
      return service.getUpcomingReminders(limit);
    },
    {
      validate: (limit) => {
        if (limit !== undefined) {
          if (typeof limit !== 'number' || limit < 1 || limit > 100) {
            return 'limit must be a number between 1 and 100';
          }
        }
        return true;
      },
    }
  );

  // reminder:get-active - 获取活跃的提醒
  handlers.register('reminder:get-active', async () => {
    const service = await getReminderServiceInstance();
    return service.getActiveReminders();
  });

  // reminder:update - 更新提醒
  handlers.register(
    'reminder:update',
    async (_ctx, id: string, data: UpdateReminderRequest) => {
      const service = await getReminderServiceInstance();

      const input: UpdateReminderInput = {};

      if (data.title !== undefined) input.title = data.title.trim();
      if (data.description !== undefined) input.description = data.description.trim();
      if (data.triggerAt !== undefined) input.triggerAt = data.triggerAt;
      if (data.repeatType !== undefined) input.repeatType = data.repeatType;
      if (data.repeatInterval !== undefined) input.repeatInterval = data.repeatInterval;
      if (data.category !== undefined) input.category = data.category;
      if (data.isActive !== undefined) input.isActive = data.isActive;

      const reminder = await service.updateReminder(id, input);

      if (!reminder) {
        throw new IPCException(
          IPCErrorCodes.ERR_NOT_FOUND,
          `Reminder not found: ${id}`
        );
      }

      ipcLogger.info(`Reminder updated: ${reminder.id}`, {
        action: 'update',
        id: reminder.id,
      });

      return reminder;
    },
    {
      validate: validateUpdateRequest,
    }
  );

  // reminder:delete - 删除提醒
  handlers.register(
    'reminder:delete',
    async (_ctx, id: string) => {
      const service = await getReminderServiceInstance();
      const deleted = await service.deleteReminder(id);

      if (!deleted) {
        throw new IPCException(
          IPCErrorCodes.ERR_NOT_FOUND,
          `Reminder not found: ${id}`
        );
      }

      ipcLogger.info(`Reminder deleted: ${id}`, {
        action: 'delete',
        id,
      });

      return { success: true };
    },
    {
      validate: validators.string('id'),
    }
  );

  // reminder:complete - 完成提醒
  handlers.register(
    'reminder:complete',
    async (_ctx, id: string) => {
      const service = await getReminderServiceInstance();
      const reminder = await service.completeReminder(id);

      if (!reminder) {
        throw new IPCException(
          IPCErrorCodes.ERR_NOT_FOUND,
          `Reminder not found: ${id}`
        );
      }

      ipcLogger.info(`Reminder completed: ${reminder.id}`, {
        action: 'complete',
        id: reminder.id,
      });

      return reminder;
    },
    {
      validate: validators.string('id'),
    }
  );

  // reminder:snooze - 延后提醒
  handlers.register(
    'reminder:snooze',
    async (_ctx, id: string, duration?: number) => {
      const service = await getReminderServiceInstance();
      const reminder = await service.snoozeReminder(id, duration);

      if (!reminder) {
        throw new IPCException(
          IPCErrorCodes.ERR_NOT_FOUND,
          `Reminder not found: ${id}`
        );
      }

      ipcLogger.info(`Reminder snoozed: ${reminder.id}`, {
        action: 'snooze',
        id: reminder.id,
        snoozedUntil: reminder.snoozedUntil,
      });

      return reminder;
    },
    {
      validate: validateSnoozeRequest,
    }
  );

  // reminder:unsnooze - 取消延后
  handlers.register(
    'reminder:unsnooze',
    async (_ctx, id: string) => {
      const service = await getReminderServiceInstance();
      const reminder = await service.unsnoozeReminder(id);

      if (!reminder) {
        throw new IPCException(
          IPCErrorCodes.ERR_NOT_FOUND,
          `Reminder not found: ${id}`
        );
      }

      ipcLogger.info(`Reminder unsnoozed: ${reminder.id}`, {
        action: 'unsnooze',
        id: reminder.id,
      });

      return reminder;
    },
    {
      validate: validators.string('id'),
    }
  );

  // reminder:get-stats - 获取统计信息
  handlers.register('reminder:get-stats', async () => {
    const service = await getReminderServiceInstance();
    return service.getStats();
  });

  // reminder:cleanup - 清理已完成的提醒
  handlers.register(
    'reminder:cleanup',
    async (_ctx, daysOld?: number) => {
      const service = await getReminderServiceInstance();

      let count: number;
      if (daysOld !== undefined && daysOld > 0) {
        count = await service.cleanupOldCompleted(daysOld);
      } else {
        count = await service.cleanupCompleted();
      }

      ipcLogger.info(`Reminders cleaned up: ${count}`, {
        action: 'cleanup',
        count,
        daysOld,
      });

      return { count };
    },
    {
      validate: (daysOld) => {
        if (daysOld !== undefined) {
          if (typeof daysOld !== 'number' || daysOld < 0 || daysOld > 365) {
            return 'daysOld must be a number between 0 and 365';
          }
        }
        return true;
      },
    }
  );

  ipcLogger.info('Reminder API handlers registered', {
    action: 'register',
    module: 'Reminder',
    channels: handlers.getChannels(),
  });
}

/**
 * 重置提醒服务（用于测试）
 */
export async function resetReminderHandler(): Promise<void> {
  if (reminderService) {
    await reminderService.shutdown();
    reminderService = null;
  }
}

// ============================================================================
// Exports
// ============================================================================

export type { Reminder, ReminderStats };