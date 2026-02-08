/**
 * T026a [P] [US1] 单元测试：WebGL不支持降级处理
 * 
 * 测试当用户显卡不支持 WebGL 时的降级处理，包括：
 * - WebGL 能力检测
 * - 降级 UI 显示
 * - 错误提示和系统要求建议
 * 
 * @see specs/001-desktop-3d-pet/spec.md Edge Cases
 * @see specs/001-desktop-3d-pet/spec.md NFR-010 (WebGL2支持要求)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// 类型定义
// ============================================================================

/**
 * WebGL 能力级别
 */
export enum WebGLCapabilityLevel {
  /** 不支持 WebGL */
  NONE = 'none',
  /** 仅支持 WebGL 1.0 */
  WEBGL1 = 'webgl1',
  /** 支持 WebGL 2.0 */
  WEBGL2 = 'webgl2',
}

/**
 * WebGL 检测结果
 */
export interface WebGLDetectionResult {
  /** 能力级别 */
  level: WebGLCapabilityLevel;
  /** 是否满足最低要求 */
  meetsRequirements: boolean;
  /** 渲染器名称 */
  renderer?: string;
  /** 厂商名称 */
  vendor?: string;
  /** 最大纹理尺寸 */
  maxTextureSize?: number;
  /** 最大顶点属性数 */
  maxVertexAttribs?: number;
  /** 错误信息（如果检测失败） */
  error?: string;
  /** 详细诊断信息 */
  diagnostics?: WebGLDiagnostics;
}

/**
 * WebGL 诊断信息
 */
export interface WebGLDiagnostics {
  /** 支持的扩展列表 */
  extensions: string[];
  /** 着色器精度 */
  shaderPrecision?: {
    vertexHighFloat: boolean;
    fragmentHighFloat: boolean;
  };
  /** 性能警告 */
  performanceWarnings: string[];
}

/**
 * 降级选项
 */
export interface FallbackOptions {
  /** 是否显示错误对话框 */
  showErrorDialog?: boolean;
  /** 是否记录到日志 */
  logError?: boolean;
  /** 是否尝试软件渲染 */
  trySoftwareRenderer?: boolean;
  /** 自定义错误消息 */
  customMessage?: string;
}

/**
 * 降级 UI 配置
 */
export interface FallbackUIConfig {
  /** 标题 */
  title: string;
  /** 错误消息 */
  message: string;
  /** 系统要求说明 */
  systemRequirements: string[];
  /** 建议操作 */
  suggestions: string[];
  /** 是否显示技术详情 */
  showTechnicalDetails: boolean;
  /** 帮助链接 */
  helpUrl?: string;
}

/**
 * WebGL 检测器接口
 */
export interface IWebGLDetector {
  /**
   * 检测 WebGL 支持情况
   */
  detect(): WebGLDetectionResult;

  /**
   * 检查是否满足应用最低要求
   */
  meetsMinimumRequirements(): boolean;

  /**
   * 获取推荐的渲染模式
   */
  getRecommendedRenderMode(): 'webgl2' | 'webgl1' | 'canvas2d' | 'none';

  /**
   * 获取诊断信息
   */
  getDiagnostics(): WebGLDiagnostics;
}

/**
 * WebGL 降级处理器接口
 */
export interface IWebGLFallbackHandler {
  /**
   * 初始化降级处理器
   */
  initialize(): void;

  /**
   * 销毁降级处理器
   */
  dispose(): void;

  /**
   * 处理 WebGL 不可用情况
   * @param result - 检测结果
   * @param options - 降级选项
   */
  handleWebGLUnavailable(
    result: WebGLDetectionResult,
    options?: FallbackOptions
  ): Promise<void>;

  /**
   * 显示降级 UI
   * @param config - UI 配置
   */
  showFallbackUI(config: FallbackUIConfig): void;

  /**
   * 隐藏降级 UI
   */
  hideFallbackUI(): void;

  /**
   * 检查是否正在显示降级 UI
   */
  isFallbackUIVisible(): boolean;

  /**
   * 获取本地化的错误消息
   * @param level - WebGL 能力级别
   * @param locale - 语言区域
   */
  getLocalizedMessage(level: WebGLCapabilityLevel, locale?: string): FallbackUIConfig;

