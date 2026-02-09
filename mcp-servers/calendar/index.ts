/**
 * Calendar MCP Server
 * T078 [P] [US4] 实现 calendar MCP服务器
 *
 * 提供日历事件管理工具：
 * - create_event: 创建日历事件
 * - list_events: 列出事件
 * - update_event: 更新事件
 * - delete_event: 删除事件
 * - get_today_events: 获取今日事件
 * - get_upcoming_events: 获取即将到来的事件
 * - search_events: 搜索事件
 * - get_free_slots: 查找空闲时间段
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

interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  startTime: string; // ISO 8601
  endTime: string; // ISO 8601
  location?: string;
  allDay: boolean;
  repeat?: 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly';
  repeatUntil?: string; // ISO 8601
  category?: 'work' | 'personal' | 'meeting' | 'reminder' | 'holiday' | 'other';
  attendees?: string[];
  reminders?: number[]; // 提前多少分钟提醒
  color?: string;
  status: 'confirmed' | 'tentative' | 'cancelled';
  createdAt: string;
  updatedAt: string;
}

interface CalendarStore {
  version: number;
  events: CalendarEvent[];
  settings: {
    defaultReminderMinutes: number;
    workingHoursStart: number; // 0-23
    workingHoursEnd: number; // 0-23
    weekStartsOn: 0 | 1; // 0=Sunday, 1=Monday
  };
}

// ============================================================================
// 工具定义
// ============================================================================

const TOOLS: MCPTool[] = [
  {
    name: 'create_event',
    description: '创建日历事件',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: '事件标题',
        },
        description: {
          type: 'string',
          description: '事件描述',
        },
        startTime: {
          type: 'string',
          description: '开始时间（ISO 8601格式或自然语言如 "tomorrow 2pm", "next Monday 10am"）',
        },
        endTime: {
          type: 'string',
          description: '结束时间（默认开始时间后1小时）',
        },
        location: {
          type: 'string',
          description: '地点',
        },
        allDay: {
          type: 'boolean',
          description: '是否全天事件',
        },
        repeat: {
          type: 'string',
          enum: ['none', 'daily', 'weekly', 'biweekly', 'monthly', 'yearly'],
          description: '重复频率',
        },
        repeatUntil: {
          type: 'string',
          description: '重复截止日期',
        },
        category: {
          type: 'string',
          enum: ['work', 'personal', 'meeting', 'reminder', 'holiday', 'other'],
          description: '事件类别',
        },
        attendees: {
          type: 'array',
          items: { type: 'string' },
          description: '参与者列表',
        },
        reminders: {
          type: 'array',
          items: { type: 'number' },
          description: '提醒时间（提前分钟数列表，如 [15, 60] 表示提前15分钟和60分钟提醒）',
        },
        color: {
          type: 'string',
          description: '事件颜色（十六进制，如 #FF5733）',
        },
      },
      required: ['title', 'startTime'],
    },
  },
  {
    name: 'list_events',
    description: '列出日历事件',
    inputSchema: {
      type: 'object',
      properties: {
        startDate: {
          type: 'string',
          description: '起始日期（默认今天）',
        },
        endDate: {
          type: 'string',
          description: '结束日期（默认起始日期后7天）',
        },
        category: {
          type: 'string',
          enum: ['work', 'personal', 'meeting', 'reminder', 'holiday', 'other'],
          description: '按类别筛选',
        },
        status: {
          type: 'string',
          enum: ['confirmed', 'tentative', 'cancelled', 'all'],
          description: '按状态筛选',
        },
        limit: {
          type: 'number',
          description: '返回数量限制',
        },
      },
    },
  },
  {
    name: 'update_event',
    description: '更新日历事件',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: '事件ID',
        },
        title: {
          type: 'string',
          description: '新标题',
        },
        description: {
          type: 'string',
          description: '新描述',
        },
        startTime: {
          type: 'string',
          description: '新开始时间',
        },
        endTime: {
          type: 'string',
          description: '新结束时间',
        },
        location: {
          type: 'string',
          description: '新地点',
        },
        allDay: {
          type: 'boolean',
          description: '是否全天事件',
        },
        repeat: {
          type: 'string',
          enum: ['none', 'daily', 'weekly', 'biweekly', 'monthly', 'yearly'],
          description: '新重复频率',
        },
        category: {
          type: 'string',
          enum: ['work', 'personal', 'meeting', 'reminder', 'holiday', 'other'],
          description: '新类别',
        },
        status: {
          type: 'string',
          enum: ['confirmed', 'tentative', 'cancelled'],
          description: '新状态',
        },
        attendees: {
          type: 'array',
          items: { type: 'string' },
          description: '新参与者列表',
        },
        reminders: {
          type: 'array',
          items: { type: 'number' },
          description: '新提醒时间',
        },
        color: {
          type: 'string',
          description: '新颜色',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'delete_event',
    description: '删除日历事件',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: '事件ID',
        },
        deleteRecurring: {
          type: 'string',
          enum: ['this', 'all', 'future'],
          description: '对于重复事件：this=仅此次, all=所有, future=此次及以后',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'get_today_events',
    description: '获取今日事件',
    inputSchema: {
      type: 'object',
      properties: {
        includeAllDay: {
          type: 'boolean',
          description: '是否包含全天事件，默认true',
        },
      },
    },
  },
  {
    name: 'get_upcoming_events',
    description: '获取即将到来的事件',
    inputSchema: {
      type: 'object',
      properties: {
        withinHours: {
          type: 'number',
          description: '未来多少小时内，默认24',
        },
        limit: {
          type: 'number',
          description: '返回数量限制，默认10',
        },
      },
    },
  },
  {
    name: 'search_events',
    description: '搜索日历事件',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '搜索关键词（匹配标题、描述、地点）',
        },
        startDate: {
          type: 'string',
          description: '搜索起始日期',
        },
        endDate: {
          type: 'string',
          description: '搜索结束日期',
        },
        limit: {
          type: 'number',
          description: '返回数量限制',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_free_slots',
    description: '查找空闲时间段',
    inputSchema: {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          description: '日期（默认今天）',
        },
        duration: {
          type: 'number',
          description: '所需时长（分钟），默认60',
        },
        workingHoursOnly: {
          type: 'boolean',
          description: '仅工作时间，默认true',
        },
      },
    },
  },
  {
    name: 'get_day_summary',
    description: '获取某天的日程摘要（语音播报友好）',
    inputSchema: {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          description: '日期（默认今天）',
        },
      },
    },
  },
];

// ============================================================================
// 资源定义
// ============================================================================

const RESOURCES: MCPResource[] = [
  {
    uri: 'calendar://today',
    name: '今日日程',
    description: '今天的所有日历事件',
    mimeType: 'application/json',
  },
  {
    uri: 'calendar://week',
    name: '本周日程',
    description: '本周的日历事件',
    mimeType: 'application/json',
  },
  {
    uri: 'calendar://upcoming',
    name: '即将到来',
    description: '即将到来的事件',
    mimeType: 'application/json',
  },
];

// ============================================================================
// 数据存储
// ============================================================================

const DATA_DIR = path.join(os.homedir(), '.desktop-pet', 'mcp-data');
const CALENDAR_FILE = path.join(DATA_DIR, 'calendar.json');

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadCalendar(): CalendarStore {
  ensureDataDir();
  
  if (!fs.existsSync(CALENDAR_FILE)) {
    return {
      version: 1,
      events: [],
      settings: {
        defaultReminderMinutes: 15,
        workingHoursStart: 9,
        workingHoursEnd: 18,
        weekStartsOn: 1,
      },
    };
  }
  
  try {
    const data = fs.readFileSync(CALENDAR_FILE, 'utf-8');
    return JSON.parse(data) as CalendarStore;
  } catch {
    return {
      version: 1,
      events: [],
      settings: {
        defaultReminderMinutes: 15,
        workingHoursStart: 9,
        workingHoursEnd: 18,
        weekStartsOn: 1,
      },
    };
  }
}

function saveCalendar(store: CalendarStore): void {
  ensureDataDir();
  fs.writeFileSync(CALENDAR_FILE, JSON.stringify(store, null, 2), 'utf-8');
}

function generateId(): string {
  return `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// ============================================================================
// 时间解析
// ============================================================================

function parseDateTime(input: string, defaultHour = 9): Date {
  const now = new Date();
  const lower = input.toLowerCase().trim();
  
  // ISO 8601 格式
  if (/^\d{4}-\d{2}-\d{2}/.test(input)) {
    return new Date(input);
  }
  
  // "in X hours/days"
  const inMatch = lower.match(/^in\s+(\d+)\s+(minute|hour|day|week)s?$/);
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
    }
    
    return result;
  }
  
  // "tomorrow [time]"
  if (lower.startsWith('tomorrow')) {
    const result = new Date(now);
    result.setDate(result.getDate() + 1);
    return applyTime(result, lower, defaultHour);
  }
  
  // "today [time]"
  if (lower.startsWith('today')) {
    const result = new Date(now);
    return applyTime(result, lower, defaultHour);
  }
  
  // "next Monday/Tuesday/..."
  const nextDayMatch = lower.match(/^next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/);
  if (nextDayMatch) {
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const targetDay = dayNames.indexOf(nextDayMatch[1]);
    const result = new Date(now);
    const currentDay = result.getDay();
    let daysToAdd = targetDay - currentDay;
    if (daysToAdd <= 0) daysToAdd += 7;
    result.setDate(result.getDate() + daysToAdd);
    return applyTime(result, lower, defaultHour);
  }
  
  // "this Monday/Tuesday/..."
  const thisDayMatch = lower.match(/^this\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/);
  if (thisDayMatch) {
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const targetDay = dayNames.indexOf(thisDayMatch[1]);
    const result = new Date(now);
    const currentDay = result.getDay();
    let daysToAdd = targetDay - currentDay;
    if (daysToAdd < 0) daysToAdd += 7;
    result.setDate(result.getDate() + daysToAdd);
    return applyTime(result, lower, defaultHour);
  }
  
  // 尝试直接解析
  const parsed = new Date(input);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }
  
  // 默认：当前时间
  return now;
}

function applyTime(date: Date, timeStr: string, defaultHour: number): Date {
  const timeMatch = timeStr.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  
  if (timeMatch) {
    let hours = parseInt(timeMatch[1], 10);
    const minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    const meridiem = timeMatch[3];
    
    if (meridiem === 'pm' && hours < 12) hours += 12;
    if (meridiem === 'am' && hours === 12) hours = 0;
    
    date.setHours(hours, minutes, 0, 0);
  } else {
    date.setHours(defaultHour, 0, 0, 0);
  }
  
  return date;
}

function formatDateTime(date: Date): string {
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ============================================================================
// 工具实现
// ============================================================================

async function createEvent(args: {
  title: string;
  description?: string;
  startTime: string;
  endTime?: string;
  location?: string;
  allDay?: boolean;
  repeat?: string;
  repeatUntil?: string;
  category?: string;
  attendees?: string[];
  reminders?: number[];
  color?: string;
}): Promise<unknown> {
  const store = loadCalendar();
  const now = new Date().toISOString();
  
  const startDate = parseDateTime(args.startTime);
  let endDate: Date;
  
  if (args.endTime) {
    endDate = parseDateTime(args.endTime);
  } else if (args.allDay) {
    endDate = new Date(startDate);
    endDate.setHours(23, 59, 59, 999);
  } else {
    endDate = new Date(startDate);
    endDate.setHours(endDate.getHours() + 1);
  }
  
  const event: CalendarEvent = {
    id: generateId(),
    title: args.title,
    description: args.description,
    startTime: startDate.toISOString(),
    endTime: endDate.toISOString(),
    location: args.location,
    allDay: args.allDay || false,
    repeat: (args.repeat as CalendarEvent['repeat']) || 'none',
    repeatUntil: args.repeatUntil ? parseDateTime(args.repeatUntil).toISOString() : undefined,
    category: (args.category as CalendarEvent['category']) || 'other',
    attendees: args.attendees,
    reminders: args.reminders || [store.settings.defaultReminderMinutes],
    color: args.color,
    status: 'confirmed',
    createdAt: now,
    updatedAt: now,
  };
  
  store.events.push(event);
  saveCalendar(store);
  
  return {
    success: true,
    event,
    message: `已创建日历事件: ${event.title}，时间: ${formatDateTime(startDate)}`,
  };
}

async function listEvents(args: {
  startDate?: string;
  endDate?: string;
  category?: string;
  status?: string;
  limit?: number;
}): Promise<unknown> {
  const store = loadCalendar();
  
  const now = new Date();
  const startDate = args.startDate ? parseDateTime(args.startDate) : new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  let endDate: Date;
  if (args.endDate) {
    endDate = parseDateTime(args.endDate);
  } else {
    endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 7);
  }
  
  let events = store.events.filter(e => {
    const eventStart = new Date(e.startTime);
    const eventEnd = new Date(e.endTime);
    
    // 事件在时间范围内
    return eventStart < endDate && eventEnd >= startDate;
  });
  
  // 按类别筛选
  if (args.category) {
    events = events.filter(e => e.category === args.category);
  }
  
  // 按状态筛选
  if (args.status && args.status !== 'all') {
    events = events.filter(e => e.status === args.status);
  }
  
  // 按开始时间排序
  events.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  
  // 限制数量
  if (args.limit && args.limit > 0) {
    events = events.slice(0, args.limit);
  }
  
  return {
    count: events.length,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    events,
  };
}

async function updateEvent(args: {
  id: string;
  title?: string;
  description?: string;
  startTime?: string;
  endTime?: string;
  location?: string;
  allDay?: boolean;
  repeat?: string;
  category?: string;
  status?: string;
  attendees?: string[];
  reminders?: number[];
  color?: string;
}): Promise<unknown> {
  const store = loadCalendar();
  const index = store.events.findIndex(e => e.id === args.id);
  
  if (index === -1) {
    throw new Error(`事件不存在: ${args.id}`);
  }
  
  const event = store.events[index];
  
  if (args.title !== undefined) event.title = args.title;
  if (args.description !== undefined) event.description = args.description;
  if (args.startTime !== undefined) event.startTime = parseDateTime(args.startTime).toISOString();
  if (args.endTime !== undefined) event.endTime = parseDateTime(args.endTime).toISOString();
  if (args.location !== undefined) event.location = args.location;
  if (args.allDay !== undefined) event.allDay = args.allDay;
  if (args.repeat !== undefined) event.repeat = args.repeat as CalendarEvent['repeat'];
  if (args.category !== undefined) event.category = args.category as CalendarEvent['category'];
  if (args.status !== undefined) event.status = args.status as CalendarEvent['status'];
  if (args.attendees !== undefined) event.attendees = args.attendees;
  if (args.reminders !== undefined) event.reminders = args.reminders;
  if (args.color !== undefined) event.color = args.color;
  
  event.updatedAt = new Date().toISOString();
  
  saveCalendar(store);
  
  return {
    success: true,
    event,
    message: `已更新事件: ${event.title}`,
  };
}

async function deleteEvent(args: { id: string; deleteRecurring?: string }): Promise<unknown> {
  const store = loadCalendar();
  const index = store.events.findIndex(e => e.id === args.id);
  
  if (index === -1) {
    throw new Error(`事件不存在: ${args.id}`);
  }
  
  const [deleted] = store.events.splice(index, 1);
  saveCalendar(store);
  
  return {
    success: true,
    deleted,
    message: `已删除事件: ${deleted.title}`,
  };
}

async function getTodayEvents(args: { includeAllDay?: boolean }): Promise<unknown> {
  const { includeAllDay = true } = args;
  const store = loadCalendar();
  
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  
  let events = store.events.filter(e => {
    const eventStart = new Date(e.startTime);
    const eventEnd = new Date(e.endTime);
    
    // 事件在今天
    const isToday = eventStart < todayEnd && eventEnd >= todayStart;
    
    // 排除全天事件（如果需要）
    if (!includeAllDay && e.allDay) return false;
    
    return isToday && e.status !== 'cancelled';
  });
  
  // 按开始时间排序
  events.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  
  return {
    date: todayStart.toISOString().split('T')[0],
    count: events.length,
    events,
  };
}

async function getUpcomingEvents(args: {
  withinHours?: number;
  limit?: number;
}): Promise<unknown> {
  const { withinHours = 24, limit = 10 } = args;
  const store = loadCalendar();
  
  const now = new Date();
  const futureLimit = new Date(now.getTime() + withinHours * 60 * 60 * 1000);
  
  let events = store.events.filter(e => {
    const eventStart = new Date(e.startTime);
    
    return eventStart > now && eventStart <= futureLimit && e.status !== 'cancelled';
  });
  
  // 按开始时间排序
  events.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  
  // 限制数量
  if (limit > 0) {
    events = events.slice(0, limit);
  }
  
  return {
    withinHours,
    count: events.length,
    events,
  };
}

async function searchEvents(args: {
  query: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}): Promise<unknown> {
  const store = loadCalendar();
  const queryLower = args.query.toLowerCase();
  
  let events = store.events.filter(e => {
    // 搜索标题、描述、地点
    const matchTitle = e.title.toLowerCase().includes(queryLower);
    const matchDesc = e.description?.toLowerCase().includes(queryLower) || false;
    const matchLocation = e.location?.toLowerCase().includes(queryLower) || false;
    
    return matchTitle || matchDesc || matchLocation;
  });
  
  // 按日期范围筛选
  if (args.startDate) {
    const startDate = parseDateTime(args.startDate);
    events = events.filter(e => new Date(e.startTime) >= startDate);
  }
  
  if (args.endDate) {
    const endDate = parseDateTime(args.endDate);
    events = events.filter(e => new Date(e.startTime) <= endDate);
  }
  
  // 按开始时间排序
  events.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  
  // 限制数量
  if (args.limit && args.limit > 0) {
    events = events.slice(0, args.limit);
  }
  
  return {
    query: args.query,
    count: events.length,
    events,
  };
}

async function getFreeSlots(args: {
  date?: string;
  duration?: number;
  workingHoursOnly?: boolean;
}): Promise<unknown> {
  const { duration = 60, workingHoursOnly = true } = args;
  const store = loadCalendar();
  
  const targetDate = args.date ? parseDateTime(args.date) : new Date();
  const dayStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  
  // 确定搜索范围
  let rangeStart: Date;
  let rangeEnd: Date;
  
  if (workingHoursOnly) {
    rangeStart = new Date(dayStart);
    rangeStart.setHours(store.settings.workingHoursStart, 0, 0, 0);
    
    rangeEnd = new Date(dayStart);
    rangeEnd.setHours(store.settings.workingHoursEnd, 0, 0, 0);
  } else {
    rangeStart = dayStart;
    rangeEnd = dayEnd;
  }
  
  // 获取当天非取消的事件
  const dayEvents = store.events
    .filter(e => {
      if (e.status === 'cancelled') return false;
      if (e.allDay) return false;
      
      const eventStart = new Date(e.startTime);
      const eventEnd = new Date(e.endTime);
      
      return eventStart < dayEnd && eventEnd > dayStart;
    })
    .map(e => ({
      start: new Date(e.startTime),
      end: new Date(e.endTime),
      title: e.title,
    }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  
  // 查找空闲时间段
  const freeSlots: Array<{ start: string; end: string; durationMinutes: number }> = [];
  let currentTime = rangeStart;
  
  for (const event of dayEvents) {
    // 如果当前时间到事件开始有空隙
    if (event.start > currentTime) {
      const slotDuration = (event.start.getTime() - currentTime.getTime()) / (60 * 1000);
      
      if (slotDuration >= duration) {
        freeSlots.push({
          start: currentTime.toISOString(),
          end: event.start.toISOString(),
          durationMinutes: Math.floor(slotDuration),
        });
      }
    }
    
    // 更新当前时间到事件结束
    if (event.end > currentTime) {
      currentTime = event.end;
    }
  }
  
  // 检查最后一段空闲时间
  if (currentTime < rangeEnd) {
    const slotDuration = (rangeEnd.getTime() - currentTime.getTime()) / (60 * 1000);
    
    if (slotDuration >= duration) {
      freeSlots.push({
        start: currentTime.toISOString(),
        end: rangeEnd.toISOString(),
        durationMinutes: Math.floor(slotDuration),
      });
    }
  }
  
  return {
    date: dayStart.toISOString().split('T')[0],
    requestedDuration: duration,
    workingHoursOnly,
    workingHours: workingHoursOnly ? `${store.settings.workingHoursStart}:00 - ${store.settings.workingHoursEnd}:00` : '全天',
    freeSlots,
    count: freeSlots.length,
  };
}

async function getDaySummary(args: { date?: string }): Promise<unknown> {
  const targetDate = args.date ? parseDateTime(args.date) : new Date();
  const dayStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  
  const store = loadCalendar();
  
  // 获取当天事件
  const dayEvents = store.events
    .filter(e => {
      if (e.status === 'cancelled') return false;
      
      const eventStart = new Date(e.startTime);
      const eventEnd = new Date(e.endTime);
      
      return eventStart < dayEnd && eventEnd >= dayStart;
    })
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  
  // 分类统计
  const allDayEvents = dayEvents.filter(e => e.allDay);
  const timedEvents = dayEvents.filter(e => !e.allDay);
  const meetings = dayEvents.filter(e => e.category === 'meeting');
  
  // 生成语音播报友好的摘要
  const dateStr = dayStart.toLocaleDateString('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });
  
  let summary = `${dateStr}的日程摘要：`;
  
  if (dayEvents.length === 0) {
    summary += '今天没有安排，是自由的一天！';
  } else {
    summary += `共有${dayEvents.length}个事件。`;
    
    if (meetings.length > 0) {
      summary += `其中有${meetings.length}个会议。`;
    }
    
    if (allDayEvents.length > 0) {
      summary += `全天事件：${allDayEvents.map(e => e.title).join('、')}。`;
    }
    
    if (timedEvents.length > 0) {
      const nextEvent = timedEvents.find(e => new Date(e.startTime) > new Date());
      if (nextEvent) {
        const startTime = formatTime(new Date(nextEvent.startTime));
        summary += `下一个事件是${startTime}的"${nextEvent.title}"。`;
      }
      
      // 列出所有定时事件
      summary += `今天的安排：`;
      timedEvents.forEach((e, i) => {
        const time = formatTime(new Date(e.startTime));
        summary += `${time} ${e.title}`;
        if (i < timedEvents.length - 1) summary += '，';
        else summary += '。';
      });
    }
  }
  
  return {
    date: dayStart.toISOString().split('T')[0],
    totalEvents: dayEvents.length,
    allDayEvents: allDayEvents.length,
    timedEvents: timedEvents.length,
    meetings: meetings.length,
    summary,
    events: dayEvents,
  };
}

// ============================================================================
// 工具调用路由
// ============================================================================

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'create_event':
      return createEvent(args as Parameters<typeof createEvent>[0]);
    case 'list_events':
      return listEvents(args as Parameters<typeof listEvents>[0]);
    case 'update_event':
      return updateEvent(args as Parameters<typeof updateEvent>[0]);
    case 'delete_event':
      return deleteEvent(args as { id: string; deleteRecurring?: string });
    case 'get_today_events':
      return getTodayEvents(args as { includeAllDay?: boolean });
    case 'get_upcoming_events':
      return getUpcomingEvents(args as Parameters<typeof getUpcomingEvents>[0]);
    case 'search_events':
      return searchEvents(args as Parameters<typeof searchEvents>[0]);
    case 'get_free_slots':
      return getFreeSlots(args as Parameters<typeof getFreeSlots>[0]);
    case 'get_day_summary':
      return getDaySummary(args as { date?: string });
    default:
      throw new Error(`未知工具: ${name}`);
  }
}

// ============================================================================
// 资源读取
// ============================================================================

async function readResource(uri: string): Promise<{ text: string; mimeType: string }> {
  const store = loadCalendar();
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  
  if (uri === 'calendar://today') {
    const todayEvents = store.events.filter(e => {
      if (e.status === 'cancelled') return false;
      const eventStart = new Date(e.startTime);
      const eventEnd = new Date(e.endTime);
      return eventStart < todayEnd && eventEnd >= todayStart;
    });
    
    return {
      text: JSON.stringify({ count: todayEvents.length, events: todayEvents }, null, 2),
      mimeType: 'application/json',
    };
  }
  
  if (uri === 'calendar://week') {
    const weekEnd = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000);
    const weekEvents = store.events.filter(e => {
      if (e.status === 'cancelled') return false;
      const eventStart = new Date(e.startTime);
      const eventEnd = new Date(e.endTime);
      return eventStart < weekEnd && eventEnd >= todayStart;
    });
    
    return {
      text: JSON.stringify({ count: weekEvents.length, events: weekEvents }, null, 2),
      mimeType: 'application/json',
    };
  }
  
  if (uri === 'calendar://upcoming') {
    const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);
    const upcoming = store.events.filter(e => {
      if (e.status === 'cancelled') return false;
      const eventStart = new Date(e.startTime);
      return eventStart > now && eventStart <= oneHourLater;
    });
    
    return {
      text: JSON.stringify({ count: upcoming.length, events: upcoming }, null, 2),
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
            name: 'calendar',
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