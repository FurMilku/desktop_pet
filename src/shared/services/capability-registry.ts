/**
 * 能力注册表服务实现
 * 管理所有AI能力的注册、初始化和生命周期
 * 
 * 功能：
 * - 能力注册/注销
 * - 按依赖顺序初始化所有能力
 * - 获取所有能力健康状态
 * - 能力工厂模式支持
 */

import type {
  ICapability,
  ICapabilityRegistry,
  CapabilityType,
  CapabilityStatus,
  CapabilityRegistration,
  CapabilityHealthStatus,
  CapabilityFactory,
  CapabilityFactoryRegistry,
} from '../types/capabilities';
import { getGlobalEventBus, createEvent } from './event-bus';
import { CapabilityEvents } from '../types/events';

// ============================================================================
// 依赖解析工具
// ============================================================================

/**
 * 拓扑排序 - 按依赖顺序排列能力
 * @param capabilities 能力映射表
 * @returns 排序后的能力类型数组
 * @throws 如果存在循环依赖
 */
function topologicalSort(
  capabilities: Map<CapabilityType, CapabilityRegistration>
): CapabilityType[] {
  const sorted: CapabilityType[] = [];
  const visited = new Set<CapabilityType>();
  const visiting = new Set<CapabilityType>();

  function visit(type: CapabilityType): void {
    if (visited.has(type)) {
      return;
    }
    if (visiting.has(type)) {
      throw new Error(`Circular dependency detected involving capability: ${type}`);
    }

    const registration = capabilities.get(type);
    if (!registration) {
      return;
    }

    visiting.add(type);

    // 先访问依赖
    const dependencies = registration.capability.metadata.dependencies || [];
    for (const dep of dependencies) {
      if (capabilities.has(dep)) {
        visit(dep);
      }
    }

    visiting.delete(type);
    visited.add(type);
    sorted.push(type);
  }

  // 访问所有能力
  for (const type of capabilities.keys()) {
    visit(type);
  }

  return sorted;
}

/**
 * 验证能力依赖
 * @param capability 要验证的能力
 * @param capabilities 已注册的能力
 * @returns 验证结果
 */
function validateDependencies(
  capability: ICapability,
  capabilities: Map<CapabilityType, CapabilityRegistration>
): { valid: boolean; missingDeps: CapabilityType[] } {
  const dependencies = capability.metadata.dependencies || [];
  const missingDeps: CapabilityType[] = [];

  for (const dep of dependencies) {
    if (!capabilities.has(dep)) {
      missingDeps.push(dep);
    }
  }

  return {
    valid: missingDeps.length === 0,
    missingDeps,
  };
}

// ============================================================================
// 能力注册表实现
// ============================================================================

/**
 * 能力注册表实现类
 */
export class CapabilityRegistry implements ICapabilityRegistry {
  private capabilities: Map<CapabilityType, CapabilityRegistration> = new Map();
  private initializeOrder = 0;
  private initialized = false;
  private eventBus = getGlobalEventBus();

  /**
   * 注册能力
   * @param capability 能力实例
   * @throws 如果能力类型已注册
   */
  register<T extends ICapability>(capability: T): void {
    const type = capability.metadata.type;

    if (this.capabilities.has(type)) {
      throw new Error(`Capability type "${type}" is already registered`);
    }

    const registration: CapabilityRegistration = {
      capability,
      registeredAt: new Date(),
      initializeOrder: this.initializeOrder++,
    };

    this.capabilities.set(type, registration);

    // 发出注册事件
    this.eventBus.emit(
      createEvent({
        type: CapabilityEvents.REGISTERED,
        payload: {
          type,
          metadata: capability.metadata,
        },
        source: 'capability-registry',
      })
    );

    console.log(`[CapabilityRegistry] Registered capability: ${type}`);
  }

  /**
   * 注销能力
   * @param type 能力类型
   */
  unregister(type: CapabilityType): void {
    const registration = this.capabilities.get(type);
    if (!registration) {
      console.warn(`[CapabilityRegistry] Capability type "${type}" is not registered`);
      return;
    }

    // 检查是否有其他能力依赖此能力
    const dependents = this.getDependents(type);
    if (dependents.length > 0) {
      throw new Error(
        `Cannot unregister capability "${type}" because it is required by: ${dependents.join(', ')}`
      );
    }

    // 如果能力已初始化，先销毁
    if (registration.capability.isReady()) {
      registration.capability.destroy().catch((error) => {
        console.error(`[CapabilityRegistry] Error destroying capability ${type}:`, error);
      });
    }

    this.capabilities.delete(type);

    // 发出注销事件
    this.eventBus.emit(
      createEvent({
        type: CapabilityEvents.UNREGISTERED,
        payload: {
          type,
        },
        source: 'capability-registry',
      })
    );

    console.log(`[CapabilityRegistry] Unregistered capability: ${type}`);
  }

