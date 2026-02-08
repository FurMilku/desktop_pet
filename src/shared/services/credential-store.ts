/**
 * 凭证存储服务
 * 使用 keytar 库与系统凭证管理器交互，安全存储 API 密钥
 * 
 * 安全说明 (NFR-004):
 * - API密钥存储在操作系统的凭证管理器中
 * - Windows: Windows Credential Manager
 * - macOS: Keychain
 * - Linux: Secret Service API (libsecret)
 * - 禁止在数据库或日志中存储明文密钥
 */

import keytar from 'keytar';

/**
 * 凭证存储服务名称（用于系统凭证管理器）
 */
const SERVICE_NAME = 'desktop-pet';

/**
 * 凭证存储结果
 */
export interface CredentialResult {
  success: boolean;
  error?: string;
}

/**
 * 凭证信息（不包含实际密钥值）
 */
export interface CredentialInfo {
  providerId: string;
  hasCredential: boolean;
}

/**
 * 凭证存储服务类
 * 提供安全的 API 密钥存储、获取、删除功能
 */
export class CredentialStore {
  private readonly serviceName: string;

  constructor(serviceName: string = SERVICE_NAME) {
    this.serviceName = serviceName;
  }

  /**
   * 存储 API 密钥
   * @param providerId AI 提供商 ID（如 'openai-gpt4', 'claude-sonnet'）
   * @param apiKey API 密钥
   * @throws Error 如果存储失败
   */
  async setApiKey(providerId: string, apiKey: string): Promise<void> {
    if (!providerId || typeof providerId !== 'string') {
      throw new Error('Invalid providerId: must be a non-empty string');
    }
    if (!apiKey || typeof apiKey !== 'string') {
      throw new Error('Invalid apiKey: must be a non-empty string');
    }

    const account = this.getAccountName(providerId);
    
    try {
      await keytar.setPassword(this.serviceName, account, apiKey);
    } catch (error) {
      // 不记录敏感信息，只记录错误类型
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to store credential for provider "${providerId}": ${errorMessage}`);
    }
  }

  /**
   * 获取 API 密钥
   * @param providerId AI 提供商 ID
   * @returns API 密钥，如果不存在则返回 null
   */
  async getApiKey(providerId: string): Promise<string | null> {
    if (!providerId || typeof providerId !== 'string') {
      throw new Error('Invalid providerId: must be a non-empty string');
    }

    const account = this.getAccountName(providerId);
    
    try {
      const password = await keytar.getPassword(this.serviceName, account);
      return password;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to retrieve credential for provider "${providerId}": ${errorMessage}`);
    }
  }

  /**
   * 删除 API 密钥
   * @param providerId AI 提供商 ID
   * @returns 如果成功删除返回 true，如果凭证不存在返回 false
   */
  async deleteApiKey(providerId: string): Promise<boolean> {
    if (!providerId || typeof providerId !== 'string') {
      throw new Error('Invalid providerId: must be a non-empty string');
    }

    const account = this.getAccountName(providerId);
    
    try {
      const deleted = await keytar.deletePassword(this.serviceName, account);
      return deleted;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to delete credential for provider "${providerId}": ${errorMessage}`);
    }
  }

  /**
   * 检查是否存在 API 密钥
   * @param providerId AI 提供商 ID
   * @returns 如果存在凭证返回 true
   */
  async hasApiKey(providerId: string): Promise<boolean> {
    const apiKey = await this.getApiKey(providerId);
    return apiKey !== null;
  }

  /**
   * 获取所有已存储凭证的提供商 ID 列表
   * @returns 提供商 ID 数组
   */
  async getAllProviderIds(): Promise<string[]> {
    try {
      const credentials = await keytar.findCredentials(this.serviceName);
      return credentials.map(cred => this.extractProviderId(cred.account));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to list credentials: ${errorMessage}`);
    }
  }

  /**
   * 获取所有凭证信息（不包含实际密钥值）
   * @returns 凭证信息数组
   */
  async getCredentialInfos(): Promise<CredentialInfo[]> {
    const providerIds = await this.getAllProviderIds();
    return providerIds.map(providerId => ({
      providerId,
      hasCredential: true
    }));
  }

  /**
   * 批量检查多个提供商的凭证状态
   * @param providerIds 提供商 ID 数组
   * @returns 凭证信息数组
   */
  async checkCredentials(providerIds: string[]): Promise<CredentialInfo[]> {
    const results: CredentialInfo[] = [];
    
    for (const providerId of providerIds) {
      const hasCredential = await this.hasApiKey(providerId);
      results.push({ providerId, hasCredential });
    }
    
    return results;
  }

  /**
   * 清除所有存储的凭证
   * @returns 删除的凭证数量
   */
  async clearAll(): Promise<number> {
    const providerIds = await this.getAllProviderIds();
    let deletedCount = 0;
    
    for (const providerId of providerIds) {
      const deleted = await this.deleteApiKey(providerId);
      if (deleted) {
        deletedCount++;
      }
    }
    
    return deletedCount;
  }

  /**
   * 验证 API 密钥格式（基础验证）
   * @param providerId AI 提供商 ID
   * @param apiKey API 密钥
   * @returns 验证结果
   */
  validateApiKeyFormat(providerId: string, apiKey: string): CredentialResult {
    // OpenAI API 密钥格式验证
    if (providerId.startsWith('openai')) {
      if (!apiKey.startsWith('sk-') || apiKey.length < 20) {
        return {
          success: false,
          error: 'OpenAI API key should start with "sk-" and be at least 20 characters'
        };
      }
    }
    
    // Claude API 密钥格式验证
    if (providerId.startsWith('claude')) {
      if (!apiKey.startsWith('sk-ant-') || apiKey.length < 20) {
        return {
          success: false,
          error: 'Claude API key should start with "sk-ant-" and be at least 20 characters'
        };
      }
    }
    
    // Ollama 本地模型不需要 API 密钥验证
    if (providerId.startsWith('ollama')) {
      return { success: true };
    }
    
    // 通用验证：非空且有一定长度
    if (apiKey.length < 10) {
      return {
        success: false,
        error: 'API key should be at least 10 characters'
      };
    }
    
    return { success: true };
  }

  /**
   * 安全存储 API 密钥（带格式验证）
   * @param providerId AI 提供商 ID
   * @param apiKey API 密钥
   * @returns 存储结果
   */
  async setApiKeySafe(providerId: string, apiKey: string): Promise<CredentialResult> {
    // 格式验证
    const validation = this.validateApiKeyFormat(providerId, apiKey);
    if (!validation.success) {
      return validation;
    }
    
    try {
      await this.setApiKey(providerId, apiKey);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * 生成存储账户名
   * 格式: desktop-pet:{provider_id}
   */
  private getAccountName(providerId: string): string {
    return `${this.serviceName}:${providerId}`;
  }

  /**
   * 从账户名提取提供商 ID
   */
  private extractProviderId(account: string): string {
    const prefix = `${this.serviceName}:`;
    if (account.startsWith(prefix)) {
      return account.slice(prefix.length);
    }
    return account;
  }
}

/**
 * 默认凭证存储实例（单例）
 */
let defaultInstance: CredentialStore | null = null;

/**
 * 获取默认凭证存储实例
 */
export function getCredentialStore(): CredentialStore {
  if (!defaultInstance) {
    defaultInstance = new CredentialStore();
  }
  return defaultInstance;
}

/**
 * 重置默认实例（仅用于测试）
 */
export function resetCredentialStore(): void {
  defaultInstance = null;
}

// 导出默认实例的便捷方法
export const credentialStore = {
  setApiKey: (providerId: string, apiKey: string) => getCredentialStore().setApiKey(providerId, apiKey),
  getApiKey: (providerId: string) => getCredentialStore().getApiKey(providerId),
  deleteApiKey: (providerId: string) => getCredentialStore().deleteApiKey(providerId),
  hasApiKey: (providerId: string) => getCredentialStore().hasApiKey(providerId),
  getAllProviderIds: () => getCredentialStore().getAllProviderIds(),
  getCredentialInfos: () => getCredentialStore().getCredentialInfos(),
  checkCredentials: (providerIds: string[]) => getCredentialStore().checkCredentials(providerIds),
  clearAll: () => getCredentialStore().clearAll(),
  validateApiKeyFormat: (providerId: string, apiKey: string) => 
    getCredentialStore().validateApiKeyFormat(providerId, apiKey),
  setApiKeySafe: (providerId: string, apiKey: string) => 
    getCredentialStore().setApiKeySafe(providerId, apiKey)
};

export default credentialStore;