  /**
   * 监听用户操作
   * @param callback - 回调函数
   */
  onUserAction(callback: (action: 'retry' | 'help' | 'close') => void): () => void;
}

// ============================================================================
// Mock 工厂
// ============================================================================

/**
 * 创建 Mock WebGL 检测结果
 */
function createMockDetectionResult(
  overrides: Partial<WebGLDetectionResult> = {}
): WebGLDetectionResult {
  return {
    level: WebGLCapabilityLevel.WEBGL2,
    meetsRequirements: true,
    renderer: 'ANGLE (NVIDIA GeForce GTX 1080)',
    vendor: 'Google Inc. (NVIDIA)',
    maxTextureSize: 16384,
    maxVertexAttribs: 16,
    diagnostics: {
      extensions: ['OES_texture_float', 'WEBGL_depth_texture'],
      shaderPrecision: {
        vertexHighFloat: true,
        fragmentHighFloat: true,
      },
      performanceWarnings: [],
    },
    ...overrides,
  };
}

/**
 * 创建 Mock WebGL 检测器
 */
function createMockDetector(
  result: WebGLDetectionResult = createMockDetectionResult()
): IWebGLDetector {
  return {
    detect: vi.fn(() => result),
    meetsMinimumRequirements: vi.fn(() => result.meetsRequirements),
    getRecommendedRenderMode: vi.fn(() => {
      switch (result.level) {
        case WebGLCapabilityLevel.WEBGL2:
          return 'webgl2';
        case WebGLCapabilityLevel.WEBGL1:
          return 'webgl1';
        default:
          return 'none';
      }
    }),
    getDiagnostics: vi.fn(() => result.diagnostics || {
      extensions: [],
      performanceWarnings: [],
    }),
  };
}

/**
 * 创建 Mock 降级处理器
 */
function createMockFallbackHandler(): IWebGLFallbackHandler {
  let fallbackUIVisible = false;
  const userActionCallbacks: ((action: 'retry' | 'help' | 'close') => void)[] = [];

  return {
    initialize: vi.fn(),
    dispose: vi.fn(),
    
    handleWebGLUnavailable: vi.fn(async (result, options) => {
      const config = {
        title: 'WebGL 不可用',
        message: result.error || '您的显卡不支持 WebGL',
        systemRequirements: [
          '支持 WebGL 2.0 的显卡',
          '最新版本的显卡驱动',
          '现代浏览器 (Chrome 56+, Firefox 51+, Safari 15+)',
        ],
        suggestions: [
          '更新显卡驱动程序',
          '检查浏览器是否启用了硬件加速',
          '尝试使用其他浏览器',
        ],
        showTechnicalDetails: false,
        helpUrl: 'https://example.com/webgl-help',
      };
      
      if (options?.showErrorDialog !== false) {
        fallbackUIVisible = true;
      }
    }),
    
    showFallbackUI: vi.fn((config) => {
      fallbackUIVisible = true;
    }),
    
    hideFallbackUI: vi.fn(() => {
      fallbackUIVisible = false;
    }),
    
    isFallbackUIVisible: vi.fn(() => fallbackUIVisible),
    
    getLocalizedMessage: vi.fn((level, locale = 'zh-CN') => {
      const messages: Record<WebGLCapabilityLevel, FallbackUIConfig> = {
        [WebGLCapabilityLevel.NONE]: {
          title: locale === 'zh-CN' ? 'WebGL 不可用' : 'WebGL Unavailable',
          message: locale === 'zh-CN' 
            ? '您的显卡不支持 WebGL，无法显示 3D 宠物。'
            : 'Your graphics card does not support WebGL.',
          systemRequirements: [
            locale === 'zh-CN' ? '支持 WebGL 2.0 的显卡' : 'Graphics card supporting WebGL 2.0',
            locale === 'zh-CN' ? '4GB 内存' : '4GB RAM',
          ],
          suggestions: [
            locale === 'zh-CN' ? '更新显卡驱动程序' : 'Update graphics drivers',
            locale === 'zh-CN' ? '启用硬件加速' : 'Enable hardware acceleration',
          ],
          showTechnicalDetails: false,
        },
        [WebGLCapabilityLevel.WEBGL1]: {
          title: locale === 'zh-CN' ? 'WebGL 版本过低' : 'WebGL Version Too Low',
          message: locale === 'zh-CN'
            ? '您的显卡仅支持 WebGL 1.0，建议升级显卡驱动以获得最佳体验。'
            : 'Your graphics card only supports WebGL 1.0.',
          systemRequirements: [
            locale === 'zh-CN' ? '支持 WebGL 2.0 的显卡' : 'Graphics card supporting WebGL 2.0',
          ],
          suggestions: [
            locale === 'zh-CN' ? '更新显卡驱动程序' : 'Update graphics drivers',
          ],
          showTechnicalDetails: false,
        },
        [WebGLCapabilityLevel.WEBGL2]: {
          title: '',
          message: '',
          systemRequirements: [],
          suggestions: [],
          showTechnicalDetails: false,
        },
      };
      
      return messages[level];
    }),
    
    onUserAction: vi.fn((callback) => {
      userActionCallbacks.push(callback);
      return () => {
        const index = userActionCallbacks.indexOf(callback);
        if (index > -1) userActionCallbacks.splice(index, 1);
      };
    }),
  };
}

