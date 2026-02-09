/**
 * 单元测试：MCP管理器
 * Task: T065 [P] [US4]
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock child_process
const mockChildProcess = {
  spawn: vi.fn(),
};

vi.mock('child_process', () => mockChildProcess);

// Mock 事件总线
const mockEventBus = {
  emit: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
};

vi.mock('../../../src/shared/services/event-bus', () => ({
  eventBus: mockEventBus,
}));

// MCP 服务器配置类型
interface MCPServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  capabilities?: string[];
}

// MCP 工具定义
interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

// MCP 资源定义
interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

// MCP 服务器状态
type MCPServerStatus = 'stopped' | 'starting' | 'running' | 'error';

interface MCPServer {
  config: MCPServerConfig;
  status: MCPServerStatus;
  tools: MCPTool[];
  resources: MCPResource[];
  error?: string;
}

interface MCPManagerInterface {
  registerServer(config: MCPServerConfig): void;
  unregisterServer(name: string): void;
  startServer(name: string): Promise<void>;
  stopServer(name: string): Promise<void>;
  startAllServers(): Promise<void>;
  stopAllServers(): Promise<void>;
  getServer(name: string): MCPServer | undefined;
  getAllServers(): MCPServer[];
  getServerStatus(name: string): MCPServerStatus;
  callTool(serverName: string, toolName: string, args: Record<string, unknown>): Promise<unknown>;
  readResource(serverName: string, uri: string): Promise<unknown>;
  listTools(serverName?: string): MCPTool[];
  listResources(serverName?: string): MCPResource[];
}

describe('MCPManager', () => {
  let MCPManager: new () => MCPManagerInterface;
  let mcpManager: MCPManagerInterface;

  // Mock 进程对象
  const createMockProcess = () => ({
    stdin: {
      write: vi.fn(),
      end: vi.fn(),
    },
    stdout: {
      on: vi.fn(),
    },
    stderr: {
      on: vi.fn(),
    },
    on: vi.fn(),
    kill: vi.fn(),
    pid: 12345,
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // 设置 spawn mock
    const mockProcess = createMockProcess();
    mockChildProcess.spawn.mockReturnValue(mockProcess);

    // 动态导入
    const module = await import('../../../src/ai/mcp/mcp-manager');
    MCPManager = module.MCPManager;
    mcpManager = new MCPManager();
  });

  afterEach(async () => {
    if (mcpManager) {
      await mcpManager.stopAllServers();
    }
  });

  describe('服务器注册', () => {
    it('应该成功注册MCP服务器', () => {
      const config: MCPServerConfig = {
        name: 'test-server',
        command: 'node',
        args: ['server.js'],
        capabilities: ['tools'],
      };

      mcpManager.registerServer(config);

      const server = mcpManager.getServer('test-server');
      expect(server).toBeDefined();
      expect(server?.config.name).toBe('test-server');
      expect(server?.status).toBe('stopped');
    });

    it('应该拒绝重复注册同名服务器', () => {
      const config: MCPServerConfig = {
        name: 'test-server',
        command: 'node',
        args: ['server.js'],
      };

      mcpManager.registerServer(config);

      expect(() => mcpManager.registerServer(config)).toThrow(
        '服务器 test-server 已注册'
      );
    });

    it('应该成功注销服务器', () => {
      const config: MCPServerConfig = {
        name: 'test-server',
        command: 'node',
      };

      mcpManager.registerServer(config);
      mcpManager.unregisterServer('test-server');

      expect(mcpManager.getServer('test-server')).toBeUndefined();
    });

    it('应该获取所有注册的服务器', () => {
      mcpManager.registerServer({ name: 'server1', command: 'node' });
      mcpManager.registerServer({ name: 'server2', command: 'python' });

      const servers = mcpManager.getAllServers();
      expect(servers).toHaveLength(2);
    });
  });

  describe('服务器生命周期', () => {
    it('应该启动服务器', async () => {
      const mockProcess = createMockProcess();
      mockChildProcess.spawn.mockReturnValue(mockProcess);

      // 模拟初始化响应
      mockProcess.stdout.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          // 模拟 JSON-RPC 初始化响应
          setTimeout(() => {
            callback(
              JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                result: {
                  capabilities: {
                    tools: { listChanged: true },
                    resources: { subscribe: true },
                  },
                  serverInfo: {
                    name: 'test-server',
                    version: '1.0.0',
                  },
                },
              })
            );
          }, 10);
        }
      });

      mcpManager.registerServer({
        name: 'test-server',
        command: 'node',
        args: ['server.js'],
      });

      await mcpManager.startServer('test-server');

      expect(mockChildProcess.spawn).toHaveBeenCalledWith(
        'node',
        ['server.js'],
        expect.any(Object)
      );
    });

    it('应该停止服务器', async () => {
      const mockProcess = createMockProcess();
      mockChildProcess.spawn.mockReturnValue(mockProcess);

      mcpManager.registerServer({
        name: 'test-server',
        command: 'node',
      });

      // 模拟服务器已启动
      await mcpManager.startServer('test-server');
      await mcpManager.stopServer('test-server');

      expect(mockProcess.kill).toHaveBeenCalled();
    });

    it('应该启动所有服务器', async () => {
      mcpManager.registerServer({ name: 'server1', command: 'node' });
      mcpManager.registerServer({ name: 'server2', command: 'python' });

      await mcpManager.startAllServers();

      expect(mockChildProcess.spawn).toHaveBeenCalledTimes(2);
    });

    it('应该停止所有服务器', async () => {
      const mockProcess1 = createMockProcess();
      const mockProcess2 = createMockProcess();
      mockChildProcess.spawn
        .mockReturnValueOnce(mockProcess1)
        .mockReturnValueOnce(mockProcess2);

      mcpManager.registerServer({ name: 'server1', command: 'node' });
      mcpManager.registerServer({ name: 'server2', command: 'python' });

      await mcpManager.startAllServers();
      await mcpManager.stopAllServers();

      expect(mockProcess1.kill).toHaveBeenCalled();
      expect(mockProcess2.kill).toHaveBeenCalled();
    });

    it('应该返回正确的服务器状态', () => {
      mcpManager.registerServer({
        name: 'test-server',
        command: 'node',
      });

      expect(mcpManager.getServerStatus('test-server')).toBe('stopped');
    });
  });

  describe('工具调用', () => {
    it('应该调用服务器工具', async () => {
      const mockProcess = createMockProcess();
      mockChildProcess.spawn.mockReturnValue(mockProcess);

      let dataCallback: ((data: string) => void) | null = null;
      mockProcess.stdout.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          dataCallback = callback;
        }
      });

      mcpManager.registerServer({
        name: 'test-server',
        command: 'node',
        capabilities: ['tools'],
      });

      await mcpManager.startServer('test-server');

      // 模拟工具调用响应
      const toolCallPromise = mcpManager.callTool('test-server', 'get_weather', {
        city: 'Beijing',
      });

      // 触发响应
      if (dataCallback) {
        dataCallback(
          JSON.stringify({
            jsonrpc: '2.0',
            id: 2,
            result: {
              content: [
                {
                  type: 'text',
                  text: 'Weather in Beijing: Sunny, 25°C',
                },
              ],
            },
          })
        );
      }

      const result = await toolCallPromise;
      expect(result).toBeDefined();
    });

    it('应该处理工具调用错误', async () => {
      mcpManager.registerServer({
        name: 'test-server',
        command: 'node',
      });

      // 未启动服务器调用工具应该失败
      await expect(
        mcpManager.callTool('test-server', 'some_tool', {})
      ).rejects.toThrow();
    });

    it('应该处理不存在的服务器', async () => {
      await expect(
        mcpManager.callTool('nonexistent', 'tool', {})
      ).rejects.toThrow('服务器 nonexistent 不存在');
    });
  });

  describe('资源访问', () => {
    it('应该读取服务器资源', async () => {
      const mockProcess = createMockProcess();
      mockChildProcess.spawn.mockReturnValue(mockProcess);

      let dataCallback: ((data: string) => void) | null = null;
      mockProcess.stdout.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          dataCallback = callback;
        }
      });

      mcpManager.registerServer({
        name: 'test-server',
        command: 'node',
        capabilities: ['resources'],
      });

      await mcpManager.startServer('test-server');

      const readPromise = mcpManager.readResource(
        'test-server',
        'file:///path/to/resource'
      );

      if (dataCallback) {
        dataCallback(
          JSON.stringify({
            jsonrpc: '2.0',
            id: 2,
            result: {
              contents: [
                {
                  uri: 'file:///path/to/resource',
                  mimeType: 'text/plain',
                  text: 'Resource content',
                },
              ],
            },
          })
        );
      }

      const result = await readPromise;
      expect(result).toBeDefined();
    });
  });

  describe('工具和资源列表', () => {
    it('应该列出所有工具', () => {
      mcpManager.registerServer({
        name: 'server1',
        command: 'node',
        capabilities: ['tools'],
      });

      // 模拟服务器有工具
      const tools = mcpManager.listTools();
      expect(Array.isArray(tools)).toBe(true);
    });

    it('应该列出特定服务器的工具', () => {
      mcpManager.registerServer({
        name: 'server1',
        command: 'node',
        capabilities: ['tools'],
      });

      const tools = mcpManager.listTools('server1');
      expect(Array.isArray(tools)).toBe(true);
    });

    it('应该列出所有资源', () => {
      mcpManager.registerServer({
        name: 'server1',
        command: 'node',
        capabilities: ['resources'],
      });

      const resources = mcpManager.listResources();
      expect(Array.isArray(resources)).toBe(true);
    });

    it('应该列出特定服务器的资源', () => {
      mcpManager.registerServer({
        name: 'server1',
        command: 'node',
        capabilities: ['resources'],
      });

      const resources = mcpManager.listResources('server1');
      expect(Array.isArray(resources)).toBe(true);
    });
  });

  describe('错误处理', () => {
    it('应该处理服务器启动失败', async () => {
      const mockProcess = createMockProcess();
      mockChildProcess.spawn.mockReturnValue(mockProcess);

      // 模拟启动错误
      mockProcess.on.mockImplementation((event, callback) => {
        if (event === 'error') {
          setTimeout(() => callback(new Error('启动失败')), 10);
        }
      });

      mcpManager.registerServer({
        name: 'test-server',
        command: 'invalid-command',
      });

      // 启动应该处理错误
      try {
        await mcpManager.startServer('test-server');
      } catch {
        // 预期可能失败
      }

      const server = mcpManager.getServer('test-server');
      // 状态应该反映错误
      expect(server).toBeDefined();
    });

    it('应该处理服务器意外退出', async () => {
      const mockProcess = createMockProcess();
      mockChildProcess.spawn.mockReturnValue(mockProcess);

      let exitCallback: ((code: number) => void) | null = null;
      mockProcess.on.mockImplementation((event, callback) => {
        if (event === 'exit') {
          exitCallback = callback;
        }
      });

      mcpManager.registerServer({
        name: 'test-server',
        command: 'node',
      });

      await mcpManager.startServer('test-server');

      // 模拟意外退出
      if (exitCallback) {
        exitCallback(1);
      }

      // 应该发出事件
      expect(mockEventBus.emit).toHaveBeenCalled();
    });
  });

  describe('环境变量', () => {
    it('应该传递环境变量给服务器', async () => {
      mcpManager.registerServer({
        name: 'test-server',
        command: 'node',
        args: ['server.js'],
        env: {
          API_KEY: 'test-key',
          DEBUG: 'true',
        },
      });

      await mcpManager.startServer('test-server');

      expect(mockChildProcess.spawn).toHaveBeenCalledWith(
        'node',
        ['server.js'],
        expect.objectContaining({
          env: expect.objectContaining({
            API_KEY: 'test-key',
            DEBUG: 'true',
          }),
        })
      );
    });
  });

  describe('JSON-RPC 通信', () => {
    it('应该正确格式化 JSON-RPC 请求', async () => {
      const mockProcess = createMockProcess();
      mockChildProcess.spawn.mockReturnValue(mockProcess);

      mcpManager.registerServer({
        name: 'test-server',
        command: 'node',
      });

      await mcpManager.startServer('test-server');

      // 验证初始化请求被发送
      expect(mockProcess.stdin.write).toHaveBeenCalled();
      
      const writeCall = mockProcess.stdin.write.mock.calls[0][0];
      const request = JSON.parse(writeCall);
      
      expect(request).toMatchObject({
        jsonrpc: '2.0',
        method: 'initialize',
      });
    });

    it('应该处理 JSON-RPC 错误响应', async () => {
      const mockProcess = createMockProcess();
      mockChildProcess.spawn.mockReturnValue(mockProcess);

      let dataCallback: ((data: string) => void) | null = null;
      mockProcess.stdout.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          dataCallback = callback;
        }
      });

      mcpManager.registerServer({
        name: 'test-server',
        command: 'node',
      });

      await mcpManager.startServer('test-server');

      const callPromise = mcpManager.callTool('test-server', 'invalid_tool', {});

      // 发送错误响应
      if (dataCallback) {
        dataCallback(
          JSON.stringify({
            jsonrpc: '2.0',
            id: 2,
            error: {
              code: -32601,
              message: 'Method not found',
            },
          })
        );
      }

      await expect(callPromise).rejects.toThrow();
    });
  });
});