  /**
   * 获取能力
   * @param type 能力类型
   * @returns 能力实例或 undefined
   */
  get<T extends ICapability>(type: CapabilityType): T | undefined {
    const registration = this.capabilities.get(type);
    return registration?.capability as T | undefined;
  }

  /**
   * 检查能力是否已注册
   * @param type 能力类型
   */
  has(type: CapabilityType): boolean {
    return this.capabilities.has(type);
  }

  /**
   * 获取所有已注册的能力
   */
  getAll(): Map<CapabilityType, CapabilityRegistration> {
    return new Map(this.capabilities);
  }

  /**
   * 初始化所有能力（按依赖顺序）
   */
  async initializeAll(): Promise<void> {
    if (this.initialized) {
      console.warn('[CapabilityRegistry] Already initialized');
      return;
    }

    console.log('[CapabilityRegistry] Starting capability initialization...');

    // 验证所有依赖
    for (const [type, registration] of this.capabilities) {
      const { valid, missingDeps } = validateDependencies(
        registration.capability,
        this.capabilities
      );

      if (!valid) {
        // 检查缺失的依赖是否是必需的
        const missingRequired = missingDeps.filter((dep) => {
          // 获取声明该依赖的能力的元数据
          const depMeta = registration.capability.metadata;
          return depMeta.required !== false;
        });

        if (missingRequired.length > 0) {
          throw new Error(
            `Capability "${type}" has missing dependencies: ${missingRequired.join(', ')}`
          );
        } else {
          console.warn(
            `[CapabilityRegistry] Capability "${type}" has optional missing dependencies: ${missingDeps.join(', ')}`
          );
        }
      }
    }

    // 按依赖顺序排序
    let sortedTypes: CapabilityType[];
    try {
      sortedTypes = topologicalSort(this.capabilities);
    } catch (error) {
      throw error;
    }

    console.log(`[CapabilityRegistry] Initialization order: ${sortedTypes.join(' -> ')}`);

    // 按顺序初始化
    const failedCapabilities: { type: CapabilityType; error: Error }[] = [];

    for (const type of sortedTypes) {
      const registration = this.capabilities.get(type)!;
      const capability = registration.capability;

      // 发出初始化开始事件
      this.eventBus.emit(
        createEvent({
          type: CapabilityEvents.INITIALIZING,
          payload: {
            type,
            metadata: capability.metadata,
          },
          source: 'capability-registry',
        })
      );

      try {
        console.log(`[CapabilityRegistry] Initializing capability: ${type}`);
        const success = await capability.initialize();

        if (success) {
          console.log(`[CapabilityRegistry] Capability ${type} initialized successfully`);
          
          // 发出初始化成功事件
          this.eventBus.emit(
            createEvent({
              type: CapabilityEvents.READY,
              payload: {
                type,
                metadata: capability.metadata,
              },
              source: 'capability-registry',
            })
          );
        } else {
          throw new Error(`Initialization returned false`);
        }
      } catch (error) {
        console.error(`[CapabilityRegistry] Failed to initialize capability ${type}:`, error);
        
        // 发出初始化失败事件
        this.eventBus.emit(
          createEvent({
            type: CapabilityEvents.ERROR,
            payload: {
              type,
              error: error as Error,
              message: (error as Error).message,
            },
            source: 'capability-registry',
          })
        );

        // 检查是否为必需能力
        if (capability.metadata.required !== false) {
          failedCapabilities.push({ type, error: error as Error });
        } else {
          console.warn(`[CapabilityRegistry] Optional capability ${type} failed, continuing...`);
        }
      }
    }

    // 如果有必需能力初始化失败，抛出错误
    if (failedCapabilities.length > 0) {
      const failures = failedCapabilities
        .map((f) => `${f.type}: ${f.error.message}`)
        .join('; ');
      throw new Error(`Failed to initialize required capabilities: ${failures}`);
    }

    this.initialized = true;
    console.log('[CapabilityRegistry] All capabilities initialized successfully');
  }

