/**
 * T068 [US4] Reminder 实体数据访问层
 *
 * 提醒实体的CRUD操作和业务逻辑
 */

import type {
  Reminder,
  CreateReminderInput,
  UpdateReminderInput,
  ReminderQueryParams,
  ReminderRepeatType,
  ReminderStatus,
  PaginatedResult,
} from '../types/models';
import { getDatabaseService } from '../services/database';

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 数据库中的提醒记录格式
 */
interface ReminderRow {
  id: string;
  title: string;
  description: string | null;
  trigger_at: string;
  repeat_type: string;
  repeat_interval: number | null;
  status: string;
  snoozed_until: string | null;
  conversation_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * 提醒统计信息
 */
export interface ReminderStats {
  totalReminders: number;
  pendingReminders: number;
  triggeredReminders: number;
  dismissedReminders: number;
  snoozedReminders: number;
  recurringReminders: number;
}

/**
 * 即将到期的提醒
 */
export interface UpcomingReminder extends Reminder {
  minutesUntilTrigger: number;
}

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 生成唯一ID
 */
function generateId(): string {
  return `rem_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * 将数据库行转换为 Reminder 对象
 */
function rowToReminder(row: ReminderRow): Reminder {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    triggerAt: new Date(row.trigger_at),
    repeatType: row.repeat_type as ReminderRepeatType,
    repeatInterval: row.repeat_interval,
    status: row.status as ReminderStatus,
    snoozedUntil: row.snoozed_until ? new Date(row.snoozed_until) : null,
    conversationId: row.conversation_id,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

/**
 * 计算下次触发时间
 */
function calculateNextTriggerTime(
  currentTrigger: Date,
  repeatType: ReminderRepeatType,
  repeatInterval: number | null
): Date {
  const next = new Date(currentTrigger);
  const interval = repeatInterval || 1;

  switch (repeatType) {
    case 'daily':
      next.setDate(next.getDate() + interval);
      break;
    case 'weekly':
      next.setDate(next.getDate() + 7 * interval);
      break;
    case 'monthly':
      next.setMonth(next.getMonth() + interval);
      break;
    case 'yearly':
      next.setFullYear(next.getFullYear() + interval);
      break;
    default:
      // 'none' - 不重复
      break;
  }

  return next;
}

/**
 * 默认贪睡时间（分钟）
 */
const DEFAULT_SNOOZE_MINUTES = 10;

// ============================================================================
// ReminderModel 类
// ============================================================================

/**
 * 提醒数据访问层
 */
export class ReminderModel {
  /**
   * 创建新提醒
   */
  async create(input: CreateReminderInput): Promise<Reminder> {
    const db = getDatabaseService();
    const id = generateId();
    const now = new Date().toISOString();
    const triggerAt = input.triggerAt instanceof Date 
      ? input.triggerAt.toISOString() 
      : input.triggerAt;

    await db.run(
      `INSERT INTO reminders (id, title, description, trigger_at, repeat_type, repeat_interval, status, snoozed_until, conversation_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', NULL, ?, ?, ?)`,
      [
        id,
        input.title,
        input.description || null,
        triggerAt,
        input.repeatType || 'none',
        input.repeatInterval || null,
        input.conversationId || null,
        now,
        now,
      ]
    );

    const reminder = await this.findById(id);
    if (!reminder) {
      throw new Error('Failed to create reminder');
    }

    return reminder;
  }

  /**
   * 根据ID查找提醒
   */
  async findById(id: string): Promise<Reminder | null> {
    const db = getDatabaseService();
    const row = await db.get<ReminderRow>(
      'SELECT * FROM reminders WHERE id = ?',
      [id]
    );

    return row ? rowToReminder(row) : null;
  }

