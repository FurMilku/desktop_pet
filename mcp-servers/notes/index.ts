/**
 * Notes MCP Server
 * T076 [P] [US4] 实现 notes MCP服务器
 *
 * 提供笔记管理工具：
 * - create_note: 创建笔记
 * - list_notes: 列出笔记
 * - get_note: 获取笔记详情
 * - update_note: 更新笔记
 * - delete_note: 删除笔记
 * - search_notes: 搜索笔记
 * - archive_note: 归档笔记
 * - pin_note: 置顶笔记
 *
 * @see specs/001-desktop-3d-pet/spec.md FR-013
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

interface Note {
  id: string;
  title: string;
  content: string;
  category?: string;
  tags?: string[];
  isPinned: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

interface NoteStore {
  version: number;
  notes: Note[];
}

// ============================================================================
// 工具定义
// ============================================================================

const TOOLS: MCPTool[] = [
  {
    name: 'create_note',
    description: '创建新笔记',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: '笔记标题',
        },
        content: {
          type: 'string',
          description: '笔记内容（支持Markdown）',
        },
        category: {
          type: 'string',
          description: '笔记分类',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: '标签列表',
        },
      },
      required: ['title', 'content'],
    },
  },
  {
    name: 'list_notes',
    description: '列出笔记',
    inputSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: '按分类筛选',
        },
        tag: {
          type: 'string',
          description: '按标签筛选',
        },
        includeArchived: {
          type: 'boolean',
          description: '是否包含已归档笔记，默认false',
        },
        sortBy: {
          type: 'string',
          enum: ['createdAt', 'updatedAt', 'title'],
          description: '排序字段，默认updatedAt',
        },
        sortOrder: {
          type: 'string',
          enum: ['asc', 'desc'],
          description: '排序方向，默认desc',
        },
        limit: {
          type: 'number',
          description: '返回数量限制',
        },
      },
    },
  },
  {
    name: 'get_note',
    description: '获取笔记详情',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: '笔记ID',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'update_note',
    description: '更新笔记',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: '笔记ID',
        },
        title: {
          type: 'string',
          description: '新标题',
        },
        content: {
          type: 'string',
          description: '新内容',
        },
        category: {
          type: 'string',
          description: '新分类',
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
    name: 'delete_note',
    description: '删除笔记',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: '笔记ID',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'search_notes',
    description: '搜索笔记（标题和内容）',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '搜索关键词',
        },
        caseSensitive: {
          type: 'boolean',
          description: '是否区分大小写，默认false',
        },
        includeArchived: {
          type: 'boolean',
          description: '是否搜索已归档笔记，默认false',
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
    name: 'archive_note',
    description: '归档/取消归档笔记',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: '笔记ID',
        },
        archive: {
          type: 'boolean',
          description: 'true归档，false取消归档',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'pin_note',
    description: '置顶/取消置顶笔记',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: '笔记ID',
        },
        pin: {
          type: 'boolean',
          description: 'true置顶，false取消置顶',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'get_categories',
    description: '获取所有笔记分类',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_tags',
    description: '获取所有笔记标签',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

// ============================================================================
// 资源定义
// ============================================================================

const RESOURCES: MCPResource[] = [
  {
    uri: 'notes://recent',
    name: '最近笔记',
    description: '最近更新的笔记',
    mimeType: 'application/json',
  },
  {
    uri: 'notes://pinned',
    name: '置顶笔记',
    description: '已置顶的笔记',
    mimeType: 'application/json',
  },
  {
    uri: 'notes://categories',
    name: '分类列表',
    description: '所有笔记分类',
    mimeType: 'application/json',
  },
];

// ============================================================================
// 数据存储
// ============================================================================

const DATA_DIR = path.join(os.homedir(), '.desktop-pet', 'mcp-data');
const NOTES_FILE = path.join(DATA_DIR, 'notes.json');

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadNotes(): NoteStore {
  ensureDataDir();
  
  if (!fs.existsSync(NOTES_FILE)) {
    return { version: 1, notes: [] };
  }
  
  try {
    const data = fs.readFileSync(NOTES_FILE, 'utf-8');
    return JSON.parse(data) as NoteStore;
  } catch {
    return { version: 1, notes: [] };
  }
}

function saveNotes(store: NoteStore): void {
  ensureDataDir();
  fs.writeFileSync(NOTES_FILE, JSON.stringify(store, null, 2), 'utf-8');
}

function generateId(): string {
  return `note_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// ============================================================================
// 工具实现
// ============================================================================

async function createNote(args: {
  title: string;
  content: string;
  category?: string;
  tags?: string[];
}): Promise<unknown> {
  const store = loadNotes();
  const now = new Date().toISOString();
  
  const note: Note = {
    id: generateId(),
    title: args.title,
    content: args.content,
    category: args.category,
    tags: args.tags,
    isPinned: false,
    isArchived: false,
    createdAt: now,
    updatedAt: now,
  };
  
  store.notes.push(note);
  saveNotes(store);
  
  return {
    success: true,
    note,
    message: `已创建笔记: ${note.title}`,
  };
}

async function listNotes(args: {
  category?: string;
  tag?: string;
  includeArchived?: boolean;
  sortBy?: string;
  sortOrder?: string;
  limit?: number;
}): Promise<unknown> {
  const store = loadNotes();
  const { includeArchived = false, sortBy = 'updatedAt', sortOrder = 'desc', limit } = args;
  
  let notes = store.notes;
  
  // 排除已归档笔记
  if (!includeArchived) {
    notes = notes.filter(n => !n.isArchived);
  }
  
  // 按分类筛选
  if (args.category) {
    notes = notes.filter(n => n.category === args.category);
  }
  
  // 按标签筛选
  if (args.tag) {
    notes = notes.filter(n => n.tags?.includes(args.tag!));
  }
  
  // 排序（置顶笔记始终在前）
  notes.sort((a, b) => {
    // 置顶优先
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    
    // 按指定字段排序
    let aVal: string | number;
    let bVal: string | number;
    
    switch (sortBy) {
      case 'title':
        aVal = a.title;
        bVal = b.title;
        break;
      case 'createdAt':
        aVal = new Date(a.createdAt).getTime();
        bVal = new Date(b.createdAt).getTime();
        break;
      default: // updatedAt
        aVal = new Date(a.updatedAt).getTime();
        bVal = new Date(b.updatedAt).getTime();
    }
    
    if (sortOrder === 'asc') {
      return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
    } else {
      return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
    }
  });
  
  // 限制数量
  if (limit && limit > 0) {
    notes = notes.slice(0, limit);
  }
  
  // 返回摘要（不含完整内容）
  const summaries = notes.map(n => ({
    id: n.id,
    title: n.title,
    category: n.category,
    tags: n.tags,
    isPinned: n.isPinned,
    isArchived: n.isArchived,
    preview: n.content.substring(0, 100) + (n.content.length > 100 ? '...' : ''),
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
  }));
  
  return {
    count: summaries.length,
    notes: summaries,
  };
}

async function getNote(args: { id: string }): Promise<unknown> {
  const store = loadNotes();
  const note = store.notes.find(n => n.id === args.id);
  
  if (!note) {
    throw new Error(`笔记不存在: ${args.id}`);
  }
  
  return { note };
}

async function updateNote(args: {
  id: string;
  title?: string;
  content?: string;
  category?: string;
  tags?: string[];
}): Promise<unknown> {
  const store = loadNotes();
  const index = store.notes.findIndex(n => n.id === args.id);
  
  if (index === -1) {
    throw new Error(`笔记不存在: ${args.id}`);
  }
  
  const note = store.notes[index];
  
  if (args.title !== undefined) note.title = args.title;
  if (args.content !== undefined) note.content = args.content;
  if (args.category !== undefined) note.category = args.category;
  if (args.tags !== undefined) note.tags = args.tags;
  
  note.updatedAt = new Date().toISOString();
  
  saveNotes(store);
  
  return {
    success: true,
    note,
    message: `已更新笔记: ${note.title}`,
  };
}

async function deleteNote(args: { id: string }): Promise<unknown> {
  const store = loadNotes();
  const index = store.notes.findIndex(n => n.id === args.id);
  
  if (index === -1) {
    throw new Error(`笔记不存在: ${args.id}`);
  }
  
  const [deleted] = store.notes.splice(index, 1);
  saveNotes(store);
  
  return {
    success: true,
    deleted,
    message: `已删除笔记: ${deleted.title}`,
  };
}

async function searchNotes(args: {
  query: string;
  caseSensitive?: boolean;
  includeArchived?: boolean;
  limit?: number;
}): Promise<unknown> {
  const store = loadNotes();
  const { query, caseSensitive = false, includeArchived = false, limit } = args;
  
  const searchQuery = caseSensitive ? query : query.toLowerCase();
  
  let results = store.notes.filter(n => {
    // 排除已归档
    if (!includeArchived && n.isArchived) return false;
    
    const title = caseSensitive ? n.title : n.title.toLowerCase();
    const content = caseSensitive ? n.content : n.content.toLowerCase();
    const category = caseSensitive ? (n.category || '') : (n.category || '').toLowerCase();
    
    return (
      title.includes(searchQuery) ||
      content.includes(searchQuery) ||
      category.includes(searchQuery) ||
      n.tags?.some(t => (caseSensitive ? t : t.toLowerCase()).includes(searchQuery))
    );
  });
  
  // 按相关性排序（标题匹配优先）
  results.sort((a, b) => {
    const aTitle = caseSensitive ? a.title : a.title.toLowerCase();
    const bTitle = caseSensitive ? b.title : b.title.toLowerCase();
    
    const aInTitle = aTitle.includes(searchQuery);
    const bInTitle = bTitle.includes(searchQuery);
    
    if (aInTitle && !bInTitle) return -1;
    if (!aInTitle && bInTitle) return 1;
    
    // 置顶优先
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    
    return 0;
  });
  
  // 限制数量
  if (limit && limit > 0) {
    results = results.slice(0, limit);
  }
  
  // 返回结果（含匹配高亮）
  const searchResults = results.map(n => {
    const preview = n.content.substring(0, 200);
    return {
      id: n.id,
      title: n.title,
      category: n.category,
      tags: n.tags,
      isPinned: n.isPinned,
      preview: preview + (n.content.length > 200 ? '...' : ''),
      updatedAt: n.updatedAt,
    };
  });
  
  return {
    query,
    count: searchResults.length,
    notes: searchResults,
  };
}

async function archiveNote(args: { id: string; archive?: boolean }): Promise<unknown> {
  const store = loadNotes();
  const note = store.notes.find(n => n.id === args.id);
  
  if (!note) {
    throw new Error(`笔记不存在: ${args.id}`);
  }
  
  const archive = args.archive !== undefined ? args.archive : !note.isArchived;
  note.isArchived = archive;
  note.updatedAt = new Date().toISOString();
  
  saveNotes(store);
  
  return {
    success: true,
    note,
    message: archive ? `已归档笔记: ${note.title}` : `已取消归档: ${note.title}`,
  };
}

async function pinNote(args: { id: string; pin?: boolean }): Promise<unknown> {
  const store = loadNotes();
  const note = store.notes.find(n => n.id === args.id);
  
  if (!note) {
    throw new Error(`笔记不存在: ${args.id}`);
  }
  
  const pin = args.pin !== undefined ? args.pin : !note.isPinned;
  note.isPinned = pin;
  note.updatedAt = new Date().toISOString();
  
  saveNotes(store);
  
  return {
    success: true,
    note,
    message: pin ? `已置顶笔记: ${note.title}` : `已取消置顶: ${note.title}`,
  };
}

async function getCategories(): Promise<unknown> {
  const store = loadNotes();
  
  const categoryMap = new Map<string, number>();
  
  store.notes.forEach(n => {
    if (n.category && !n.isArchived) {
      categoryMap.set(n.category, (categoryMap.get(n.category) || 0) + 1);
    }
  });
  
  const categories = Array.from(categoryMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
  
  return {
    count: categories.length,
    categories,
  };
}

async function getTags(): Promise<unknown> {
  const store = loadNotes();
  
  const tagMap = new Map<string, number>();
  
  store.notes.forEach(n => {
    if (n.tags && !n.isArchived) {
      n.tags.forEach(tag => {
        tagMap.set(tag, (tagMap.get(tag) || 0) + 1);
      });
    }
  });
  
  const tags = Array.from(tagMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
  
  return {
    count: tags.length,
    tags,
  };
}

// ============================================================================
// 工具调用路由
// ============================================================================

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'create_note':
      return createNote(args as Parameters<typeof createNote>[0]);
    case 'list_notes':
      return listNotes(args as Parameters<typeof listNotes>[0]);
    case 'get_note':
      return getNote(args as { id: string });
    case 'update_note':
      return updateNote(args as Parameters<typeof updateNote>[0]);
    case 'delete_note':
      return deleteNote(args as { id: string });
    case 'search_notes':
      return searchNotes(args as Parameters<typeof searchNotes>[0]);
    case 'archive_note':
      return archiveNote(args as { id: string; archive?: boolean });
    case 'pin_note':
      return pinNote(args as { id: string; pin?: boolean });
    case 'get_categories':
      return getCategories();
    case 'get_tags':
      return getTags();
    default:
      throw new Error(`未知工具: ${name}`);
  }
}

// ============================================================================
// 资源读取
// ============================================================================

async function readResource(uri: string): Promise<{ text: string; mimeType: string }> {
  const store = loadNotes();
  
  if (uri === 'notes://recent') {
    const recentNotes = store.notes
      .filter(n => !n.isArchived)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 10)
      .map(n => ({
        id: n.id,
        title: n.title,
        category: n.category,
        preview: n.content.substring(0, 100),
        updatedAt: n.updatedAt,
      }));
    
    return {
      text: JSON.stringify({ count: recentNotes.length, notes: recentNotes }, null, 2),
      mimeType: 'application/json',
    };
  }
  
  if (uri === 'notes://pinned') {
    const pinnedNotes = store.notes
      .filter(n => n.isPinned && !n.isArchived)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .map(n => ({
        id: n.id,
        title: n.title,
        category: n.category,
        preview: n.content.substring(0, 100),
        updatedAt: n.updatedAt,
      }));
    
    return {
      text: JSON.stringify({ count: pinnedNotes.length, notes: pinnedNotes }, null, 2),
      mimeType: 'application/json',
    };
  }
  
  if (uri === 'notes://categories') {
    const result = await getCategories();
    return {
      text: JSON.stringify(result, null, 2),
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
            name: 'notes',
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