  /**
   * 销毁所有能力
   */
  async destroyAll(): Promise<void> {
    console.log('[CapabilityRegistry] Destroying all capabilities...');

    // 按依赖逆序销毁
    let sortedTypes: CapabilityType[];
    try {
      sortedTypes = topologicalSort(this.capabilities).reverse();
    } catch {
      // 如果有循环依赖，按注册顺序逆序
      sortedTypes = Array.from(this.capabilities.keys()).reverse();
    }

    const errors: { type: CapabilityType; error: Error }[] = [];

    for (const type of sortedTypes) {
      const registration = this.capabilities.get(type);
      if (!registration) continue;

      try {
        console.log(`[CapabilityRegistry] Destroying capability: ${type}`);
        await registration.capability.destroy();
        console.log(`[CapabilityRegistry] Capability ${type} destroyed`);
      } catch (error) {
        console.error(`[CapabilityRegistry] Error destroying capability ${type}:`, error);
        errors.push({ type, error: error as Error });
      }
    }

    this.capabilities.clear();
    this.initialized = false;
    this.initializeOrder = 0;

    if (errors.length > 0) {
      const errorMessages = errors
        .map((e) => `${e.type}: ${e.error.message}`)
        .join('; ');
      console.error(`[CapabilityRegistry] Some capabilities failed to destroy: ${errorMessages}`);
    }

    console.log('[CapabilityRegistry] All capabilities destroyed');
  }

  /**
   * 获取所有能力的健康状态
   */
  async healthCheckAll(): Promise<Map<CapabilityType, CapabilityHealthStatus>> {
    const results = new Map<CapabilityType, CapabilityHealthStatus>();

    const healthChecks = Array.from(this.capabilities.entries()).map(
      async ([type, registration]) => {
        try {
          const status = await registration.capability.healthCheck();
          results.set(type, status);
        } catch (error) {
          results.set(type, {
            healthy: false,
            status: 'error' as CapabilityStatus,
            message: (error as Error).message,
            lastChecked: new Date(),
          });
        }
      }
    );

    await Promise.all(healthChecks);

    // 发出健康检查完成事件
    this.eventBus.emit(
      createEvent({
        type: CapabilityEvents.HEALTH_CHECK,
        payload: {
          results: Object.fromEntries(results),
          timestamp: new Date(),
        },
        source: 'capability-registry',
      })
    );

    return results;
  }

  // ============================================================================
  // 辅助方法
  // ============================================================================

  /**
   * 获取依赖于指定能力的所有能力
   * @param type 能力类型
   */
  getDependents(type: CapabilityType): CapabilityType[] {
    const dependents: CapabilityType[] = [];

    for (const [capType, registration] of this.capabilities) {
      const dependencies = registration.capability.metadata.dependencies || [];
      if (dependencies.includes(type)) {
        dependents.push(capType);
      }
    }

    return dependents;
  }

  /**
   * 获取指定能力的所有依赖
   * @param type 能力类型
   */
  getDependencies(type: CapabilityType): CapabilityType[] {
    const registration = this.capabilities.get(type);
    if (!registration) {
      return [];
    }
    return registration.capability.metadata.dependencies || [];
  }

  /**
   * 检查是否已初始化
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * 获取能力数量
   */
  size(): number {
    return this.capabilities.size;
  }

  /**
   * 获取所有已就绪的能力类型
   */
  getReadyCapabilities(): CapabilityType[] {
    const ready: CapabilityType[] = [];
    for (const [type, registration] of this.capabilities) {
      if (registration.capability.isReady()) {
        ready.push(type);
      }
    }
    return ready;
  }

  /**
   * 等待能力就绪
   * @param type 能力类型
   * @param timeout 超时时间 (毫秒)
   */
  async waitForReady(type: CapabilityType, timeout = 30000): Promise<ICapability> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const registration = this.capabilities.get(type);
      if (registration?.capability.isReady()) {
        return registration.capability;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    throw new Error(`Timeout waiting for capability "${type}" to be ready`);
  }
}

// ============================================================================
// 能力工厂注册表实现
// ============================================================================

/**
 * 能力工厂注册表实现
 */
