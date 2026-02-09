/**
 * MCP (Model Context Protocol) 服务器管理器
 * Task: T073 [US4]
 *
 * 负责管理 MCP 服务器的生命周期、工具调用和资源访问
 */

import { spawn, ChildProcess } from 'child_process';
import { eventBus } from '../../shared/services/event-bus';

// MCP 服务器配置类型
export interface MCPServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  capabilities?: string[];
}

// MCP 工具定义
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

// MCP 资源定义
export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

// MCP 服务器状态
export type MCPServerStatus = 'stopped' | 'starting' | 'running' | 'error';

// MCP 服务器实例
export interface MCPServer {
  config: MCPServerConfig;
  status: MCPServerStatus;
  tools: MCPTool[];
  resources: MCPResource[];
  error?: string;
}

// JSON-RPC 请求
interface JSONRPCRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

// JSON-RPC 响应
interface JSONRPCResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

// 服务器运行时状态
interface ServerRuntime {
  process: ChildProcess | null;
  pendingRequests: Map<number, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }>;
  nextRequestId: number;
  buffer: string;
}

/**
 * MCP 服务器管理器
 * 管理 MCP 服务器的注册、生命周期和通信
 */
export class MCPManager {
  private static instance: MCPManager | null = null;
  private servers: Map<string, MCPServer> = new Map();
  private runtimes: Map<string, ServerRuntime> = new Map();

  constructor() {
    // 公开构造函数，支持测试和多实例场景
  }

  /**
   * 获取单例实例
   */
  static getInstance(): MCPManager {
    if (!MCPManager.instance) {
      MCPManager.instance = new MCPManager();
    }
    return MCPManager.instance;
  }

  /**
   * 重置单例实例（用于测试）
   */
  static resetInstance(): void {
    if (MCPManager.instance) {
      MCPManager.instance.stopAllServers().catch(() => {});
      MCPManager.instance = null;
    }
  }

  /**
   * 注册 MCP 服务器
   * @param config 服务器配置
   */
  registerServer(config: MCPServerConfig): void {
    if (this.servers.has(config.name)) {
      throw new Error(`服务器 ${config.name} 已注册`);
    }

    const server: MCPServer = {
      config,
      status: 'stopped',
      tools: [],
      resources: [],
    };

    this.servers.set(config.name, server);

    // 初始化运行时状态
    this.runtimes.set(config.name, {
      process: null,
      pendingRequests: new Map(),
      nextRequestId: 1,
      buffer: '',
    });

    eventBus.emit('mcp:server:registered', { name: config.name });
  }

  /**
   * 注销 MCP 服务器
   * @param name 服务器名称
   */
  unregisterServer(name: string): void {
    const server = this.servers.get(name);
    if (!server) {
      return;
    }

    // 如果服务器正在运行，先停止
    if (server.status === 'running' || server.status === 'starting') {
      this.stopServer(name).catch(() => {});
    }

    this.servers.delete(name);
    this.runtimes.delete(name);

    eventBus.emit('mcp:server:unregistered', { name });
  }

