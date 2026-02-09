/**
 * T069 [US4] 提醒服务
 *
 * 提醒功能的核心服务，负责：
 * - 定时检查到期提醒
 * - 发送系统通知
 * - 处理贪睡和重复提醒
 * - 与事件总线集成
 */

import { Notification, nativeImage, BrowserWindow } from 'electron';
import { EventEmitter } from 'events';
import type { Reminder, CreateReminderInput, UpdateReminderInput } from '../../shared/types/models';
import { getReminderModel, ReminderStats, UpcomingReminder } from '../../shared/models/reminder';
import { getEventBus, EventBus } from '../../shared/services/event-bus';
import { getLogger } from '../logger';
import path from 'path';

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 提醒服务配置
 */
export interface ReminderServiceConfig {
  /** 检查间隔（毫秒），默认 30 秒 */
  checkInterval?: number;
  /** 提前提醒时间（分钟），默认 5 分钟 */
  advanceNoticeMinutes?: number;
  /** 默认贪睡时间（分钟），默认 10 分钟 */
  defaultSnoozeMinutes?: number;
  /** 是否启用系统通知，默认 true */
  enableNotifications?: boolean;
  /** 通知图标路径 */
  notificationIconPath?: string;
}

/**
 * 提醒事件类型
 */
export interface ReminderEvents {
  'reminder:due': Reminder;
  'reminder:triggered': Reminder;
  'reminder:snoozed': Reminder;
  'reminder:dismissed': Reminder;
  'reminder:created': Reminder;
  'reminder:updated': Reminder;
  'reminder:deleted': string;
  'reminder:upcoming': UpcomingReminder[];
}

/**
 * 通知操作类型
 */
type NotificationAction = 'snooze' | 'dismiss' | 'view';

// ============================================================================
// 默认配置
// ============================================================================

const DEFAULT_CONFIG: Required<ReminderServiceConfig> = {
  checkInterval: 30 * 1000, // 30 秒
  advanceNoticeMinutes: 5,
  defaultSnoozeMinutes: 10,
  enableNotifications: true,
  notificationIconPath: '',
};

// ============================================================================
// ReminderService 类
// ============================================================================

/**
 * 提醒服务
 */
export class ReminderService extends EventEmitter {
  private static instance: ReminderService | null = null;

  private config: Required<ReminderServiceConfig>;
  private checkTimer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private eventBus: EventBus | null = null;
  private logger = getLogger();
  private activeNotifications: Map<string, Notification> = new Map();