export class CapabilityFactoryRegistryImpl implements CapabilityFactoryRegistry {
  private factories: Map<CapabilityType, CapabilityFactory<ICapability>> = new Map();

  /**
   * 注册能力工厂
   * @param type 能力类型
   * @param factory 工厂函数
   */
  registerFactory<T extends ICapability>(
    type: CapabilityType,
    factory: CapabilityFactory<T>
  ): void {
    if (this.factories.has(type)) {
      console.warn(`[CapabilityFactoryRegistry] Overwriting factory for type: ${type}`);
    }
    this.factories.set(type, factory as CapabilityFactory<ICapability>);
    console.log(`[CapabilityFactoryRegistry] Registered factory for: ${type}`);
  }

  /**
   * 获取能力工厂
   * @param type 能力类型
   */
  getFactory<T extends ICapability>(type: CapabilityType): CapabilityFactory<T> | undefined {
    return this.factories.get(type) as CapabilityFactory<T> | undefined;
  }

  /**
   * 创建能力实例
   * @param type 能力类型
   * @param config 配置
   */
  create<T extends ICapability>(type: CapabilityType, config?: Record<string, unknown>): T {
    const factory = this.factories.get(type);
    if (!factory) {
      throw new Error(`No factory registered for capability type: ${type}`);
    }
    return factory(config) as T;
  }

  /**
   * 检查是否已注册工厂
   * @param type 能力类型
   */
  hasFactory(type: CapabilityType): boolean {
    return this.factories.has(type);
  }

  /**
   * 获取所有已注册的工厂类型
   */
  getRegisteredTypes(): CapabilityType[] {
    return Array.from(this.factories.keys());
  }
}

// ============================================================================
// 单例实例
// ============================================================================

let globalCapabilityRegistry: CapabilityRegistry | null = null;
let globalFactoryRegistry: CapabilityFactoryRegistryImpl | null = null;

/**
 * 获取全局能力注册表实例
 */
export function getGlobalCapabilityRegistry(): CapabilityRegistry {
  if (!globalCapabilityRegistry) {
    globalCapabilityRegistry = new CapabilityRegistry();
  }
  return globalCapabilityRegistry;
}

/**
 * 重置全局能力注册表
 */
export async function resetGlobalCapabilityRegistry(): Promise<void> {
  if (globalCapabilityRegistry) {
    await globalCapabilityRegistry.destroyAll();
    globalCapabilityRegistry = null;
  }
}

/**
 * 获取全局能力工厂注册表实例
 */
export function getGlobalFactoryRegistry(): CapabilityFactoryRegistryImpl {
  if (!globalFactoryRegistry) {
    globalFactoryRegistry = new CapabilityFactoryRegistryImpl();
  }
  return globalFactoryRegistry;
}

/**
 * 重置全局能力工厂注册表
 */
export function resetGlobalFactoryRegistry(): void {
  globalFactoryRegistry = null;
}

// ============================================================================
// 便捷函数
// ============================================================================

/**
 * 创建并注册能力
 * @param type 能力类型
 * @param config 配置
 * @param registry 注册表（可选，默认使用全局注册表）
 */
export function createAndRegisterCapability<T extends ICapability>(
  type: CapabilityType,
  config?: Record<string, unknown>,
  registry?: CapabilityRegistry
): T {
  const factoryRegistry = getGlobalFactoryRegistry();
  const capability = factoryRegistry.create<T>(type, config);
  
  const capabilityRegistry = registry || getGlobalCapabilityRegistry();
  capabilityRegistry.register(capability);
  
  return capability;
}

/**
 * 快速初始化指定能力
 * @param types 要初始化的能力类型数组
 * @param configs 各能力的配置
 */
export async function initializeCapabilities(
  types: CapabilityType[],
  configs?: Partial<Record<CapabilityType, Record<string, unknown>>>
): Promise<CapabilityRegistry> {
  const registry = getGlobalCapabilityRegistry();
  const factoryRegistry = getGlobalFactoryRegistry();

  // 创建并注册所有能力
  for (const type of types) {
    if (!registry.has(type)) {
      const config = configs?.[type];
      const capability = factoryRegistry.create(type, config);
      registry.register(capability);
    }
  }

  // 初始化所有能力
  await registry.initializeAll();

  return registry;
}

// ============================================================================
// 导出
// ============================================================================

export default CapabilityRegistry;