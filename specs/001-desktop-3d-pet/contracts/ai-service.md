# AI Service Contract: 桌面3D小宠物

**Branch**: `001-desktop-3d-pet` | **Date**: 2026-02-08  
**Service Location**: `src/main/services/ai/`

## Overview

AI服务契约定义了与大语言模型交互的接口规范，支持多提供商（OpenAI、Claude、Ollama）和自动降级策略。

---

## Type Definitions

### AIProviderType

```typescript
type AIProviderType = 'openai' | 'claude' | 'ollama' | 'openai_compatible';
```

### MessageRole

```typescript
type MessageRole = 'user' | 'assistant' | 'system' | 'tool';
```

### ChatMessage

```typescript
interface ChatMessage {
  role: MessageRole;
  content: string;
  name?: string;              // 用于工具调用结果
  tool_call_id?: string;      // 工具调用ID
  tool_calls?: ToolCall[];    // 助手发起的工具调用
}
```

### ToolCall

```typescript
interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;  // JSON字符串
  };
}
```

### ToolDefinition

```typescript
interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, {
        type: string;
        description: string;
        enum?: string[];
      }>;
      required?: string[];
    };
  };
}
```

### ChatCompletionOptions

```typescript
interface ChatCompletionOptions {
  model?: string;                    // 覆盖默认模型
  temperature?: number;              // 0-2, 默认 0.7
  max_tokens?: number;               // 默认 2048
  top_p?: number;                    // 0-1, 默认 1
  frequency_penalty?: number;        // -2 to 2, 默认 0
  presence_penalty?: number;         // -2 to 2, 默认 0
  stop?: string[];                   // 停止序列
  tools?: ToolDefinition[];          // 可用工具列表
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  stream?: boolean;                  // 是否流式输出
}
```

### ChatCompletionResult

```typescript
interface ChatCompletionResult {
  id: string;
  message: ChatMessage;
  finish_reason: 'stop' | 'tool_calls' | 'length' | 'content_filter';
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  provider: AIProviderType;
  model: string;
  latency_ms: number;
}
```

### StreamChunk

```typescript
interface StreamChunk {
  id: string;
  delta: {
    role?: MessageRole;
    content?: string;
    tool_calls?: Partial<ToolCall>[];
  };
  finish_reason?: 'stop' | 'tool_calls' | 'length' | 'content_filter';
}
```

### AIServiceError

```typescript
interface AIServiceError {
  code: 'NETWORK_ERROR' | 'AUTH_ERROR' | 'RATE_LIMIT' | 'CONTEXT_LENGTH' | 
        'CONTENT_FILTER' | 'PROVIDER_ERROR' | 'TIMEOUT' | 'NO_PROVIDER';
  message: string;
  provider?: AIProviderType;
  retryable: boolean;
  retryAfter?: number;  // 秒
}
```

---

## IAIService Interface

主AI服务接口，由 `AIService` 类实现。

```typescript
interface IAIService {
  /**
   * 发送聊天完成请求
   * @param messages - 对话历史
   * @param options - 可选参数
   * @returns 完成结果
   * @throws AIServiceError
   */
  chat(
    messages: ChatMessage[], 
    options?: ChatCompletionOptions
  ): Promise<ChatCompletionResult>;

  /**
   * 发送流式聊天请求
   * @param messages - 对话历史
   * @param options - 可选参数
   * @returns 异步生成器，产出流式块
   * @throws AIServiceError
   */
  chatStream(
    messages: ChatMessage[], 
    options?: ChatCompletionOptions
  ): AsyncGenerator<StreamChunk, void, unknown>;

  /**
   * 检查服务可用性
   * @returns 可用提供商列表及其状态
   */
  checkAvailability(): Promise<ProviderStatus[]>;

  /**
   * 获取当前活跃的提供商
   */
  getActiveProvider(): AIProviderConfig | null;

  /**
   * 设置默认提供商
   * @param providerId - 提供商ID
   */
  setDefaultProvider(providerId: string): Promise<void>;

  /**
   * 注册提供商
   * @param config - 提供商配置
   */
  registerProvider(config: AIProviderConfig): Promise<void>;

  /**
   * 移除提供商
   * @param providerId - 提供商ID
   */
  removeProvider(providerId: string): Promise<void>;

  /**
   * 获取所有已注册的提供商
   */
  getProviders(): AIProviderConfig[];
}
```

### ProviderStatus

```typescript
interface ProviderStatus {
  id: string;
  name: string;
  type: AIProviderType;
  available: boolean;
  latency_ms?: number;
  error?: string;
}
```