  /**
   * 启动服务器
   * @param name 服务器名称
   */
  async startServer(name: string): Promise<void> {
    const server = this.servers.get(name);
    if (!server) {
      throw new Error(`服务器 ${name} 不存在`);
    }

    if (server.status === 'running') {
      return; // 已经运行中
    }

    const runtime = this.runtimes.get(name)!;
    server.status = 'starting';

    try {
      // 启动子进程
      const env = {
        ...process.env,
        ...server.config.env,
      };

      const childProcess = spawn(
        server.config.command,
        server.config.args || [],
        {
          env,
          stdio: ['pipe', 'pipe', 'pipe'],
        }
      );

      runtime.process = childProcess;

      // 处理标准输出（JSON-RPC 响应）
      childProcess.stdout.on('data', (data: Buffer) => {
        this.handleStdout(name, data.toString());
      });

      // 处理标准错误
      childProcess.stderr.on('data', (data: Buffer) => {
        const message = data.toString();
        eventBus.emit('mcp:server:stderr', { name, message });
      });

      // 处理进程错误
      childProcess.on('error', (error: Error) => {
        server.status = 'error';
        server.error = error.message;
        eventBus.emit('mcp:server:error', { name, error: error.message });
      });

      // 处理进程退出
      childProcess.on('exit', (code: number | null) => {
        if (server.status !== 'stopped') {
          server.status = code === 0 ? 'stopped' : 'error';
          if (code !== 0) {
            server.error = `进程退出，退出码: ${code}`;
          }
          eventBus.emit('mcp:server:exit', { name, code });
        }
        runtime.process = null;
      });

      // 发送初始化请求
      await this.initialize(name);

      server.status = 'running';
      eventBus.emit('mcp:server:started', { name });
    } catch (error) {
      server.status = 'error';
      server.error = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  /**
   * 停止服务器
   * @param name 服务器名称
   */
  async stopServer(name: string): Promise<void> {
    const server = this.servers.get(name);
    if (!server) {
      return;
    }

    const runtime = this.runtimes.get(name);
    if (!runtime?.process) {
      server.status = 'stopped';
      return;
    }

    // 拒绝所有待处理请求
    for (const [, pending] of runtime.pendingRequests) {
      pending.reject(new Error('服务器已停止'));
    }
    runtime.pendingRequests.clear();

    // 终止进程
    runtime.process.kill();
    runtime.process = null;

    server.status = 'stopped';
    server.tools = [];
    server.resources = [];

    eventBus.emit('mcp:server:stopped', { name });
  }

  /**
   * 启动所有服务器
   */
  async startAllServers(): Promise<void> {
    const startPromises: Promise<void>[] = [];

    for (const name of this.servers.keys()) {
      startPromises.push(this.startServer(name));
    }

    await Promise.all(startPromises);
  }

  /**
   * 停止所有服务器
   */
  async stopAllServers(): Promise<void> {
    const stopPromises: Promise<void>[] = [];

    for (const name of this.servers.keys()) {
      stopPromises.push(this.stopServer(name));
    }

    await Promise.all(stopPromises);
  }

  /**
   * 获取服务器信息
   * @param name 服务器名称
   */
  getServer(name: string): MCPServer | undefined {
    return this.servers.get(name);
  }

  /**
   * 获取所有服务器
   */
  getAllServers(): MCPServer[] {
    return Array.from(this.servers.values());
  }

  /**
   * 获取服务器状态
   * @param name 服务器名称
   */
  getServerStatus(name: string): MCPServerStatus {
    const server = this.servers.get(name);
    return server?.status || 'stopped';
  }

  /**
   * 调用工具
   * @param serverName 服务器名称
   * @param toolName 工具名称
   * @param args 工具参数
   */
  async callTool(
    serverName: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    const server = this.servers.get(serverName);
    if (!server) {
      throw new Error(`服务器 ${serverName} 不存在`);
    }

    if (server.status !== 'running') {
      throw new Error(`服务器 ${serverName} 未运行`);
    }

    const result = await this.sendRequest(serverName, 'tools/call', {
      name: toolName,
      arguments: args,
    });

    return result;
  }

  /**
   * 读取资源
   * @param serverName 服务器名称
   * @param uri 资源 URI
   */
  async readResource(serverName: string, uri: string): Promise<unknown> {
    const server = this.servers.get(serverName);
    if (!server) {
      throw new Error(`服务器 ${serverName} 不存在`);
    }

    if (server.status !== 'running') {
      throw new Error(`服务器 ${serverName} 未运行`);
    }

    const result = await this.sendRequest(serverName, 'resources/read', {
      uri,
    });

    return result;
  }

  /**
   * 列出工具
   * @param serverName 服务器名称（可选，不传则返回所有）
   */
  listTools(serverName?: string): MCPTool[] {
    if (serverName) {
      const server = this.servers.get(serverName);
      return server?.tools || [];
    }

    const allTools: MCPTool[] = [];
    for (const server of this.servers.values()) {
      allTools.push(...server.tools);
    }
    return allTools;
  }

  /**
   * 列出资源
   * @param serverName 服务器名称（可选，不传则返回所有）
   */
  listResources(serverName?: string): MCPResource[] {
    if (serverName) {
      const server = this.servers.get(serverName);
      return server?.resources || [];
    }

    const allResources: MCPResource[] = [];
    for (const server of this.servers.values()) {
      allResources.push(...server.resources);
    }
    return allResources;
  }

  /**
   * 初始化服务器连接
   */
  private async initialize(name: string): Promise<void> {
    const result = await this.sendRequest(name, 'initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {
        roots: { listChanged: true },
        sampling: {},
      },
      clientInfo: {
        name: 'desktop-pet',
        version: '1.0.0',
      },
    });

    // 解析服务器能力
    const initResult = result as {
      capabilities?: {
        tools?: { listChanged?: boolean };
        resources?: { subscribe?: boolean };
      };
      serverInfo?: {
        name: string;
        version: string;
      };
    };

    const server = this.servers.get(name)!;

    // 如果服务器支持工具，获取工具列表
    if (initResult.capabilities?.tools) {
      await this.refreshTools(name);
    }

    // 如果服务器支持资源，获取资源列表
    if (initResult.capabilities?.resources) {
      await this.refreshResources(name);
    }

    // 发送 initialized 通知
    this.sendNotification(name, 'notifications/initialized', {});
  }

