#!/usr/bin/env node
/**
 * System Tools MCP Server
 * Task: T074 [P] [US4]
 *
 * 提供系统级工具，包括：
 * - 打开应用程序
 * - 打开URL
 * - 执行系统命令
 * - 获取系统信息
 */

import { spawn, exec } from 'child_process';
import { platform, hostname, cpus, totalmem, freemem, userInfo } from 'os';
import { createInterface } from 'readline';

// JSON-RPC 类型定义
interface JSONRPCRequest {
  jsonrpc: '2.0';
  id?: number;
  method: string;
  params?: Record<string, unknown>;
}

interface JSONRPCResponse {
  jsonrpc: '2.0';
  id?: number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

// MCP 工具定义
interface Tool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required?: string[];
  };
}

// 可用工具列表
const tools: Tool[] = [
  {
    name: 'open_application',
    description: '打开系统应用程序',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: '应用程序名称（如：notepad, calculator, terminal）',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'open_url',
    description: '在默认浏览器中打开URL',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: '要打开的URL地址',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'open_file',
    description: '使用系统默认程序打开文件',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: '文件路径',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'get_system_info',
    description: '获取系统信息',
    inputSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: '信息类别',
          enum: ['basic', 'cpu', 'memory', 'all'],
        },
      },
    },
  },
  {
    name: 'get_clipboard',
    description: '获取剪贴板内容',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'set_clipboard',
    description: '设置剪贴板内容',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: '要复制到剪贴板的文本',
        },
      },
      required: ['text'],
    },
  },
];

// 应用程序映射（跨平台）
const APP_MAPPINGS: Record<string, Record<string, string>> = {
  win32: {
    notepad: 'notepad.exe',
    calculator: 'calc.exe',
    terminal: 'cmd.exe',
    powershell: 'powershell.exe',
    explorer: 'explorer.exe',
    paint: 'mspaint.exe',
    wordpad: 'wordpad.exe',
    snipping: 'SnippingTool.exe',
  },
  darwin: {
    notepad: 'TextEdit',
    calculator: 'Calculator',
    terminal: 'Terminal',
    explorer: 'Finder',
    safari: 'Safari',
    mail: 'Mail',
    calendar: 'Calendar',
  },
  linux: {
    notepad: 'gedit',
    calculator: 'gnome-calculator',
    terminal: 'gnome-terminal',
    explorer: 'nautilus',
  },
};

/**
 * 打开应用程序
 */
async function openApplication(name: string): Promise<string> {
  const currentPlatform = platform();
  const mappings = APP_MAPPINGS[currentPlatform] || {};
  const appName = mappings[name.toLowerCase()] || name;

  return new Promise((resolve, reject) => {
    let command: string;
    let args: string[] = [];

    switch (currentPlatform) {
      case 'win32':
        command = 'cmd';
        args = ['/c', 'start', '', appName];
        break;
      case 'darwin':
        command = 'open';
        args = ['-a', appName];
        break;
      default: // Linux
        command = appName;
        args = [];
    }

    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore',
    });

    child.on('error', (error) => {
      reject(new Error(`无法打开应用程序 ${name}: ${error.message}`));
    });

    child.unref();
    resolve(`已打开应用程序: ${name}`);
  });
}

/**
 * 打开URL
 */
async function openUrl(url: string): Promise<string> {
  const currentPlatform = platform();

  return new Promise((resolve, reject) => {
    let command: string;
    let args: string[] = [];

    switch (currentPlatform) {
      case 'win32':
        command = 'cmd';
        args = ['/c', 'start', '', url];
        break;
      case 'darwin':
        command = 'open';
        args = [url];
        break;
      default: // Linux
        command = 'xdg-open';
        args = [url];
    }

    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore',
    });

    child.on('error', (error) => {
      reject(new Error(`无法打开URL ${url}: ${error.message}`));
    });

    child.unref();
    resolve(`已打开URL: ${url}`);
  });
}

/**
 * 打开文件
 */
async function openFile(path: string): Promise<string> {
  const currentPlatform = platform();

  return new Promise((resolve, reject) => {
    let command: string;
    let args: string[] = [];

    switch (currentPlatform) {
      case 'win32':
        command = 'cmd';
        args = ['/c', 'start', '', path];
        break;
      case 'darwin':
        command = 'open';
        args = [path];
        break;
      default: // Linux
        command = 'xdg-open';
        args = [path];
    }

    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore',
    });

    child.on('error', (error) => {
      reject(new Error(`无法打开文件 ${path}: ${error.message}`));
    });

    child.unref();
    resolve(`已打开文件: ${path}`);
  });
}

/**
 * 获取系统信息
 */