### AIProviderConfig

```typescript
interface AIProviderConfig {
  id: string;
  name: string;
  type: AIProviderType;
  model: string;
  endpoint?: string;
  isDefault: boolean;
  isEnabled: boolean;
  priority: number;
  settings: {
    temperature?: number;
    max_tokens?: number;
    system_prompt?: string;
    [key: string]: unknown;
  };
}
```

---

## IAIProvider Interface

单个AI提供商的实现接口（内部使用）。

```typescript
interface IAIProvider {
  readonly type: AIProviderType;
  readonly model: string;

  /**
   * 发送聊天请求
   */
  chat(
    messages: ChatMessage[], 
    options: ChatCompletionOptions
  ): Promise<ChatCompletionResult>;

  /**
   * 发送流式聊天请求
   */
  chatStream(
    messages: ChatMessage[], 
    options: ChatCompletionOptions
  ): AsyncGenerator<StreamChunk, void, unknown>;

  /**
   * 测试连接
   */
  testConnection(): Promise<boolean>;

  /**
   * 获取API密钥（从凭证管理器）
   */
  getApiKey(): Promise<string | null>;

  /**
   * 设置API密钥（到凭证管理器）
   */
  setApiKey(key: string): Promise<void>;
}
```

---

## Function Calling Tools

### 预定义工具

#### set_reminder

```typescript
const setReminderTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'set_reminder',
    description: '为用户创建一个提醒',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: '提醒的标题或内容'
        },
        trigger_time: {
          type: 'string',
          description: 'ISO8601格式的触发时间，或相对时间如"in 30 minutes"'
        },
        repeat: {
          type: 'string',
          description: '重复规则',
          enum: ['once', 'daily', 'weekly', 'monthly', 'weekdays']
        }
      },
      required: ['title', 'trigger_time']
    }
  }
};
```

#### get_weather

```typescript
const getWeatherTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'get_weather',
    description: '查询指定城市的天气信息',
    parameters: {
      type: 'object',
      properties: {
        city: {
          type: 'string',
          description: '城市名称，如"北京"、"上海"'
        },
        days: {
          type: 'number',
          description: '预报天数，1-7天'
        }
      },
      required: ['city']
    }
  }
};
```

#### open_application

```typescript
const openApplicationTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'open_application',
    description: '打开系统应用程序',
    parameters: {
      type: 'object',
      properties: {
        app_name: {
          type: 'string',
          description: '应用程序名称，如"记事本"、"Chrome"、"VS Code"'
        }
      },
      required: ['app_name']
    }
  }
};
```

#### create_note

```typescript
const createNoteTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'create_note',
    description: '创建一条笔记',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: '笔记标题'
        },
        content: {
          type: 'string',
          description: '笔记内容'
        }
      },
      required: ['content']
    }
  }
};
```

---

## Degradation Strategy

### 降级流程

```
┌─────────────────────────────────────────────────────────┐
│                    AI Service Request                    │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
            ┌─────────────────────────────┐
            │  Primary Provider (Cloud)   │
            │  (e.g., OpenAI GPT-4)       │
            └─────────────────────────────┘
                           │
              ┌────────────┴────────────┐
              │ Success                 │ Failure
              ▼                         ▼
         [Return Result]    ┌─────────────────────────────┐
                            │  Secondary Provider (Cloud) │
                            │  (e.g., Claude Sonnet)      │
                            └─────────────────────────────┘
                                        │
                           ┌────────────┴────────────┐
                           │ Success                 │ Failure
                           ▼                         ▼
                      [Return Result]   ┌─────────────────────────────┐
                                        │  Local Provider (Ollama)    │
                                        │  (e.g., llama3, mistral)    │
                                        └─────────────────────────────┘
                                                    │
                                       ┌────────────┴────────────┐
                                       │ Success                 │ Failure
                                       ▼                         ▼
                                  [Return Result]   ┌─────────────────────────────┐
                                                    │  Response Cache             │
                                                    │  (Cached similar queries)   │
                                                    └─────────────────────────────┘
                                                                │
                                                   ┌────────────┴────────────┐
                                                   │ Hit                     │ Miss
                                                   ▼                         ▼
                                              [Return Cached]        [Throw Error]
```

### 降级条件

