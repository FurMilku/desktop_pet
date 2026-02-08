/**
 * Vitest 测试设置文件
 * 在所有测试运行前执行的全局设置
 */

import { vi, beforeAll, afterAll, afterEach } from 'vitest';

// ============================================
// 全局 Mock 设置
// ============================================

// Mock Electron 模块（在渲染进程测试中使用）
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((name: string) => {
      const paths: Record<string, string> = {
        userData: '/tmp/test-user-data',
        appData: '/tmp/test-app-data',
        home: '/tmp/test-home',
        temp: '/tmp/test-temp',
      };
      return paths[name] || '/tmp/test';
    }),
    getName: vi.fn(() => 'desktop-3d-pet'),
    getVersion: vi.fn(() => '1.0.0'),
    isPackaged: false,
    quit: vi.fn(),
  },
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
    removeHandler: vi.fn(),
  },
  ipcRenderer: {
    invoke: vi.fn(),
    on: vi.fn(),
    send: vi.fn(),
    removeListener: vi.fn(),
  },
  BrowserWindow: vi.fn().mockImplementation(() => ({
    loadFile: vi.fn(),
    loadURL: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
    close: vi.fn(),
    destroy: vi.fn(),
    isDestroyed: vi.fn(() => false),
    webContents: {
      send: vi.fn(),
      openDevTools: vi.fn(),
    },
    on: vi.fn(),
    once: vi.fn(),
    setPosition: vi.fn(),
    getPosition: vi.fn(() => [100, 100]),
    setSize: vi.fn(),
    getSize: vi.fn(() => [400, 600]),
    setBounds: vi.fn(),
    getBounds: vi.fn(() => ({ x: 100, y: 100, width: 400, height: 600 })),
    setAlwaysOnTop: vi.fn(),
    setSkipTaskbar: vi.fn(),
    setResizable: vi.fn(),
  })),
  screen: {
    getPrimaryDisplay: vi.fn(() => ({
      workArea: { x: 0, y: 0, width: 1920, height: 1080 },
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    })),
    getAllDisplays: vi.fn(() => [
      {
        id: 1,
        workArea: { x: 0, y: 0, width: 1920, height: 1080 },
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      },
    ]),
  },
  shell: {
    openExternal: vi.fn(),
    openPath: vi.fn(),
  },
  dialog: {
    showOpenDialog: vi.fn(),
    showSaveDialog: vi.fn(),
    showMessageBox: vi.fn(),
  },
  Menu: {
    buildFromTemplate: vi.fn(() => ({})),
    setApplicationMenu: vi.fn(),
  },
  Tray: vi.fn().mockImplementation(() => ({
    setToolTip: vi.fn(),
    setContextMenu: vi.fn(),
    on: vi.fn(),
    destroy: vi.fn(),
  })),
  nativeImage: {
    createFromPath: vi.fn(() => ({})),
    createEmpty: vi.fn(() => ({})),
  },
}));

// Mock electron-log
vi.mock('electron-log', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    verbose: vi.fn(),
    transports: {
      file: { level: 'info' },
      console: { level: 'debug' },
    },
  },
}));

// Mock better-sqlite3
vi.mock('better-sqlite3', () => {
  const mockStatement = {
    run: vi.fn(() => ({ changes: 1, lastInsertRowid: 1 })),
    get: vi.fn(),
    all: vi.fn(() => []),
    iterate: vi.fn(() => [][Symbol.iterator]()),
  };

  const mockDb = {
    prepare: vi.fn(() => mockStatement),
    exec: vi.fn(),
    close: vi.fn(),
    pragma: vi.fn(),
    transaction: vi.fn((fn: Function) => fn),
  };

  return {
    default: vi.fn(() => mockDb),
  };
});

// Mock keytar（凭证存储）
vi.mock('keytar', () => ({
  setPassword: vi.fn(() => Promise.resolve()),
  getPassword: vi.fn(() => Promise.resolve(null)),
  deletePassword: vi.fn(() => Promise.resolve(true)),
  findPassword: vi.fn(() => Promise.resolve(null)),
  findCredentials: vi.fn(() => Promise.resolve([])),
}));

// Mock @sentry/electron
vi.mock('@sentry/electron', () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  setUser: vi.fn(),
  setTag: vi.fn(),
  setExtra: vi.fn(),
}));

// ============================================
// Three.js Mock 设置（用于3D渲染测试）
// ============================================