  /**
   * 刷新工具列表
   */
  private async refreshTools(name: string): Promise<void> {
    try {
      const result = await this.sendRequest(name, 'tools/list', {});
      const listResult = result as { tools?: MCPTool[] };

      const server = this.servers.get(name);
      if (server && listResult.tools) {
        server.tools = listResult.tools;
      }
    } catch {
      // 工具列表获取失败，忽略
    }
  }

  /**
   * 刷新资源列表
   */
  private async refreshResources(name: string): Promise<void> {
    try {
      const result = await this.sendRequest(name, 'resources/list', {});
      const listResult = result as { resources?: MCPResource[] };

      const server = this.servers.get(name);
      if (server && listResult.resources) {
        server.resources = listResult.resources;
      }
    } catch {
      // 资源列表获取失败，忽略
    }
  }

  /**
   * 发送 JSON-RPC 请求
   */
  private sendRequest(
    name: string,
    method: string,
    params: Record<string, unknown>
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const runtime = this.runtimes.get(name);
      if (!runtime?.process) {
        reject(new Error(`服务器 ${name} 未运行`));
        return;
      }

      const id = runtime.nextRequestId++;
      const request: JSONRPCRequest = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      };

      // 注册待处理请求
      runtime.pendingRequests.set(id, { resolve, reject });

      // 设置超时
      const timeout = setTimeout(() => {
        runtime.pendingRequests.delete(id);
        reject(new Error(`请求超时: ${method}`));
      }, 30000);

      // 修改 resolve/reject 以清除超时
      const originalResolve = resolve;
      const originalReject = reject;

      runtime.pendingRequests.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          originalResolve(value);
        },
        reject: (error) => {
          clearTimeout(timeout);
          originalReject(error);
        },
      });

      // 发送请求
      const requestStr = JSON.stringify(request);
      runtime.process.stdin.write(requestStr + '\n');
    });
  }

  /**
   * 发送 JSON-RPC 通知（无响应）
   */
  private sendNotification(
    name: string,
    method: string,
    params: Record<string, unknown>
  ): void {
    const runtime = this.runtimes.get(name);
    if (!runtime?.process) {
      return;
    }

    const notification = {
      jsonrpc: '2.0',
      method,
      params,
    };

    const notificationStr = JSON.stringify(notification);
    runtime.process.stdin.write(notificationStr + '\n');
  }

  /**
   * 处理标准输出数据
   */
  private handleStdout(name: string, data: string): void {
    const runtime = this.runtimes.get(name);
    if (!runtime) {
      return;
    }

    // 累积数据到缓冲区
    runtime.buffer += data;

    // 尝试解析完整的 JSON 消息
    const lines = runtime.buffer.split('\n');
    runtime.buffer = lines.pop() || ''; // 保留不完整的最后一行

    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }

      try {
        const response = JSON.parse(line) as JSONRPCResponse;
        this.handleResponse(name, response);
      } catch {
        // JSON 解析失败，可能是非 JSON-RPC 输出
        eventBus.emit('mcp:server:output', { name, output: line });
      }
    }
  }

  /**
   * 处理 JSON-RPC 响应
   */
  private handleResponse(name: string, response: JSONRPCResponse): void {
    const runtime = this.runtimes.get(name);
    if (!runtime) {
      return;
    }

    const pending = runtime.pendingRequests.get(response.id);
    if (!pending) {
      // 没有匹配的请求，可能是通知
      return;
    }

    runtime.pendingRequests.delete(response.id);

    if (response.error) {
      pending.reject(new Error(response.error.message));
    } else {
      pending.resolve(response.result);
    }
  }
}

// 导出单例实例
export const mcpManager = MCPManager.getInstance();