| 条件 | 动作 |
|------|------|
| 网络超时 (>30s) | 切换到下一优先级提供商 |
| HTTP 401/403 | 标记提供商认证失败，切换 |
| HTTP 429 | 等待 Retry-After 或切换 |
| HTTP 500/502/503 | 切换到下一优先级提供商 |
| 连接失败 | 切换到下一优先级提供商 |
| 所有云端失败 | 使用本地 Ollama |
| Ollama 失败 | 查询响应缓存 |
| 缓存未命中 | 返回错误，显示友好提示 |

---

## System Prompt Template

默认系统提示词模板：

```typescript
const DEFAULT_SYSTEM_PROMPT = `你是一只可爱的桌面小宠物，名叫{pet_name}。

性格特点：
- 友好、热情、乐于助人
- 会用可爱的语气说话，偶尔加入表情符号
- 关心主人的工作和生活

能力：
- 可以帮助设置提醒
- 可以查询天气
- 可以帮助打开应用程序
- 可以创建笔记
- 可以进行日常聊天

回复要求：
- 保持简洁，一般不超过100字
- 使用亲切的语气
- 在回复末尾表达你的情绪状态，格式为 [emotion:happy/curious/confused/thinking/excited/sleepy]

当前时间：{current_time}
主人称呼：{user_name}`;
```

---

## Usage Examples

### 基本对话

```typescript
const aiService = container.get<IAIService>(TYPES.AIService);

const messages: ChatMessage[] = [
  { role: 'system', content: systemPrompt },
  { role: 'user', content: '你好，今天感觉怎么样？' }
];

try {
  const result = await aiService.chat(messages, {
    temperature: 0.8,
    max_tokens: 500
  });
  
  console.log(result.message.content);
  // "主人好呀！今天感觉精力充沛呢~ 有什么我可以帮你的吗？😊 [emotion:happy]"
} catch (error) {
  if (error.code === 'NO_PROVIDER') {
    showOfflineMessage();
  }
}
```

### 流式对话

```typescript
const stream = aiService.chatStream(messages, { stream: true });

let fullContent = '';
for await (const chunk of stream) {
  if (chunk.delta.content) {
    fullContent += chunk.delta.content;
    updateChatBubble(fullContent);  // 实时更新UI
  }
  
  if (chunk.finish_reason === 'stop') {
    finalizeChatBubble();
  }
}
```

### 工具调用

```typescript
const messages: ChatMessage[] = [
  { role: 'system', content: systemPrompt },
  { role: 'user', content: '帮我设置一个明天早上9点的会议提醒' }
];

const result = await aiService.chat(messages, {
  tools: [setReminderTool, getWeatherTool, openApplicationTool]
});

if (result.message.tool_calls) {
  for (const toolCall of result.message.tool_calls) {
    if (toolCall.function.name === 'set_reminder') {
      const args = JSON.parse(toolCall.function.arguments);
      const reminder = await reminderService.create(args);
      
      // 发送工具结果
      messages.push(result.message);
      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify({ success: true, reminder_id: reminder.id })
      });
      
      // 获取最终回复
      const finalResult = await aiService.chat(messages);
      console.log(finalResult.message.content);
      // "好的，已经帮你设置好明天早上9点的会议提醒啦~ 到时候会提醒你的！📅 [emotion:happy]"
    }
  }
}
```

---

## Error Handling

```typescript
try {
  const result = await aiService.chat(messages);
} catch (error: AIServiceError) {
  switch (error.code) {
    case 'NO_PROVIDER':
      // 所有提供商都不可用
      showMessage('抱歉，我现在无法思考...请检查网络连接或配置本地AI');
      setPetEmotion('confused');
      break;
      
    case 'TIMEOUT':
      // 请求超时
      showMessage('思考太久了，让我休息一下再试试？');
      setPetEmotion('sleepy');
      break;
      
    case 'RATE_LIMIT':
      // 速率限制
      const retryAfter = error.retryAfter || 60;
      showMessage(`请求太频繁了，${retryAfter}秒后再试试吧~`);
      break;
      
    case 'CONTENT_FILTER':
      // 内容过滤
      showMessage('这个问题我不太方便回答呢...');
      setPetEmotion('confused');
      break;
      
    default:
      showMessage('遇到了一点小问题，稍后再试试吧~');
      setPetEmotion('confused');
  }
}
```

---

## Performance Requirements

| 指标 | 目标 | 说明 |
|------|------|------|
| 首字响应时间 | < 3秒 | 网络正常情况下 |
| 完整响应时间 | < 30秒 | 超时则降级 |
| 降级切换时间 | < 1秒 | 检测失败到切换完成 |
| 缓存查询时间 | < 100ms | 本地缓存查找 |
| 内存占用 | < 50MB | AI服务模块 |