  private constructor(config: ReminderServiceConfig = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 获取单例实例
   */
  static getInstance(config?: ReminderServiceConfig): ReminderService {
    if (!ReminderService.instance) {
      ReminderService.instance = new ReminderService(config);
    }
    return ReminderService.instance;
  }

  /**
   * 重置单例（用于测试）
   */
  static resetInstance(): void {
    if (ReminderService.instance) {
      ReminderService.instance.stop();
      ReminderService.instance = null;
    }
  }

  // --------------------------------------------------------------------------
  // 生命周期管理
  // --------------------------------------------------------------------------

  /**
   * 启动提醒服务
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('[ReminderService] Service already running');
      return;
    }

    this.logger.info('[ReminderService] Starting reminder service...');

    // 获取事件总线
    try {
      this.eventBus = getEventBus();
    } catch (error) {
      this.logger.warn('[ReminderService] EventBus not available, running without event integration');
    }

    // 立即检查一次到期提醒
    await this.checkDueReminders();

    // 启动定时检查
    this.checkTimer = setInterval(async () => {
      await this.checkDueReminders();
    }, this.config.checkInterval);

    this.isRunning = true;
    this.logger.info('[ReminderService] Reminder service started');
  }

  /**
   * 停止提醒服务
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.logger.info('[ReminderService] Stopping reminder service...');

    // 清除定时器
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }

    // 关闭所有活动通知
    for (const notification of this.activeNotifications.values()) {
      notification.close();
    }
    this.activeNotifications.clear();

    this.isRunning = false;
    this.logger.info('[ReminderService] Reminder service stopped');
  }

  /**
   * 检查服务是否运行中
   */
  isServiceRunning(): boolean {
    return this.isRunning;
  }

  // --------------------------------------------------------------------------
  // 提醒检查
  // --------------------------------------------------------------------------

  /**
   * 检查到期提醒
   */
  private async checkDueReminders(): Promise<void> {
    try {
      const reminderModel = getReminderModel();

      // 获取所有到期的提醒（包括贪睡结束的）
      const dueReminders = await reminderModel.findAllDue();

      for (const reminder of dueReminders) {
        await this.handleDueReminder(reminder);
      }

      // 检查即将到期的提醒（用于提前通知）
      if (this.config.advanceNoticeMinutes > 0) {
        const upcomingReminders = await reminderModel.findUpcoming(this.config.advanceNoticeMinutes);
        if (upcomingReminders.length > 0) {
          this.emit('reminder:upcoming', upcomingReminders);
          this.eventBus?.emit('reminder:upcoming', { reminders: upcomingReminders });
        }
      }
    } catch (error) {
      this.logger.error('[ReminderService] Error checking due reminders:', error);
    }
  }

  /**
   * 处理到期提醒
   */
  private async handleDueReminder(reminder: Reminder): Promise<void> {
    this.logger.info(`[ReminderService] Processing due reminder: ${reminder.id} - ${reminder.title}`);

    // 发出事件
    this.emit('reminder:due', reminder);
    this.eventBus?.emit('reminder:due', { reminder });

    // 显示系统通知
    if (this.config.enableNotifications) {
      await this.showNotification(reminder);
    }
  }

  // --------------------------------------------------------------------------
  // 系统通知
  // --------------------------------------------------------------------------

  /**
   * 显示系统通知
   */
  private async showNotification(reminder: Reminder): Promise<void> {
    // 如果该提醒已有活动通知，先关闭
    const existingNotification = this.activeNotifications.get(reminder.id);
    if (existingNotification) {
      existingNotification.close();
    }

    // 创建通知选项
    const notificationOptions: Electron.NotificationConstructorOptions = {
      title: '⏰ 提醒',
      body: reminder.title,
      silent: false,
      urgency: 'critical',
      timeoutType: 'never', // 需要用户手动关闭
    };

    // 添加详细信息
    if (reminder.description) {
      notificationOptions.body = `${reminder.title}\n${reminder.description}`;
    }

    // 添加图标
    if (this.config.notificationIconPath) {
      try {
        notificationOptions.icon = nativeImage.createFromPath(this.config.notificationIconPath);
      } catch (error) {
        this.logger.warn('[ReminderService] Failed to load notification icon:', error);
      }
    }

    // 在 Windows 上添加操作按钮
    if (process.platform === 'win32') {
      notificationOptions.actions = [
        { type: 'button', text: '贪睡' },
        { type: 'button', text: '关闭' },
      ];
    }

    // 创建并显示通知
    const notification = new Notification(notificationOptions);

    // 处理点击事件
    notification.on('click', () => {
      this.handleNotificationAction(reminder, 'view');
    });

    // 处理关闭事件
    notification.on('close', () => {
      this.activeNotifications.delete(reminder.id);
    });

    // 处理操作按钮（Windows）
    notification.on('action', (_, index) => {
      if (index === 0) {
        this.handleNotificationAction(reminder, 'snooze');
      } else {
        this.handleNotificationAction(reminder, 'dismiss');
      }
    });

    // 显示通知
    notification.show();
    this.activeNotifications.set(reminder.id, notification);

    this.logger.info(`[ReminderService] Notification shown for reminder: ${reminder.id}`);
  }

  /**
   * 处理通知操作
   */
  private async handleNotificationAction(reminder: Reminder, action: NotificationAction): Promise<void> {
    this.logger.info(`[ReminderService] Notification action: ${action} for reminder: ${reminder.id}`);

    try {
      switch (action) {
        case 'snooze':
          await this.snooze(reminder.id);
          break;
        case 'dismiss':
          await this.dismiss(reminder.id);
          break;
        case 'view':
          // 触发查看事件，由主窗口处理
          this.emit('reminder:view', reminder);
          this.eventBus?.emit('reminder:view', { reminder });
          // 聚焦主窗口
          const windows = BrowserWindow.getAllWindows();
          if (windows.length > 0) {
            const mainWindow = windows[0];
            if (mainWindow.isMinimized()) {
              mainWindow.restore();
            }
            mainWindow.focus();
          }
          break;
      }
    } catch (error) {
      this.logger.error(`[ReminderService] Error handling notification action:`, error);
    }
  }

  // --------------------------------------------------------------------------
  // CRUD 操作
  // --------------------------------------------------------------------------

  /**
   * 创建提醒
   */
  async create(input: CreateReminderInput): Promise<Reminder> {
    const reminderModel = getReminderModel();
    const reminder = await reminderModel.create(input);

    this.logger.info(`[ReminderService] Created reminder: ${reminder.id} - ${reminder.title}`);
    
    this.emit('reminder:created', reminder);
    this.eventBus?.emit('reminder:created', { reminder });

    return reminder;
  }

  /**
   * 获取提醒
   */
  async get(id: string): Promise<Reminder | null> {
    const reminderModel = getReminderModel();
    return reminderModel.findById(id);
  }

  /**
   * 更新提醒
   */
  async update(id: string, input: UpdateReminderInput): Promise<Reminder | null> {
    const reminderModel = getReminderModel();
    const reminder = await reminderModel.update(id, input);

    if (reminder) {
      this.logger.info(`[ReminderService] Updated reminder: ${reminder.id}`);
      this.emit('reminder:updated', reminder);
      this.eventBus?.emit('reminder:updated', { reminder });
    }

    return reminder;
  }

  /**
   * 删除提醒
   */
  async delete(id: string): Promise<boolean> {
    // 关闭相关通知
    const notification = this.activeNotifications.get(id);
    if (notification) {
      notification.close();
      this.activeNotifications.delete(id);
    }

    const reminderModel = getReminderModel();
    const result = await reminderModel.delete(id);

    if (result) {
      this.logger.info(`[ReminderService] Deleted reminder: ${id}`);
      this.emit('reminder:deleted', id);
      this.eventBus?.emit('reminder:deleted', { id });
    }

    return result;
  }

  // --------------------------------------------------------------------------
  // 提醒状态操作
  // --------------------------------------------------------------------------

  /**
   * 触发提醒
   */
  async trigger(id: string): Promise<Reminder | null> {
    const reminderModel = getReminderModel();
    const { current, next } = await reminderModel.triggerAndHandleRepeat(id);

    // 关闭相关通知
    const notification = this.activeNotifications.get(id);
    if (notification) {
      notification.close();
      this.activeNotifications.delete(id);
    }

    this.logger.info(`[ReminderService] Triggered reminder: ${id}`);
    this.emit('reminder:triggered', current);
    this.eventBus?.emit('reminder:triggered', { reminder: current, nextReminder: next });

    return current;
  }

  /**
   * 贪睡提醒
   */
  async snooze(id: string, minutes?: number): Promise<Reminder | null> {
    const snoozeMinutes = minutes ?? this.config.defaultSnoozeMinutes;
    const reminderModel = getReminderModel();
    const reminder = await reminderModel.snooze(id, snoozeMinutes);

    if (reminder) {
      // 关闭相关通知
      const notification = this.activeNotifications.get(id);
      if (notification) {
        notification.close();
        this.activeNotifications.delete(id);
      }

      this.logger.info(`[ReminderService] Snoozed reminder: ${id} for ${snoozeMinutes} minutes`);
      this.emit('reminder:snoozed', reminder);
      this.eventBus?.emit('reminder:snoozed', { reminder, snoozeMinutes });
    }

    return reminder;
  }

  /**
   * 解除提醒
   */
  async dismiss(id: string): Promise<Reminder | null> {
    const reminderModel = getReminderModel();
    const reminder = await reminderModel.dismiss(id);

    if (reminder) {
      // 关闭相关通知
      const notification = this.activeNotifications.get(id);
      if (notification) {
        notification.close();
        this.activeNotifications.delete(id);
      }

      this.logger.info(`[ReminderService] Dismissed reminder: ${id}`);
      this.emit('reminder:dismissed', reminder);
      this.eventBus?.emit('reminder:dismissed', { reminder });
    }

    return reminder;
  }

  /**
   * 重新激活提醒
   */
  async reactivate(id: string, newTriggerAt?: Date): Promise<Reminder | null> {
    const reminderModel = getReminderModel();
    const reminder = await reminderModel.reactivate(id, newTriggerAt);

    if (reminder) {
      this.logger.info(`[ReminderService] Reactivated reminder: ${id}`);
      this.emit('reminder:updated', reminder);
      this.eventBus?.emit('reminder:reactivated', { reminder });
    }

    return reminder;
  }

  // --------------------------------------------------------------------------
  // 查询操作
  // --------------------------------------------------------------------------

  /**
   * 获取待处理的提醒
   */
  async getPending(): Promise<Reminder[]> {
    const reminderModel = getReminderModel();
    return reminderModel.findPending();
  }

  /**
   * 获取即将到期的提醒
   */
  async getUpcoming(withinMinutes?: number): Promise<UpcomingReminder[]> {
    const reminderModel = getReminderModel();
    return reminderModel.findUpcoming(withinMinutes ?? 60);
  }

  /**
   * 获取今日提醒
   */
  async getToday(): Promise<Reminder[]> {
    const reminderModel = getReminderModel();
    return reminderModel.findToday();
  }

  /**
   * 获取本周提醒
   */
  async getThisWeek(): Promise<Reminder[]> {
    const reminderModel = getReminderModel();
    return reminderModel.findThisWeek();
  }

  /**
   * 获取与对话关联的提醒
   */
  async getByConversation(conversationId: string): Promise<Reminder[]> {
    const reminderModel = getReminderModel();
    return reminderModel.findByConversationId(conversationId);
  }

  /**
   * 搜索提醒
   */
  async search(query: string, limit?: number): Promise<Reminder[]> {
    const reminderModel = getReminderModel();
    return reminderModel.search(query, limit);
  }

  /**
   * 获取提醒统计
   */
  async getStats(): Promise<ReminderStats> {
    const reminderModel = getReminderModel();
    return reminderModel.getStats();
  }

  // --------------------------------------------------------------------------
  // 维护操作
  // --------------------------------------------------------------------------

  /**
   * 清理旧提醒
   */
  async cleanup(): Promise<{ dismissed: number; triggered: number }> {
    const reminderModel = getReminderModel();
    
    const dismissed = await reminderModel.cleanupDismissed();
    const triggered = await reminderModel.cleanupTriggered();

    this.logger.info(`[ReminderService] Cleanup completed: ${dismissed} dismissed, ${triggered} triggered`);

    return { dismissed, triggered };
  }

  /**
   * 手动触发检查
   */
  async forceCheck(): Promise<void> {
    await this.checkDueReminders();
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<ReminderServiceConfig>): void {
    this.config = { ...this.config, ...config };
    
    // 如果服务正在运行且检查间隔改变，重新启动定时器
    if (this.isRunning && config.checkInterval !== undefined) {
      if (this.checkTimer) {
        clearInterval(this.checkTimer);
      }
      this.checkTimer = setInterval(async () => {
        await this.checkDueReminders();
      }, this.config.checkInterval);
    }

    this.logger.info('[ReminderService] Config updated');
  }

  /**
   * 获取当前配置
   */
  getConfig(): Required<ReminderServiceConfig> {
    return { ...this.config };
  }
}

// ============================================================================
// 便捷函数
// ============================================================================

/**
 * 获取 ReminderService 单例
 */
export function getReminderService(config?: ReminderServiceConfig): ReminderService {
  return ReminderService.getInstance(config);
}

/**
 * 重置 ReminderService 单例（用于测试）
 */
export function resetReminderService(): void {
  ReminderService.resetInstance();
}

// 默认导出
export default ReminderService;