  /**
   * 查询提醒列表
   */
  async findMany(params: ReminderQueryParams = {}): Promise<PaginatedResult<Reminder>> {
    const db = getDatabaseService();
    const {
      status,
      fromDate,
      toDate,
      page = 1,
      pageSize = 20,
    } = params;

    // 构建WHERE子句
    const conditions: string[] = [];
    const queryParams: (string | number)[] = [];

    if (status) {
      conditions.push('status = ?');
      queryParams.push(status);
    }

    if (fromDate) {
      const fromStr = fromDate instanceof Date ? fromDate.toISOString() : fromDate;
      conditions.push('trigger_at >= ?');
      queryParams.push(fromStr);
    }

    if (toDate) {
      const toStr = toDate instanceof Date ? toDate.toISOString() : toDate;
      conditions.push('trigger_at <= ?');
      queryParams.push(toStr);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // 获取总数
    const countResult = await db.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM reminders ${whereClause}`,
      queryParams
    );
    const total = countResult?.count || 0;

    // 计算分页
    const offset = (page - 1) * pageSize;
    const totalPages = Math.ceil(total / pageSize);

    // 获取数据（按触发时间排序）
    const rows = await db.all<ReminderRow>(
      `SELECT * FROM reminders ${whereClause} ORDER BY trigger_at ASC LIMIT ? OFFSET ?`,
      [...queryParams, pageSize, offset]
    );

    return {
      data: rows.map(rowToReminder),
      total,
      page,
      pageSize,
      totalPages,
    };
  }

  /**
   * 获取待处理的提醒
   */
  async findPending(): Promise<Reminder[]> {
    const db = getDatabaseService();
    const rows = await db.all<ReminderRow>(
      "SELECT * FROM reminders WHERE status = 'pending' ORDER BY trigger_at ASC"
    );
    return rows.map(rowToReminder);
  }

  /**
   * 获取已到期待触发的提醒
   */
  async findDue(): Promise<Reminder[]> {
    const db = getDatabaseService();
    const now = new Date().toISOString();
    const rows = await db.all<ReminderRow>(
      `SELECT * FROM reminders 
       WHERE status = 'pending' AND trigger_at <= ? 
       ORDER BY trigger_at ASC`,
      [now]
    );
    return rows.map(rowToReminder);
  }

  /**
   * 获取已贪睡且贪睡时间已到的提醒
   */
  async findSnoozedDue(): Promise<Reminder[]> {
    const db = getDatabaseService();
    const now = new Date().toISOString();
    const rows = await db.all<ReminderRow>(
      `SELECT * FROM reminders 
       WHERE status = 'snoozed' AND snoozed_until <= ? 
       ORDER BY snoozed_until ASC`,
      [now]
    );
    return rows.map(rowToReminder);
  }

  /**
   * 获取即将到期的提醒（指定分钟内）
   */
  async findUpcoming(withinMinutes = 60): Promise<UpcomingReminder[]> {
    const db = getDatabaseService();
    const now = new Date();
    const future = new Date(now.getTime() + withinMinutes * 60 * 1000);
    
    const rows = await db.all<ReminderRow>(
      `SELECT * FROM reminders 
       WHERE status = 'pending' AND trigger_at > ? AND trigger_at <= ? 
       ORDER BY trigger_at ASC`,
      [now.toISOString(), future.toISOString()]
    );

    return rows.map(row => {
      const reminder = rowToReminder(row);
      const triggerTime = reminder.triggerAt instanceof Date 
        ? reminder.triggerAt 
        : new Date(reminder.triggerAt);
      const minutesUntilTrigger = Math.ceil(
        (triggerTime.getTime() - now.getTime()) / (60 * 1000)
      );
      return {
        ...reminder,
        minutesUntilTrigger,
      };
    });
  }

  /**
   * 获取与对话关联的提醒
   */
  async findByConversationId(conversationId: string): Promise<Reminder[]> {
    const db = getDatabaseService();
    const rows = await db.all<ReminderRow>(
      'SELECT * FROM reminders WHERE conversation_id = ? ORDER BY trigger_at ASC',
      [conversationId]
    );
    return rows.map(rowToReminder);
  }

  /**
   * 更新提醒
   */
  async update(id: string, input: UpdateReminderInput): Promise<Reminder | null> {
    const db = getDatabaseService();
    const existing = await this.findById(id);
    if (!existing) {
      return null;
    }

    const updates: string[] = ['updated_at = ?'];
    const params: (string | number | null)[] = [new Date().toISOString()];

    if (input.title !== undefined) {
      updates.push('title = ?');
      params.push(input.title);
    }

    if (input.description !== undefined) {
      updates.push('description = ?');
      params.push(input.description);
    }

    if (input.triggerAt !== undefined) {
      const triggerStr = input.triggerAt instanceof Date 
        ? input.triggerAt.toISOString() 
        : input.triggerAt;
      updates.push('trigger_at = ?');
      params.push(triggerStr);
    }

    if (input.repeatType !== undefined) {
      updates.push('repeat_type = ?');
      params.push(input.repeatType);
    }

    if (input.repeatInterval !== undefined) {
      updates.push('repeat_interval = ?');
      params.push(input.repeatInterval);
    }

    if (input.status !== undefined) {
      updates.push('status = ?');
      params.push(input.status);
    }

    if (input.snoozedUntil !== undefined) {
      const snoozedStr = input.snoozedUntil 
        ? (input.snoozedUntil instanceof Date ? input.snoozedUntil.toISOString() : input.snoozedUntil)
        : null;
      updates.push('snoozed_until = ?');
      params.push(snoozedStr);
    }

    params.push(id);

    await db.run(
      `UPDATE reminders SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    return this.findById(id);
  }

  /**
   * 触发提醒
   */
  async trigger(id: string): Promise<Reminder | null> {
    return this.update(id, { status: 'triggered' });
  }

  /**
   * 触发提醒并处理重复
   * 如果是重复提醒，则创建下一次提醒并标记当前为triggered
   * 如果不是重复提醒，则直接标记为triggered
   */
  async triggerAndHandleRepeat(id: string): Promise<{ current: Reminder; next: Reminder | null }> {
    const reminder = await this.findById(id);
    if (!reminder) {
      throw new Error(`Reminder not found: ${id}`);
    }

    // 标记当前提醒为已触发
    const current = await this.trigger(id);
    if (!current) {
      throw new Error(`Failed to trigger reminder: ${id}`);
    }

    // 如果是重复提醒，创建下一次
    let next: Reminder | null = null;
    if (reminder.repeatType !== 'none') {
      const triggerAt = reminder.triggerAt instanceof Date 
        ? reminder.triggerAt 
        : new Date(reminder.triggerAt);
      const nextTriggerAt = calculateNextTriggerTime(
        triggerAt,
        reminder.repeatType,
        reminder.repeatInterval
      );

      next = await this.create({
        title: reminder.title,
        description: reminder.description || undefined,
        triggerAt: nextTriggerAt,
        repeatType: reminder.repeatType,
        repeatInterval: reminder.repeatInterval || undefined,
        conversationId: reminder.conversationId || undefined,
      });
    }

    return { current, next };
  }

  /**
   * 贪睡提醒
   */
  async snooze(id: string, minutes = DEFAULT_SNOOZE_MINUTES): Promise<Reminder | null> {
    const snoozedUntil = new Date(Date.now() + minutes * 60 * 1000);
    return this.update(id, { 
      status: 'snoozed', 
      snoozedUntil 
    });
  }

  /**
   * 取消贪睡（恢复为pending）
   */
  async cancelSnooze(id: string): Promise<Reminder | null> {
    return this.update(id, { 
      status: 'pending', 
      snoozedUntil: undefined 
    });
  }

  /**
   * 解除提醒（标记为dismissed）
   */
  async dismiss(id: string): Promise<Reminder | null> {
    return this.update(id, { status: 'dismissed' });
  }

  /**
   * 重新激活已解除的提醒
   */
  async reactivate(id: string, newTriggerAt?: Date): Promise<Reminder | null> {
    const reminder = await this.findById(id);
    if (!reminder) {
      return null;
    }

    const updateInput: UpdateReminderInput = { 
      status: 'pending',
      snoozedUntil: undefined,
    };

    if (newTriggerAt) {
      updateInput.triggerAt = newTriggerAt;
    }

    return this.update(id, updateInput);
  }

  /**
   * 删除提醒
   */
  async delete(id: string): Promise<boolean> {
    const db = getDatabaseService();
    const result = await db.run('DELETE FROM reminders WHERE id = ?', [id]);
    return (result?.changes ?? 0) > 0;
  }

  /**
   * 批量删除提醒
   */
  async deleteMany(ids: string[]): Promise<number> {
    if (ids.length === 0) {
      return 0;
    }

    const db = getDatabaseService();
    const placeholders = ids.map(() => '?').join(', ');
    const result = await db.run(
      `DELETE FROM reminders WHERE id IN (${placeholders})`,
      ids
    );

    return result?.changes ?? 0;
  }

  /**
   * 删除与对话关联的所有提醒
   */
  async deleteByConversationId(conversationId: string): Promise<number> {
    const db = getDatabaseService();
    const result = await db.run(
      'DELETE FROM reminders WHERE conversation_id = ?',
      [conversationId]
    );
    return result?.changes ?? 0;
  }

  /**
   * 清理已解除的旧提醒
   */
  async cleanupDismissed(olderThanDays = 7): Promise<number> {
    const db = getDatabaseService();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const result = await db.run(
      "DELETE FROM reminders WHERE status = 'dismissed' AND updated_at < ?",
      [cutoffDate.toISOString()]
    );

    return result?.changes ?? 0;
  }

  /**
   * 清理已触发的非重复旧提醒
   */
  async cleanupTriggered(olderThanDays = 30): Promise<number> {
    const db = getDatabaseService();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const result = await db.run(
      `DELETE FROM reminders 
       WHERE status = 'triggered' AND repeat_type = 'none' AND updated_at < ?`,
      [cutoffDate.toISOString()]
    );

    return result?.changes ?? 0;
  }

  /**
   * 获取提醒统计信息
   */
  async getStats(): Promise<ReminderStats> {
    const db = getDatabaseService();
    
    const stats = await db.get<{
      total: number;
      pending: number;
      triggered: number;
      dismissed: number;
      snoozed: number;
      recurring: number;
    }>(
      `SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'triggered' THEN 1 ELSE 0 END) as triggered,
        SUM(CASE WHEN status = 'dismissed' THEN 1 ELSE 0 END) as dismissed,
        SUM(CASE WHEN status = 'snoozed' THEN 1 ELSE 0 END) as snoozed,
        SUM(CASE WHEN repeat_type != 'none' THEN 1 ELSE 0 END) as recurring
       FROM reminders`
    );

    return {
      totalReminders: stats?.total || 0,
      pendingReminders: stats?.pending || 0,
      triggeredReminders: stats?.triggered || 0,
      dismissedReminders: stats?.dismissed || 0,
      snoozedReminders: stats?.snoozed || 0,
      recurringReminders: stats?.recurring || 0,
    };
  }

  /**
   * 搜索提醒（按标题和描述）
   */
  async search(query: string, limit = 20): Promise<Reminder[]> {
    const db = getDatabaseService();
    const searchPattern = `%${query}%`;
    
    const rows = await db.all<ReminderRow>(
      `SELECT * FROM reminders 
       WHERE title LIKE ? OR description LIKE ? 
       ORDER BY trigger_at ASC LIMIT ?`,
      [searchPattern, searchPattern, limit]
    );

    return rows.map(rowToReminder);
  }

  /**
   * 检查提醒是否存在
   */
  async exists(id: string): Promise<boolean> {
    const db = getDatabaseService();
    const result = await db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM reminders WHERE id = ?',
      [id]
    );
    return (result?.count ?? 0) > 0;
  }