function getSystemInfo(category: string = 'all'): Record<string, unknown> {
  const info: Record<string, unknown> = {};

  if (category === 'basic' || category === 'all') {
    info.basic = {
      platform: platform(),
      hostname: hostname(),
      username: userInfo().username,
    };
  }

  if (category === 'cpu' || category === 'all') {
    const cpuInfo = cpus();
    info.cpu = {
      model: cpuInfo[0]?.model || 'Unknown',
      cores: cpuInfo.length,
      speed: cpuInfo[0]?.speed || 0,
    };
  }

  if (category === 'memory' || category === 'all') {
    const totalMemory = totalmem();
    const freeMemory = freemem();
    info.memory = {
      total: formatBytes(totalMemory),
      free: formatBytes(freeMemory),
      used: formatBytes(totalMemory - freeMemory),
      usagePercent: Math.round((1 - freeMemory / totalMemory) * 100),
    };
  }

  return info;
}

/**
 * 格式化字节数
 */
function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let unitIndex = 0;
  let size = bytes;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

/**
 * 获取剪贴板内容
 */
async function getClipboard(): Promise<string> {
  const currentPlatform = platform();

  return new Promise((resolve, reject) => {
    let command: string;
    let args: string[] = [];

    switch (currentPlatform) {
      case 'win32':
        command = 'powershell';
        args = ['-command', 'Get-Clipboard'];
        break;
      case 'darwin':
        command = 'pbpaste';
        args = [];
        break;
      default: // Linux
        command = 'xclip';
        args = ['-selection', 'clipboard', '-o'];
    }

    exec(`${command} ${args.join(' ')}`, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`无法获取剪贴板: ${error.message}`));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

/**
 * 设置剪贴板内容
 */
async function setClipboard(text: string): Promise<string> {
  const currentPlatform = platform();

  return new Promise((resolve, reject) => {
    let command: string;
    let args: string[] = [];

    switch (currentPlatform) {
      case 'win32':
        command = 'powershell';
        args = ['-command', `Set-Clipboard -Value "${text.replace(/"/g, '`"')}"`];
        break;
      case 'darwin':
        command = 'pbcopy';
        args = [];
        break;
      default: // Linux
        command = 'xclip';
        args = ['-selection', 'clipboard'];
    }

    if (currentPlatform === 'win32') {
      exec(`${command} ${args.join(' ')}`, (error) => {
        if (error) {
          reject(new Error(`无法设置剪贴板: ${error.message}`));
          return;
        }
        resolve('已复制到剪贴板');
      });
    } else {
      const child = spawn(command, args);
      child.stdin.write(text);
      child.stdin.end();

      child.on('error', (error) => {
        reject(new Error(`无法设置剪贴板: ${error.message}`));
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve('已复制到剪贴板');
        } else {
          reject(new Error(`剪贴板命令退出码: ${code}`));
        }
      });
    }
  });
}

/**
 * 处理工具调用
 */
async function handleToolCall(
  toolName: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (toolName) {
    case 'open_application':
      return openApplication(args.name as string);

    case 'open_url':
      return openUrl(args.url as string);

    case 'open_file':
      return openFile(args.path as string);

    case 'get_system_info':
      return getSystemInfo(args.category as string);

    case 'get_clipboard':
      return getClipboard();

    case 'set_clipboard':
      return setClipboard(args.text as string);

    default:
      throw new Error(`未知工具: ${toolName}`);
  }
}

/**
 * 处理 JSON-RPC 请求
 */
async function handleRequest(request: JSONRPCRequest): Promise<JSONRPCResponse> {
  const { method, params, id } = request;

  try {
    let result: unknown;

    switch (method) {
      case 'initialize':
        result = {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: { listChanged: false },
          },
          serverInfo: {
            name: 'system-tools',
            version: '1.0.0',
          },
        };
        break;

      case 'tools/list':
        result = { tools };
        break;

      case 'tools/call':
        const toolParams = params as { name: string; arguments: Record<string, unknown> };
        const toolResult = await handleToolCall(toolParams.name, toolParams.arguments || {});
        result = {
          content: [
            {
              type: 'text',
              text: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult, null, 2),
            },
          ],
        };
        break;

      case 'notifications/initialized':
        // 客户端已初始化，无需响应
        return { jsonrpc: '2.0' };

      default:
        throw new Error(`未知方法: ${method}`);
    }

    return {
      jsonrpc: '2.0',
      id,
      result,
    };
  } catch (error) {
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code: -32603,
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

/**
 * 主函数
 */
function main(): void {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  rl.on('line', async (line) => {
    if (!line.trim()) {
      return;
    }

    try {
      const request = JSON.parse(line) as JSONRPCRequest;
      const response = await handleRequest(request);

      // 只有有 id 的请求才需要响应
      if (request.id !== undefined) {
        console.log(JSON.stringify(response));
      }
    } catch (error) {
      // JSON 解析错误
      const errorResponse: JSONRPCResponse = {
        jsonrpc: '2.0',
        error: {
          code: -32700,
          message: 'Parse error',
        },
      };
      console.log(JSON.stringify(errorResponse));
    }
  });

  rl.on('close', () => {
    process.exit(0);
  });

  // 处理未捕获的错误
  process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled rejection:', reason);
    process.exit(1);
  });
}

// 启动服务器
main();