// Mock WebGL context
const mockWebGLContext = {
  getParameter: vi.fn(() => 'WebGL'),
  getExtension: vi.fn(() => ({})),
  createShader: vi.fn(() => ({})),
  shaderSource: vi.fn(),
  compileShader: vi.fn(),
  getShaderParameter: vi.fn(() => true),
  createProgram: vi.fn(() => ({})),
  attachShader: vi.fn(),
  linkProgram: vi.fn(),
  getProgramParameter: vi.fn(() => true),
  useProgram: vi.fn(),
  createBuffer: vi.fn(() => ({})),
  bindBuffer: vi.fn(),
  bufferData: vi.fn(),
  enableVertexAttribArray: vi.fn(),
  vertexAttribPointer: vi.fn(),
  drawArrays: vi.fn(),
  drawElements: vi.fn(),
  viewport: vi.fn(),
  clearColor: vi.fn(),
  clear: vi.fn(),
  enable: vi.fn(),
  disable: vi.fn(),
  blendFunc: vi.fn(),
  depthFunc: vi.fn(),
  cullFace: vi.fn(),
};

// Mock canvas element
class MockCanvas {
  width = 800;
  height = 600;
  style = {};

  getContext(type: string) {
    if (type === 'webgl' || type === 'webgl2') {
      return mockWebGLContext;
    }
    return null;
  }

  addEventListener = vi.fn();
  removeEventListener = vi.fn();
  getBoundingClientRect = vi.fn(() => ({
    left: 0,
    top: 0,
    width: 800,
    height: 600,
  }));
}

// 设置全局 document mock（用于 Three.js）
if (typeof document === 'undefined') {
  (global as any).document = {
    createElement: vi.fn((tag: string) => {
      if (tag === 'canvas') {
        return new MockCanvas();
      }
      return {};
    }),
    body: {
      appendChild: vi.fn(),
      removeChild: vi.fn(),
    },
  };
}

// 设置全局 window mock
if (typeof window === 'undefined') {
  (global as any).window = {
    innerWidth: 1920,
    innerHeight: 1080,
    devicePixelRatio: 1,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    requestAnimationFrame: vi.fn((cb: Function) => setTimeout(cb, 16)),
    cancelAnimationFrame: vi.fn((id: number) => clearTimeout(id)),
    performance: {
      now: vi.fn(() => Date.now()),
    },
  };
}

// ============================================
// 测试生命周期钩子
// ============================================

beforeAll(() => {
  // 测试开始前的全局设置
  console.log('🧪 Starting test suite...');

  // 设置测试环境变量
  process.env.NODE_ENV = 'test';
  process.env.ELECTRON_IS_DEV = '1';
});

afterEach(() => {
  // 每个测试后清理
  vi.clearAllMocks();
});

afterAll(() => {
  // 测试结束后的全局清理
  console.log('✅ Test suite completed.');

  // 重置所有 mock
  vi.resetAllMocks();
});

// ============================================
// 测试工具函数
// ============================================

/**
 * 等待指定时间（用于异步测试）
 */
export const wait = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

/**
 * 创建 Mock 事件
 */
export const createMockEvent = (type: string, data?: any) => {
  return {
    type,
    data,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  };
};

/**
 * 创建 Mock IPC 事件
 */
export const createMockIpcEvent = () => {
  return {
    sender: {
      send: vi.fn(),
    },
    reply: vi.fn(),
  };
};

/**
 * 创建 Mock Three.js Scene
 */
export const createMockScene = () => {
  return {
    add: vi.fn(),
    remove: vi.fn(),
    children: [],
    traverse: vi.fn(),
  };
};

/**
 * 创建 Mock Three.js Camera
 */
export const createMockCamera = () => {
  return {
    position: { x: 0, y: 0, z: 5, set: vi.fn() },
    lookAt: vi.fn(),
    updateProjectionMatrix: vi.fn(),
  };
};

/**
 * 创建 Mock Three.js Renderer
 */
export const createMockRenderer = () => {
  return {
    setSize: vi.fn(),
    setPixelRatio: vi.fn(),
    setClearColor: vi.fn(),
    render: vi.fn(),
    dispose: vi.fn(),
    domElement: new MockCanvas(),
  };
};

// ============================================
// 类型声明扩展
// ============================================

declare global {
  namespace Vi {
    interface JestAssertion<T = any> {
      toBeWithinRange(floor: number, ceiling: number): void;
    }
  }
}

// 自定义 matcher
import { expect } from 'vitest';

expect.extend({
  toBeWithinRange(received: number, floor: number, ceiling: number) {
    const pass = received >= floor && received <= ceiling;
    if (pass) {
      return {
        message: () =>
          `expected ${received} not to be within range ${floor} - ${ceiling}`,
        pass: true,
      };
    } else {
      return {
        message: () =>
          `expected ${received} to be within range ${floor} - ${ceiling}`,
        pass: false,
      };
    }
  },
});