  /**
   * 获取提醒数量
   */
  async count(status?: ReminderStatus): Promise<number> {
    const db = getDatabaseService();
    
    if (status) {
      const result = await db.get<{ count: number }>(
        'SELECT COUNT(*) as count FROM reminders WHERE status = ?',
        [status]
      );
      return result?.count ?? 0;
    }

    const result = await db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM reminders'
    );
    return result?.count ?? 0;
  }

  /**
   * 获取今日提醒
   */
  async findToday(): Promise<Reminder[]> {
    const db = getDatabaseService();
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

    const rows = await db.all<ReminderRow>(
      `SELECT * FROM reminders 
       WHERE trigger_at >= ? AND trigger_at < ? 
       ORDER BY trigger_at ASC`,
      [startOfDay.toISOString(), endOfDay.toISOString()]
    );

    return rows.map(rowToReminder);
  }

  /**
   * 获取本周提醒
   */
  async findThisWeek(): Promise<Reminder[]> {
    const db = getDatabaseService();
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const endOfWeek = new Date(startOfWeek.getTime() + 7 * 24 * 60 * 60 * 1000);

    const rows = await db.all<ReminderRow>(
      `SELECT * FROM reminders 
       WHERE trigger_at >= ? AND trigger_at < ? 
       ORDER BY trigger_at ASC`,
      [startOfWeek.toISOString(), endOfWeek.toISOString()]
    );

    return rows.map(rowToReminder);
  }

  /**
   * 检查是否有需要处理的提醒（到期或贪睡结束）
   */
  async hasDueReminders(): Promise<boolean> {
    const [due, snoozedDue] = await Promise.all([
      this.findDue(),
      this.findSnoozedDue(),
    ]);
    return due.length > 0 || snoozedDue.length > 0;
  }

  /**
   * 获取所有需要处理的提醒（到期 + 贪睡结束）
   */
  async findAllDue(): Promise<Reminder[]> {
    const [due, snoozedDue] = await Promise.all([
      this.findDue(),
      this.findSnoozedDue(),
    ]);
    
    // 合并并按时间排序
    const all = [...due, ...snoozedDue];
    all.sort((a, b) => {
      const timeA = a.status === 'snoozed' && a.snoozedUntil 
        ? new Date(a.snoozedUntil).getTime()
        : new Date(a.triggerAt).getTime();
      const timeB = b.status === 'snoozed' && b.snoozedUntil
        ? new Date(b.snoozedUntil).getTime()
        : new Date(b.triggerAt).getTime();
      return timeA - timeB;
    });

    return all;
  }
}

// ============================================================================
// 单例导出
// ============================================================================

let reminderModel: ReminderModel | null = null;

/**
 * 获取 ReminderModel 单例
 */
export function getReminderModel(): ReminderModel {
  if (!reminderModel) {
    reminderModel = new ReminderModel();
  }
  return reminderModel;
}

/**
 * 重置 ReminderModel 单例（用于测试）
 */
export function resetReminderModel(): void {
  reminderModel = null;
}

// 默认导出
export default ReminderModel;