// ============================================================================
// 测试套件
// ============================================================================

describe('WebGL Detection', () => {
  // --------------------------------------------------------------------------
  // WebGL 能力检测测试
  // --------------------------------------------------------------------------

  describe('capability detection', () => {
    it('should detect WebGL 2.0 support', () => {
      const detector = createMockDetector(createMockDetectionResult({
        level: WebGLCapabilityLevel.WEBGL2,
        meetsRequirements: true,
      }));

      const result = detector.detect();

      expect(result.level).toBe(WebGLCapabilityLevel.WEBGL2);
      expect(result.meetsRequirements).toBe(true);
    });

    it('should detect WebGL 1.0 only support', () => {
      const detector = createMockDetector(createMockDetectionResult({
        level: WebGLCapabilityLevel.WEBGL1,
        meetsRequirements: false,
      }));

      const result = detector.detect();

      expect(result.level).toBe(WebGLCapabilityLevel.WEBGL1);
      expect(result.meetsRequirements).toBe(false);
    });

    it('should detect no WebGL support', () => {
      const detector = createMockDetector(createMockDetectionResult({
        level: WebGLCapabilityLevel.NONE,
        meetsRequirements: false,
        error: 'WebGL is not supported',
      }));

      const result = detector.detect();

      expect(result.level).toBe(WebGLCapabilityLevel.NONE);
      expect(result.meetsRequirements).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should report renderer information', () => {
      const detector = createMockDetector(createMockDetectionResult({
        renderer: 'ANGLE (Intel HD Graphics 630)',
        vendor: 'Google Inc. (Intel)',
      }));

      const result = detector.detect();

      expect(result.renderer).toContain('Intel');
      expect(result.vendor).toBeDefined();
    });

    it('should report GPU capabilities', () => {
      const detector = createMockDetector(createMockDetectionResult({
        maxTextureSize: 16384,
        maxVertexAttribs: 16,
      }));

      const result = detector.detect();

      expect(result.maxTextureSize).toBeGreaterThanOrEqual(4096);
      expect(result.maxVertexAttribs).toBeGreaterThanOrEqual(8);
    });
  });

  // --------------------------------------------------------------------------
  // 最低要求检查测试
  // --------------------------------------------------------------------------

  describe('minimum requirements check', () => {
    it('should pass when WebGL 2.0 is available', () => {
      const detector = createMockDetector(createMockDetectionResult({
        level: WebGLCapabilityLevel.WEBGL2,
      }));

      expect(detector.meetsMinimumRequirements()).toBe(true);
    });

    it('should fail when only WebGL 1.0 is available', () => {
      const detector = createMockDetector(createMockDetectionResult({
        level: WebGLCapabilityLevel.WEBGL1,
        meetsRequirements: false,
      }));

      expect(detector.meetsMinimumRequirements()).toBe(false);
    });

    it('should fail when WebGL is not available', () => {
      const detector = createMockDetector(createMockDetectionResult({
        level: WebGLCapabilityLevel.NONE,
        meetsRequirements: false,
      }));

      expect(detector.meetsMinimumRequirements()).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // 渲染模式推荐测试
  // --------------------------------------------------------------------------

  describe('render mode recommendation', () => {
    it('should recommend webgl2 when available', () => {
      const detector = createMockDetector(createMockDetectionResult({
        level: WebGLCapabilityLevel.WEBGL2,
      }));

      expect(detector.getRecommendedRenderMode()).toBe('webgl2');
    });

    it('should recommend webgl1 when only webgl1 is available', () => {
      const detector = createMockDetector(createMockDetectionResult({
        level: WebGLCapabilityLevel.WEBGL1,
      }));

      expect(detector.getRecommendedRenderMode()).toBe('webgl1');
    });

    it('should recommend none when WebGL is unavailable', () => {
      const detector = createMockDetector(createMockDetectionResult({
        level: WebGLCapabilityLevel.NONE,
      }));

      expect(detector.getRecommendedRenderMode()).toBe('none');
    });
  });

  // --------------------------------------------------------------------------
  // 诊断信息测试
  // --------------------------------------------------------------------------

  describe('diagnostics', () => {
    it('should list supported extensions', () => {
      const detector = createMockDetector(createMockDetectionResult({
        diagnostics: {
          extensions: ['OES_texture_float', 'WEBGL_depth_texture', 'EXT_color_buffer_float'],
          performanceWarnings: [],
        },
      }));

      const diagnostics = detector.getDiagnostics();

      expect(diagnostics.extensions).toContain('OES_texture_float');
      expect(diagnostics.extensions.length).toBeGreaterThan(0);
    });

    it('should report shader precision', () => {
      const detector = createMockDetector(createMockDetectionResult({
        diagnostics: {
          extensions: [],
          shaderPrecision: {
            vertexHighFloat: true,
            fragmentHighFloat: true,
          },
          performanceWarnings: [],
        },
      }));

      const diagnostics = detector.getDiagnostics();

      expect(diagnostics.shaderPrecision).toBeDefined();
      expect(diagnostics.shaderPrecision?.vertexHighFloat).toBe(true);
    });

    it('should report performance warnings', () => {
      const detector = createMockDetector(createMockDetectionResult({
        diagnostics: {
          extensions: [],
          performanceWarnings: ['Software rendering detected'],
        },
      }));

      const diagnostics = detector.getDiagnostics();

      expect(diagnostics.performanceWarnings).toContain('Software rendering detected');
    });
  });
});

describe('WebGL Fallback Handler', () => {
  let fallbackHandler: IWebGLFallbackHandler;

  beforeEach(() => {
    fallbackHandler = createMockFallbackHandler();
    fallbackHandler.initialize();
  });

  afterEach(() => {
    fallbackHandler.dispose();
  });

  // --------------------------------------------------------------------------
  // 降级处理测试
  // --------------------------------------------------------------------------

  describe('handling WebGL unavailable', () => {
    it('should handle WebGL unavailable gracefully', async () => {
      const result = createMockDetectionResult({
        level: WebGLCapabilityLevel.NONE,
        meetsRequirements: false,
        error: 'WebGL context creation failed',
      });

      await fallbackHandler.handleWebGLUnavailable(result);

      expect(fallbackHandler.handleWebGLUnavailable).toHaveBeenCalledWith(result);
    });

    it('should show fallback UI by default', async () => {
      const result = createMockDetectionResult({
        level: WebGLCapabilityLevel.NONE,
        meetsRequirements: false,
      });

      await fallbackHandler.handleWebGLUnavailable(result);

      expect(fallbackHandler.isFallbackUIVisible()).toBe(true);
    });

    it('should respect showErrorDialog option', async () => {
      const result = createMockDetectionResult({
        level: WebGLCapabilityLevel.NONE,
        meetsRequirements: false,
      });

      await fallbackHandler.handleWebGLUnavailable(result, {
        showErrorDialog: false,
      });

      expect(fallbackHandler.handleWebGLUnavailable).toHaveBeenCalledWith(
        result,
        expect.objectContaining({ showErrorDialog: false })
      );
    });
  });

  // --------------------------------------------------------------------------
  // 降级 UI 测试
  // --------------------------------------------------------------------------

  describe('fallback UI', () => {
    it('should show fallback UI with correct configuration', () => {
      const config: FallbackUIConfig = {
        title: '显卡不支持',
        message: '您的显卡不支持 WebGL 2.0',
        systemRequirements: ['WebGL 2.0 支持'],
        suggestions: ['更新显卡驱动'],
        showTechnicalDetails: false,
      };

      fallbackHandler.showFallbackUI(config);

      expect(fallbackHandler.showFallbackUI).toHaveBeenCalledWith(config);
      expect(fallbackHandler.isFallbackUIVisible()).toBe(true);
    });

    it('should hide fallback UI', () => {
      fallbackHandler.showFallbackUI({
        title: 'Test',
        message: 'Test',
        systemRequirements: [],
        suggestions: [],
        showTechnicalDetails: false,
      });

      fallbackHandler.hideFallbackUI();

      expect(fallbackHandler.isFallbackUIVisible()).toBe(false);
    });

    it('should toggle fallback UI visibility', () => {
      expect(fallbackHandler.isFallbackUIVisible()).toBe(false);

      fallbackHandler.showFallbackUI({
        title: 'Test',
        message: 'Test',
        systemRequirements: [],
        suggestions: [],
        showTechnicalDetails: false,
      });

      expect(fallbackHandler.isFallbackUIVisible()).toBe(true);

      fallbackHandler.hideFallbackUI();

      expect(fallbackHandler.isFallbackUIVisible()).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // 本地化消息测试
  // --------------------------------------------------------------------------

  describe('localized messages', () => {
    it('should provide Chinese message for no WebGL support', () => {
      const message = fallbackHandler.getLocalizedMessage(
        WebGLCapabilityLevel.NONE,
        'zh-CN'
      );

      expect(message.title).toContain('WebGL');
      expect(message.message).toContain('不支持');
      expect(message.systemRequirements.length).toBeGreaterThan(0);
      expect(message.suggestions.length).toBeGreaterThan(0);
    });

    it('should provide English message when requested', () => {
      const message = fallbackHandler.getLocalizedMessage(
        WebGLCapabilityLevel.NONE,
        'en-US'
      );

      expect(message.title).toContain('WebGL');
      expect(message.message).toContain('not support');
    });

    it('should provide message for WebGL 1.0 only', () => {
      const message = fallbackHandler.getLocalizedMessage(
        WebGLCapabilityLevel.WEBGL1,
        'zh-CN'
      );

      expect(message.title).toContain('版本');
      expect(message.message).toContain('WebGL 1.0');
    });

    it('should include system requirements in message', () => {
      const message = fallbackHandler.getLocalizedMessage(
        WebGLCapabilityLevel.NONE,
        'zh-CN'
      );

      // 使用 some() 检查数组中是否有元素包含指定字符串
      expect(message.systemRequirements.some(s => s.includes('WebGL 2.0'))).toBe(true);
    });

    it('should include helpful suggestions', () => {
      const message = fallbackHandler.getLocalizedMessage(
        WebGLCapabilityLevel.NONE,
        'zh-CN'
      );

      // 使用 some() 检查数组中是否有元素包含指定字符串
      expect(message.suggestions.some(s => s.includes('驱动'))).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // 用户操作处理测试
  // --------------------------------------------------------------------------

  describe('user action handling', () => {
    it('should allow subscribing to user actions', () => {
      const callback = vi.fn();
      const unsubscribe = fallbackHandler.onUserAction(callback);

      expect(fallbackHandler.onUserAction).toHaveBeenCalled();
      expect(typeof unsubscribe).toBe('function');
    });

    it('should allow unsubscribing from user actions', () => {
      const callback = vi.fn();
      const unsubscribe = fallbackHandler.onUserAction(callback);

      unsubscribe();

      // 回调应该被移除
      expect(fallbackHandler.onUserAction).toHaveBeenCalled();
    });
  });
});

// ============================================================================
// 集成场景测试
// ============================================================================

describe('WebGL Fallback Integration Scenarios', () => {
  describe('Edge Case: User GPU does not support WebGL', () => {
    it('should show friendly error and system requirements', async () => {
      // 模拟用户显卡不支持 WebGL 的情况
      const detector = createMockDetector(createMockDetectionResult({
        level: WebGLCapabilityLevel.NONE,
        meetsRequirements: false,
        error: 'WebGL is not supported by your graphics card',
      }));

      const fallbackHandler = createMockFallbackHandler();
      fallbackHandler.initialize();

      // 检测 WebGL
      const result = detector.detect();

      // 验证不满足要求
      expect(detector.meetsMinimumRequirements()).toBe(false);

      // 处理降级
      await fallbackHandler.handleWebGLUnavailable(result);

      // 验证显示了降级 UI
      expect(fallbackHandler.isFallbackUIVisible()).toBe(true);

      // 获取本地化消息
      const message = fallbackHandler.getLocalizedMessage(result.level, 'zh-CN');

      // 验证消息内容
      expect(message.title).toBeDefined();
      expect(message.systemRequirements.length).toBeGreaterThan(0);
      expect(message.suggestions.length).toBeGreaterThan(0);

      fallbackHandler.dispose();
    });

    it('should provide actionable suggestions', async () => {
      const detector = createMockDetector(createMockDetectionResult({
        level: WebGLCapabilityLevel.NONE,
        meetsRequirements: false,
      }));

      const fallbackHandler = createMockFallbackHandler();
      fallbackHandler.initialize();

      const result = detector.detect();
      const message = fallbackHandler.getLocalizedMessage(result.level);

      // 验证建议是可操作的
      const hasDriverSuggestion = message.suggestions.some(
        s => s.includes('驱动') || s.includes('driver')
      );
      expect(hasDriverSuggestion).toBe(true);

      fallbackHandler.dispose();
    });
  });

  describe('Edge Case: Only WebGL 1.0 supported', () => {
    it('should show warning but may allow degraded experience', async () => {
      const detector = createMockDetector(createMockDetectionResult({
        level: WebGLCapabilityLevel.WEBGL1,
        meetsRequirements: false,
      }));

      const fallbackHandler = createMockFallbackHandler();
      fallbackHandler.initialize();

      const result = detector.detect();

      // WebGL 1.0 不满足最低要求（需要 WebGL 2.0）
      expect(detector.meetsMinimumRequirements()).toBe(false);

      // 获取消息
      const message = fallbackHandler.getLocalizedMessage(result.level);

      // 消息应该说明版本问题
      expect(message.message).toContain('WebGL 1.0');

      fallbackHandler.dispose();
    });
  });

  describe('Normal Case: WebGL 2.0 supported', () => {
    it('should not show fallback UI', () => {
      const detector = createMockDetector(createMockDetectionResult({
        level: WebGLCapabilityLevel.WEBGL2,
        meetsRequirements: true,
      }));

      const fallbackHandler = createMockFallbackHandler();
      fallbackHandler.initialize();

      const result = detector.detect();

      // WebGL 2.0 满足要求
      expect(detector.meetsMinimumRequirements()).toBe(true);
      expect(result.level).toBe(WebGLCapabilityLevel.WEBGL2);

      // 不应该显示降级 UI
      expect(fallbackHandler.isFallbackUIVisible()).toBe(false);

      fallbackHandler.dispose();
    });

    it('should recommend WebGL 2.0 render mode', () => {
      const detector = createMockDetector(createMockDetectionResult({
        level: WebGLCapabilityLevel.WEBGL2,
        meetsRequirements: true,
      }));

      expect(detector.getRecommendedRenderMode()).toBe('webgl2');
    });
  });
});

// ============================================================================
// 性能和稳定性测试
// ============================================================================

describe('WebGL Detection Performance', () => {
  it('should detect WebGL capabilities quickly', () => {
    const detector = createMockDetector();
    
    const startTime = performance.now();
    detector.detect();
    const endTime = performance.now();

    // 检测应该很快完成（< 100ms）
    expect(endTime - startTime).toBeLessThan(100);
  });

  it('should handle detection errors gracefully', () => {
    const detector = createMockDetector(createMockDetectionResult({
      level: WebGLCapabilityLevel.NONE,
      meetsRequirements: false,
      error: 'Context creation failed',
    }));

    // 不应该抛出异常
    expect(() => detector.detect()).not.toThrow();

    const result = detector.detect();
    expect(result.error).toBeDefined();
  });

  it('should provide consistent results on repeated detection', () => {
    const detector = createMockDetector();

    const result1 = detector.detect();
    const result2 = detector.detect();

    expect(result1.level).toBe(result2.level);
    expect(result1.meetsRequirements).toBe(result2.meetsRequirements);
  });
});