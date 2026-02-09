/**
 * Reminder MCP Server
 * T075 [P] [US4] 实现 reminder MCP服务器
 *
 * 提供提醒管理工具：
 * - create_reminder: 创建提醒
 * - list_reminders: 列出提醒
 * - update_reminder: 更新提醒
 * - delete_reminder: 删除提醒
 * - get_due_reminders: 获取到期提醒
 *
 * @see specs/001-desktop-3d-pet/spec.md FR-012
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as readline from 'readline';

// ============================================================================
// 类型定义
// ============================================================================

interface MCPMessage {
  jsonrpc: '2.0';
  id?: number | string;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface MCPResource {
  uri: string;
  name: string;
  description: string;
  mimeType?: string;
}

interface Reminder {
  id: string;
  title: string;
  description?: string;
  dueTime: string; // ISO 8601
  repeat?: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
  priority: 'low' | 'normal' | 'high';
  status: 'pending' | 'completed' | 'dismissed';
  tags?: string[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

interface ReminderStore {
  version: number;
  reminders: Reminder[];
}

// ============================================================================
// 工具定义
// ============================================================================

const TOOLS: MCPTool[] = [
  {
    name: 'create_reminder',
    description: '创建新提醒',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: '提醒标题',
        },
        description: {
          type: 'string',
          description: '提醒描述',
        },
        dueTime: {
          type: 'string',
          description: '到期时间（ISO 8601格式或相对时间如 "in 5 minutes", "tomorrow 9am"）',
        },
        repeat: {
          type: 'string',
          enum: ['none', 'daily', 'weekly', 'monthly', 'yearly'],
          description: '重复频率',
        },
        priority: {
          type: 'string',
          enum: ['low', 'normal', 'high'],
          description: '优先级',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: '标签列表',
        },
      },
      required: ['title', 'dueTime'],
    },
  },
  {
    name: 'list_reminders',
    description: '列出提醒',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['pending', 'completed', 'dismissed', 'all'],
          description: '按状态筛选',
        },
        priority: {
          type: 'string',
          enum: ['low', 'normal', 'high'],
          description: '按优先级筛选',
        },
        tag: {
          type: 'string',
          description: '按标签筛选',
        },
        limit: {
          type: 'number',
          description: '返回数量限制',
        },
      },
    },
  },
  {
    name: 'update_reminder',
    description: '更新提醒',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: '提醒ID',
        },
        title: {
          type: 'string',
          description: '新标题',
        },
        description: {
          type: 'string',
          description: '新描述',
        },
        dueTime: {
          type: 'string',
          description: '新到期时间',
        },
        repeat: {
          type: 'string',
          enum: ['none', 'daily', 'weekly', 'monthly', 'yearly'],
          description: '新重复频率',
        },
        priority: {
          type: 'string',
          enum: ['low', 'normal', 'high'],
          description: '新优先级',
        },
        status: {
          type: 'string',
          enum: ['pending', 'completed', 'dismissed'],
          description: '新状态',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: '新标签列表',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'delete_reminder',
    description: '删除提醒',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: '提醒ID',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'get_due_reminders',
    description: '获取即将到期或已过期的提醒',
    inputSchema: {
      type: 'object',
      properties: {
        withinMinutes: {
          type: 'number',
          description: '未来多少分钟内到期，默认60',
        },
        includeOverdue: {
          type: 'boolean',
          description: '是否包含已过期未完成的提醒，默认true',
        },
      },
    },
  },
  {
    name: 'complete_reminder',
    description: '标记提醒为已完成',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: '提醒ID',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'snooze_reminder',
    description: '延迟提醒',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: '提醒ID',
        },
        minutes: {
          type: 'number',
          description: '延迟分钟数，默认15',
        },
      },
      required: ['id'],
    },
  },
];

// ============================================================================
// 资源定义
// ============================================================================

const RESOURCES: MCPResource[] = [
  {
    uri: 'reminder://today',
    name: '今日提醒',
    description: '今天的所有提醒',
    mimeType: 'application/json',
  },
  {
    uri: 'reminder://upcoming',
    name: '即将到期',
    description: '即将到期的提醒',
    mimeType: 'application/json',
  },
  {
    uri: 'reminder://overdue',
    name: '已过期',
    description: '已过期未完成的提醒',
    mimeType: 'application/json',
  },
];

// ============================================================================
// 数据存储
// ============================================================================

const DATA_DIR = path.join(os.homedir(), '.desktop-pet', 'mcp-data');
const REMINDERS_FILE = path.join(DATA_DIR, 'reminders.json');

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadReminders(): ReminderStore {
  ensureDataDir();
  
  if (!fs.existsSync(REMINDERS_FILE)) {
    return { version: 1, reminders: [] };
  }
  
  try {
    const data = fs.readFileSync(REMINDERS_FILE, 'utf-8');
    return JSON.parse(data) as ReminderStore;
  } catch {
    return { version: 1, reminders: [] };
  }
}

function saveReminders(store: ReminderStore): void {
  ensureDataDir();
  fs.writeFileSync(REMINDERS_FILE, JSON.stringify(store, null, 2), 'utf-8');
}

function generateId(): string {
  return `rem_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// ============================================================================
// 时间解析
// ============================================================================

function parseRelativeTime(input: string): Date {
  const now = new Date();
  const lower = input.toLowerCase().trim();
  
  // ISO 8601 格式
  if (/^\d{4}-\d{2}-\d{2}/.test(input)) {
    return new Date(input);
  }
  
  // "in X minutes/hours/days"
  const inMatch = lower.match(/^in\s+(\d+)\s+(minute|hour|day|week|month)s?$/);
  if (inMatch) {
    const amount = parseInt(inMatch[1], 10);
    const unit = inMatch[2];
    const result = new Date(now);
    
    switch (unit) {
      case 'minute':
        result.setMinutes(result.getMinutes() + amount);
        break;
      case 'hour':
        result.setHours(result.getHours() + amount);
        break;
      case 'day':
        result.setDate(result.getDate() + amount);
        break;
      case 'week':
        result.setDate(result.getDate() + amount * 7);
        break;
      case 'month':
        result.setMonth(result.getMonth() + amount);
        break;
    }
    
    return result;
  }
  
  // "tomorrow", "tomorrow 9am"
  if (lower.startsWith('tomorrow')) {
    const result = new Date(now);
    result.setDate(result.getDate() + 1);
    
    const timeMatch = lower.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
    if (timeMatch) {
      let hours = parseInt(timeMatch[1], 10);
      const minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
      const meridiem = timeMatch[3];
      
      if (meridiem === 'pm' && hours < 12) hours += 12;
      if (meridiem === 'am' && hours === 12) hours = 0;
      
      result.setHours(hours, minutes, 0, 0);
    } else {
      result.setHours(9, 0, 0, 0); // 默认明天9点
    }
    
    return result;
  }
  
  // "today 3pm"
  if (lower.startsWith('today')) {
    const result = new Date(now);
    
    const timeMatch = lower.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
    if (timeMatch) {
      let hours = parseInt(timeMatch[1], 10);
      const minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
      const meridiem = timeMatch[3];
      
      if (meridiem === 'pm' && hours < 12) hours += 12;
      if (meridiem === 'am' && hours === 12) hours = 0;
      
      result.setHours(hours, minutes, 0, 0);
    }
    
    return result;
  }
  
  // 尝试直接解析
  const parsed = new Date(input);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }
  
  // 默认：5分钟后
  const fallback = new Date(now);
  fallback.setMinutes(fallback.getMinutes() + 5);
  return fallback;
}

// ============================================================================
// 工具实现
// ============================================================================

async function createReminder(args: {
  title: string;
  description?: string;
  dueTime: string;
  repeat?: string;
  priority?: string;
  tags?: string[];
}): Promise<unknown> {
  const store = loadReminders();
  const now = new Date().toISOString();
  
  const reminder: Reminder = {
    id: generateId(),
    title: args.title,
    description: args.description,
    dueTime: parseRelativeTime(args.dueTime).toISOString(),
    repeat: (args.repeat as Reminder['repeat']) || 'none',
    priority: (args.priority as Reminder['priority']) || 'normal',
    status: 'pending',
    tags: args.tags,
    createdAt: now,
    updatedAt: now,
  };
  
  store.reminders.push(reminder);
  saveReminders(store);
  
  return {
    success: true,
    reminder,
    message: `已创建提醒: ${reminder.title}`,
  };
}

async function listReminders(args: {
  status?: string;
  priority?: string;
  tag?: string;
  limit?: number;
}): Promise<unknown> {
  const store = loadReminders();
  let reminders = store.reminders;
  
  // 按状态筛选
  if (args.status && args.status !== 'all') {
    reminders = reminders.filter(r => r.status === args.status);
  }
  
  // 按优先级筛选
  if (args.priority) {
    reminders = reminders.filter(r => r.priority === args.priority);
  }
  
  // 按标签筛选
  if (args.tag) {
    reminders = reminders.filter(r => r.tags?.includes(args.tag!));
  }
  
  // 按到期时间排序
  reminders.sort((a, b) => new Date(a.dueTime).getTime() - new Date(b.dueTime).getTime());
  
  // 限制数量
  if (args.limit && args.limit > 0) {
    reminders = reminders.slice(0, args.limit);
  }
  
  return {
    count: reminders.length,
    reminders,
  };
}

async function updateReminder(args: {
  id: string;
  title?: string;
  description?: string;
  dueTime?: string;
  repeat?: string;
  priority?: string;
  status?: string;
  tags?: string[];
}): Promise<unknown> {
  const store = loadReminders();
  const index = store.reminders.findIndex(r => r.id === args.id);
  
  if (index === -1) {
    throw new Error(`提醒不存在: ${args.id}`);
  }
  
  const reminder = store.reminders[index];
  
  if (args.title !== undefined) reminder.title = args.title;
  if (args.description !== undefined) reminder.description = args.description;
  if (args.dueTime !== undefined) reminder.dueTime = parseRelativeTime(args.dueTime).toISOString();
  if (args.repeat !== undefined) reminder.repeat = args.repeat as Reminder['repeat'];
  if (args.priority !== undefined) reminder.priority = args.priority as Reminder['priority'];
  if (args.status !== undefined) {
    reminder.status = args.status as Reminder['status'];
    if (args.status === 'completed') {
      reminder.completedAt = new Date().toISOString();
    }
  }
  if (args.tags !== undefined) reminder.tags = args.tags;
  
  reminder.updatedAt = new Date().toISOString();
  
  saveReminders(store);
  
  return {
    success: true,
    reminder,
    message: `已更新提醒: ${reminder.title}`,
  };
}

async function deleteReminder(args: { id: string }): Promise<unknown> {
  const store = loadReminders();
  const index = store.reminders.findIndex(r => r.id === args.id);
  
  if (index === -1) {
    throw new Error(`提醒不存在: ${args.id}`);
  }
  
  const [deleted] = store.reminders.splice(index, 1);
  saveReminders(store);
  
  return {
    success: true,
    deleted,
    message: `已删除提醒: ${deleted.title}`,
  };
}

async function getDueReminders(args: {
  withinMinutes?: number;
  includeOverdue?: boolean;
}): Promise<unknown> {
  const { withinMinutes = 60, includeOverdue = true } = args;
  const store = loadReminders();
  const now = new Date();
  const future = new Date(now.getTime() + withinMinutes * 60 * 1000);
  
  const dueReminders = store.reminders.filter(r => {
    if (r.status !== 'pending') return false;
    
    const dueTime = new Date(r.dueTime);
    
    // 已过期
    if (dueTime <= now) {
      return includeOverdue;
    }
    
    // 即将到期
    return dueTime <= future;
  });
  
  // 按到期时间排序
  dueReminders.sort((a, b) => new Date(a.dueTime).getTime() - new Date(b.dueTime).getTime());
  
  const overdue = dueReminders.filter(r => new Date(r.dueTime) <= now);
  const upcoming = dueReminders.filter(r => new Date(r.dueTime) > now);
  
  return {
    count: dueReminders.length,
    overdueCount: overdue.length,
    upcomingCount: upcoming.length,
    reminders: dueReminders,
  };
}

async function completeReminder(args: { id: string }): Promise<unknown> {
  return updateReminder({ id: args.id, status: 'completed' });
}

async function snoozeReminder(args: { id: string; minutes?: number }): Promise<unknown> {
  const { id, minutes = 15 } = args;
  const store = loadReminders();
  const reminder = store.reminders.find(r => r.id === id);
  
  if (!reminder) {
    throw new Error(`提醒不存在: ${id}`);
  }
  
  const newDueTime = new Date();
  newDueTime.setMinutes(newDueTime.getMinutes() + minutes);
  
  return updateReminder({ id, dueTime: newDueTime.toISOString() });
}

// ============================================================================
// 工具调用路由
// ============================================================================

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'create_reminder':
      return createReminder(args as Parameters<typeof createReminder>[0]);
    case 'list_reminders':
      return listReminders(args as Parameters<typeof listReminders>[0]);
    case 'update_reminder':
      return updateReminder(args as Parameters<typeof updateReminder>[0]);
    case 'delete_reminder':
      return deleteReminder(args as { id: string });
    case 'get_due_reminders':
      return getDueReminders(args as Parameters<typeof getDueReminders>[0]);
    case 'complete_reminder':
      return completeReminder(args as { id: string });
    case 'snooze_reminder':
      return snoozeReminder(args as { id: string; minutes?: number });
    default:
      throw new Error(`未知工具: ${name}`);
  }
}

// ============================================================================
// 资源读取
// ============================================================================

async function readResource(uri: string): Promise<{ text: string; mimeType: string }> {
  const store = loadReminders();
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  
  if (uri === 'reminder://today') {
    const todayReminders = store.reminders.filter(r => {
      const dueTime = new Date(r.dueTime);
      return dueTime >= todayStart && dueTime < todayEnd;
    });
    
    return {
      text: JSON.stringify({ count: todayReminders.length, reminders: todayReminders }, null, 2),
      mimeType: 'application/json',
    };
  }
  
  if (uri === 'reminder://upcoming') {
    const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);
    const upcoming = store.reminders.filter(r => {
      if (r.status !== 'pending') return false;
      const dueTime = new Date(r.dueTime);
      return dueTime > now && dueTime <= oneHourLater;
    });
    
    return {
      text: JSON.stringify({ count: upcoming.length, reminders: upcoming }, null, 2),
      mimeType: 'application/json',
    };
  }
  
  if (uri === 'reminder://overdue') {
    const overdue = store.reminders.filter(r => {
      if (r.status !== 'pending') return false;
      return new Date(r.dueTime) < now;
    });
    
    return {
      text: JSON.stringify({ count: overdue.length, reminders: overdue }, null, 2),
      mimeType: 'application/json',
    };
  }
  
  throw new Error(`未知资源: ${uri}`);
}

// ============================================================================
// MCP 协议处理
// ============================================================================

function sendResponse(id: number | string | undefined, result: unknown): void {
  const response: MCPMessage = {
    jsonrpc: '2.0',
    id,
    result,
  };
  process.stdout.write(JSON.stringify(response) + '\n');
}

function sendError(id: number | string | undefined, code: number, message: string): void {
  const response: MCPMessage = {
    jsonrpc: '2.0',
    id,
    error: { code, message },
  };
  process.stdout.write(JSON.stringify(response) + '\n');
}

async function handleMessage(message: MCPMessage): Promise<void> {
  const { id, method, params } = message;
  
  try {
    switch (method) {
      case 'initialize':
        sendResponse(id, {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {},
            resources: {},
          },
          serverInfo: {
            name: 'reminder',
            version: '1.0.0',
          },
        });
        break;
        
      case 'ping':
        sendResponse(id, { pong: true });
        break;
        
      case 'tools/list':
        sendResponse(id, { tools: TOOLS });
        break;
        
      case 'tools/call': {
        const { name, arguments: args } = params as { name: string; arguments: Record<string, unknown> };
        const result = await callTool(name, args || {});
        sendResponse(id, { content: [{ type: 'text', text: JSON.stringify(result) }] });
        break;
      }
        
      case 'resources/list':
        sendResponse(id, { resources: RESOURCES });
        break;
        
      case 'resources/read': {
        const { uri } = params as { uri: string };
        const content = await readResource(uri);
        sendResponse(id, { contents: [content] });
        break;
      }
        
      default:
        sendError(id, -32601, `未知方法: ${method}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    sendError(id, -32000, errorMessage);
  }
}

// ============================================================================
// 主入口
// ============================================================================

function main(): void {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });
  
  rl.on('line', async (line) => {
    if (!line.trim()) return;
    
    try {
      const message = JSON.parse(line) as MCPMessage;
      await handleMessage(message);
    } catch {
      sendError(undefined, -32700, 'JSON 解析错误');
    }
  });
  
  rl.on('close', () => {
    process.exit(0);
  });
  
  process.on('uncaughtException', (error) => {
    process.stderr.write(`Uncaught exception: ${error.message}\n`);
  });
  
  process.on('unhandledRejection', (reason) => {
    process.stderr.write(`Unhandled rejection: ${reason}\n`);
  });
}

main();