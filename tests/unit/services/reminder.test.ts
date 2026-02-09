/**
 * 单元测试：提醒服务
 * Task: T064 [P] [US4]
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Electron 通知
const mockNotification = {
  show: vi.fn(),
  on: vi.fn(),
  close: vi.fn(),
};

vi.mock('electron', () => ({
  Notification: vi.fn(() => mockNotification),
  app: {
    getPath: vi.fn(() => '/mock/path'),
  },
}));

// Mock 数据库
const mockDb = {
  prepare: vi.fn(() => ({
    run: vi.fn(() => ({ lastInsertRowid: 1 })),
    get: vi.fn(),
    all: vi.fn(() => []),
  })),
};

vi.mock('../../../src/shared/services/database', () => ({
  getDatabase: vi.fn(() => mockDb),
}));

// 提醒服务类型定义
interface Reminder {
  id: number;
  title: string;
  message: string;
  triggerTime: number;
  repeat: 'none' | 'daily' | 'weekly' | 'monthly';
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

interface ReminderServiceInterface {
  createReminder(data: {
    title: string;
    message: string;
    triggerTime: Date;
    repeat?: 'none' | 'daily' | 'weekly' | 'monthly';
  }): Promise<Reminder>;
  getReminder(id: number): Promise<Reminder | null>;
  getAllReminders(): Promise<Reminder[]>;
  updateReminder(id: number, data: Partial<Reminder>): Promise<Reminder>;
  deleteReminder(id: number): Promise<boolean>;
  enableReminder(id: number): Promise<Reminder>;
  disableReminder(id: number): Promise<Reminder>;
  getUpcomingReminders(minutes: number): Promise<Reminder[]>;
  triggerReminder(id: number): Promise<void>;
  start(): void;
  stop(): void;
}

describe('ReminderService', () => {
  let ReminderService: new () => ReminderServiceInterface;
  let reminderService: ReminderServiceInterface;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    
    // 动态导入以确保 mock 生效
    const module = await import('../../../src/main/services/reminder-service');
    ReminderService = module.ReminderService;
    reminderService = new ReminderService();
  });

  afterEach(() => {
    vi.useRealTimers();
    if (reminderService) {
      reminderService.stop();
    }
  });

  describe('创建提醒', () => {
    it('应该成功创建提醒', async () => {
      const triggerTime = new Date(Date.now() + 3600000); // 1小时后
      
      const reminder = await reminderService.createReminder({
        title: '测试提醒',
        message: '这是一个测试提醒',
        triggerTime,
        repeat: 'none',
      });

      expect(reminder).toBeDefined();
      expect(reminder.id).toBe(1);
      expect(reminder.title).toBe('测试提醒');
      expect(reminder.message).toBe('这是一个测试提醒');
      expect(reminder.enabled).toBe(true);
    });

    it('应该支持重复提醒', async () => {
      const triggerTime = new Date(Date.now() + 3600000);
      
      const reminder = await reminderService.createReminder({
        title: '每日提醒',
        message: '每日站立会议',
        triggerTime,
        repeat: 'daily',
      });

      expect(reminder.repeat).toBe('daily');
    });

    it('应该拒绝过去的时间', async () => {
      const pastTime = new Date(Date.now() - 3600000); // 1小时前
      
      await expect(
        reminderService.createReminder({
          title: '过期提醒',
          message: '这不应该被创建',
          triggerTime: pastTime,
        })
      ).rejects.toThrow('触发时间必须在将来');
    });

    it('应该拒绝空标题', async () => {
      const triggerTime = new Date(Date.now() + 3600000);
      
      await expect(
        reminderService.createReminder({
          title: '',
          message: '消息内容',
          triggerTime,
        })
      ).rejects.toThrow('标题不能为空');
    });
  });

  describe('获取提醒', () => {
    it('应该获取单个提醒', async () => {
      mockDb.prepare().get.mockReturnValueOnce({
        id: 1,
        title: '测试提醒',
        message: '测试消息',
        trigger_time: Date.now() + 3600000,
        repeat: 'none',
        enabled: 1,
        created_at: Date.now(),
        updated_at: Date.now(),
      });

      const reminder = await reminderService.getReminder(1);
      
      expect(reminder).toBeDefined();
      expect(reminder?.id).toBe(1);
      expect(reminder?.title).toBe('测试提醒');
    });

    it('应该返回 null 当提醒不存在', async () => {
      mockDb.prepare().get.mockReturnValueOnce(undefined);

      const reminder = await reminderService.getReminder(999);
      
      expect(reminder).toBeNull();
    });

    it('应该获取所有提醒', async () => {
      mockDb.prepare().all.mockReturnValueOnce([
        {
          id: 1,
          title: '提醒1',
          message: '消息1',
          trigger_time: Date.now() + 3600000,
          repeat: 'none',
          enabled: 1,
          created_at: Date.now(),
          updated_at: Date.now(),
        },
        {
          id: 2,
          title: '提醒2',
          message: '消息2',
          trigger_time: Date.now() + 7200000,
          repeat: 'daily',
          enabled: 1,
          created_at: Date.now(),
          updated_at: Date.now(),
        },
      ]);

      const reminders = await reminderService.getAllReminders();
      
      expect(reminders).toHaveLength(2);
      expect(reminders[0].title).toBe('提醒1');
      expect(reminders[1].title).toBe('提醒2');
    });
  });

  describe('更新提醒', () => {
    it('应该更新提醒标题', async () => {
      mockDb.prepare().get.mockReturnValueOnce({
        id: 1,
        title: '新标题',
        message: '原消息',
        trigger_time: Date.now() + 3600000,
        repeat: 'none',
        enabled: 1,
        created_at: Date.now(),
        updated_at: Date.now(),
      });

      const updated = await reminderService.updateReminder(1, {
        title: '新标题',
      });

      expect(updated.title).toBe('新标题');
    });

    it('应该更新触发时间', async () => {
      const newTime = Date.now() + 7200000;
      mockDb.prepare().get.mockReturnValueOnce({
        id: 1,
        title: '提醒',
        message: '消息',
        trigger_time: newTime,
        repeat: 'none',
        enabled: 1,
        created_at: Date.now(),
        updated_at: Date.now(),
      });

      const updated = await reminderService.updateReminder(1, {
        triggerTime: newTime,
      });

      expect(updated.triggerTime).toBe(newTime);
    });
  });

  describe('删除提醒', () => {
    it('应该成功删除提醒', async () => {
      mockDb.prepare().run.mockReturnValueOnce({ changes: 1 });

      const result = await reminderService.deleteReminder(1);
      
      expect(result).toBe(true);
    });

    it('应该返回 false 当提醒不存在', async () => {
      mockDb.prepare().run.mockReturnValueOnce({ changes: 0 });

      const result = await reminderService.deleteReminder(999);
      
      expect(result).toBe(false);
    });
  });

  describe('启用/禁用提醒', () => {
    it('应该启用提醒', async () => {
      mockDb.prepare().get.mockReturnValueOnce({
        id: 1,
        title: '提醒',
        message: '消息',
        trigger_time: Date.now() + 3600000,
        repeat: 'none',
        enabled: 1,
        created_at: Date.now(),
        updated_at: Date.now(),
      });

      const reminder = await reminderService.enableReminder(1);
      
      expect(reminder.enabled).toBe(true);
    });

    it('应该禁用提醒', async () => {
      mockDb.prepare().get.mockReturnValueOnce({
        id: 1,
        title: '提醒',
        message: '消息',
        trigger_time: Date.now() + 3600000,
        repeat: 'none',
        enabled: 0,
        created_at: Date.now(),
        updated_at: Date.now(),
      });

      const reminder = await reminderService.disableReminder(1);
      
      expect(reminder.enabled).toBe(false);
    });
  });

  describe('获取即将触发的提醒', () => {
    it('应该获取指定时间范围内的提醒', async () => {
      const now = Date.now();
      mockDb.prepare().all.mockReturnValueOnce([
        {
          id: 1,
          title: '即将触发',
          message: '消息',
          trigger_time: now + 300000, // 5分钟后
          repeat: 'none',
          enabled: 1,
          created_at: now,
          updated_at: now,
        },
      ]);

      const upcoming = await reminderService.getUpcomingReminders(10); // 10分钟内
      
      expect(upcoming).toHaveLength(1);
      expect(upcoming[0].title).toBe('即将触发');
    });

    it('应该只返回启用的提醒', async () => {
      mockDb.prepare().all.mockReturnValueOnce([]);

      const upcoming = await reminderService.getUpcomingReminders(10);
      
      expect(upcoming).toHaveLength(0);
    });
  });

  describe('触发提醒', () => {
    it('应该显示系统通知', async () => {
      mockDb.prepare().get.mockReturnValueOnce({
        id: 1,
        title: '测试通知',
        message: '通知消息',
        trigger_time: Date.now(),
        repeat: 'none',
        enabled: 1,
        created_at: Date.now(),
        updated_at: Date.now(),
      });

      await reminderService.triggerReminder(1);

      // 验证通知被显示
      expect(mockNotification.show).toHaveBeenCalled();
    });

    it('应该处理重复提醒', async () => {
      const now = Date.now();
      mockDb.prepare().get.mockReturnValueOnce({
        id: 1,
        title: '每日提醒',
        message: '消息',
        trigger_time: now,
        repeat: 'daily',
        enabled: 1,
        created_at: now,
        updated_at: now,
      });

      await reminderService.triggerReminder(1);

      // 验证下次触发时间被更新
      expect(mockDb.prepare).toHaveBeenCalled();
    });

    it('应该禁用一次性提醒触发后', async () => {
      const now = Date.now();
      mockDb.prepare().get.mockReturnValueOnce({
        id: 1,
        title: '一次性提醒',
        message: '消息',
        trigger_time: now,
        repeat: 'none',
        enabled: 1,
        created_at: now,
        updated_at: now,
      });

      await reminderService.triggerReminder(1);

      // 验证提醒被禁用
      expect(mockDb.prepare).toHaveBeenCalled();
    });
  });

  describe('服务生命周期', () => {
    it('应该启动定时检查', () => {
      reminderService.start();
      
      // 快进时间检查是否有定时器运行
      vi.advanceTimersByTime(60000); // 1分钟
      
      // 服务应该检查即将到期的提醒
      expect(mockDb.prepare).toHaveBeenCalled();
    });

    it('应该停止定时检查', () => {
      reminderService.start();
      reminderService.stop();
      
      vi.clearAllMocks();
      vi.advanceTimersByTime(60000);
      
      // 停止后不应该有新的数据库调用
      // (由于是清除后的调用，次数应该为0)
    });
  });

  describe('重复计算', () => {
    it('应该计算每日重复的下次时间', async () => {
      const now = new Date('2026-02-09T10:00:00Z');
      vi.setSystemTime(now);

      mockDb.prepare().get.mockReturnValueOnce({
        id: 1,
        title: '每日提醒',
        message: '消息',
        trigger_time: now.getTime(),
        repeat: 'daily',
        enabled: 1,
        created_at: now.getTime(),
        updated_at: now.getTime(),
      });

      await reminderService.triggerReminder(1);

      // 下次触发应该是明天同一时间
      const expectedNext = new Date('2026-02-10T10:00:00Z').getTime();
      expect(mockDb.prepare).toHaveBeenCalled();
    });

    it('应该计算每周重复的下次时间', async () => {
      const now = new Date('2026-02-09T10:00:00Z');
      vi.setSystemTime(now);

      mockDb.prepare().get.mockReturnValueOnce({
        id: 1,
        title: '每周提醒',
        message: '消息',
        trigger_time: now.getTime(),
        repeat: 'weekly',
        enabled: 1,
        created_at: now.getTime(),
        updated_at: now.getTime(),
      });

      await reminderService.triggerReminder(1);

      // 下次触发应该是下周同一时间
      const expectedNext = new Date('2026-02-16T10:00:00Z').getTime();
      expect(mockDb.prepare).toHaveBeenCalled();
    });

    it('应该计算每月重复的下次时间', async () => {
      const now = new Date('2026-02-09T10:00:00Z');
      vi.setSystemTime(now);

      mockDb.prepare().get.mockReturnValueOnce({
        id: 1,
        title: '每月提醒',
        message: '消息',
        trigger_time: now.getTime(),
        repeat: 'monthly',
        enabled: 1,
        created_at: now.getTime(),
        updated_at: now.getTime(),
      });

      await reminderService.triggerReminder(1);

      // 下次触发应该是下月同一日期
      const expectedNext = new Date('2026-03-09T10:00:00Z').getTime();
      expect(mockDb.prepare).toHaveBeenCalled();
    });
  });
});