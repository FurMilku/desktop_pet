# 桌面3D小宠物 - 快速入门指南

## 目录

- [开发环境要求](#开发环境要求)
- [项目设置](#项目设置)
- [基本使用](#基本使用)
- [用户故事测试场景](#用户故事测试场景)
- [集成测试指南](#集成测试指南)
- [常见问题](#常见问题)

---

## 开发环境要求

### 系统要求

- **操作系统**: Windows 10+ / macOS 10.15+ / Linux (Ubuntu 20.04+)
- **Node.js**: 18.x LTS 或更高版本
- **pnpm**: 8.x 或更高版本（推荐）
- **Git**: 2.x

### 硬件要求

- **GPU**: 支持 WebGL 2.0
- **内存**: 最低 4GB RAM
- **存储**: 500MB 可用空间

### 可选依赖

- **Python 3.x**: 某些原生模块编译可能需要
- **Visual Studio Build Tools** (Windows): better-sqlite3 编译需要

---

## 项目设置

### 1. 克隆项目

```bash
git clone <repository-url>
cd desktop-3d-pet
```

### 2. 安装依赖

```bash
# 使用 pnpm（推荐）
pnpm install

# 或使用 npm
npm install
```

### 3. 环境配置

创建 `.env.local` 文件：

```env
# AI Provider API Keys (可选，用于AI功能)
OPENAI_API_KEY=your_openai_key
AZURE_OPENAI_KEY=your_azure_key
AZURE_OPENAI_ENDPOINT=your_azure_endpoint

# 其他配置
LOG_LEVEL=info
SENTRY_DSN=your_sentry_dsn  # 可选，用于错误追踪
```

### 4. 启动开发服务器

```bash
# 开发模式
pnpm dev

# 或
npm run dev
```

### 5. 构建生产版本

```bash
# 构建
pnpm build

# 打包
pnpm package
```

---

## 基本使用

### 启动应用

启动后，桌面上会出现一个透明窗口，显示3D小宠物。

### 基础交互

| 操作 | 效果 |
|------|------|
| 左键单击宠物 | 显示快捷菜单 |
| 左键拖拽宠物 | 移动宠物位置 |
| 右键单击 | 打开设置菜单 |
| 鼠标悬停 | 宠物做出反应动画 |
| 双击宠物 | 打开对话窗口 |

### 系统托盘

- 左键单击托盘图标：显示/隐藏宠物
- 右键单击托盘图标：打开托盘菜单

### 键盘快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+Shift+P` | 显示/隐藏宠物 |
| `Ctrl+Shift+C` | 打开对话窗口 |
| `Esc` | 关闭当前窗口 |

---

## 用户故事测试场景

### US1: 透明窗口3D宠物显示 (P1)

**场景 1.1: 首次启动**
```
前置条件: 首次安装应用
操作步骤:
  1. 启动应用
  2. 观察桌面
预期结果:
  - 透明窗口出现在桌面
  - 3D宠物模型正确渲染
  - 窗口可穿透点击（除宠物区域）
  - 渲染帧率 ≥ 30fps
验收标准: 宠物显示清晰，无闪烁，背景完全透明
```

**场景 1.2: 跨显示器移动**
```
前置条件: 多显示器环境
操作步骤:
  1. 拖拽宠物到另一个显示器
  2. 释放宠物
预期结果:
  - 宠物在新显示器正确显示
  - 位置被保存
  - 重启后位置保持
```

**场景 1.3: 系统托盘功能**
```
操作步骤:
  1. 右键点击系统托盘图标
  2. 选择"隐藏宠物"
  3. 再次右键选择"显示宠物"
预期结果:
  - 宠物可隐藏/显示
  - 托盘菜单响应正常
```

### US2: 基础交互 (P2)

**场景 2.1: 拖拽移动**
```
操作步骤:
  1. 按住鼠标左键在宠物上
  2. 拖动鼠标
  3. 释放鼠标
预期结果:
  - 宠物跟随鼠标移动
  - 播放拖拽动画（drag state）
  - 松开后回到idle状态
  - 移动响应延迟 < 100ms
```

**场景 2.2: 动画状态切换**
```
操作步骤:
  1. 让宠物空闲一段时间
  2. 观察动画变化
预期结果:
  - idle → sleepy 过渡自然
  - 各状态动画流畅
  - 支持的状态: idle, thinking, happy, sad, confused, drag, 
                listening, celebrating, sleepy, curious
```

**场景 2.3: 鼠标悬停反应**
```
操作步骤:
  1. 将鼠标移到宠物上
  2. 保持3秒
  3. 移开鼠标
预期结果:
  - 宠物切换到curious状态
  - 做出互动反应
  - 移开后恢复之前状态
```

### US3: AI智能对话 (P3)

**场景 3.1: 基础对话**
```
前置条件: 已配置AI Provider
操作步骤:
  1. 双击宠物打开对话窗口
  2. 输入"你好"
  3. 等待回复
预期结果:
  - 对话窗口正确显示
  - 宠物进入thinking状态
  - AI首字符响应 < 3秒
  - 回复内容流式显示
  - 完成后宠物进入happy状态
```

**场景 3.2: 对话记忆**
```
操作步骤:
  1. 告诉宠物你的名字
  2. 关闭对话窗口
  3. 重新打开对话
  4. 询问"你记得我叫什么吗？"
预期结果:
  - 宠物记住之前的对话内容
  - 正确回答名字
  - 对话历史持久保存（SQLite）
```

**场景 3.3: AI Provider切换**
```
前置条件: 配置多个AI Provider
操作步骤:
  1. 打开设置
  2. 切换AI Provider
  3. 发起新对话
预期结果:
  - Provider切换即时生效
  - 新对话使用新Provider
  - 切换过程无错误
```

### US4: 工作助手功能 (P4)

**场景 4.1: 创建提醒**
```
操作步骤:
  1. 对宠物说"提醒我5分钟后喝水"
  2. 等待5分钟
预期结果:
  - 宠物确认创建提醒
  - 5分钟后系统通知弹出
  - 宠物做出提醒动画（celebrating）
```

**场景 4.2: MCP工具调用**
```
操作步骤:
  1. 问宠物"今天天气怎么样？"
预期结果:
  - 宠物调用weather-api MCP服务
  - 返回天气信息
  - 响应时间 < 5秒
```

**场景 4.3: 技能触发**
```
操作步骤:
  1. 对宠物说"打开计算器"
预期结果:
  - app-launcher技能被触发
  - 计算器应用启动
  - 宠物确认操作完成
```

### US5: 语音交互 (P5)

**场景 5.1: 语音输入**
```
操作步骤:
  1. 点击语音输入按钮
  2. 说"你好"
  3. 等待识别
预期结果:
  - 宠物进入listening状态
  - 语音被正确识别
  - 显示识别文本
  - AI响应语音输入
```

**场景 5.2: 语音输出**
```
前置条件: 开启TTS功能
操作步骤:
  1. 发送消息给宠物
  2. 等待回复
预期结果:
  - 回复文本被朗读
  - 宠物口型动画同步
  - 可随时停止语音
```

### US6: 照片换肤 (P6)

**场景 6.1: 导入照片**
```
操作步骤:
  1. 打开皮肤设置
  2. 选择"从照片创建"
  3. 选择一张宠物照片
  4. 确认创建
预期结果:
  - 照片被处理生成纹理
  - 新皮肤出现在列表中
  - 处理时间 < 30秒
```

**场景 6.2: 切换皮肤**
```
操作步骤:
  1. 打开皮肤列表
  2. 选择不同皮肤
  3. 点击应用
预期结果:
  - 宠物外观即时更新
  - 动画继续正常播放
  - 切换时间 < 500ms
```

---

## 集成测试指南

### 测试框架

- **单元测试**: Vitest
- **E2E测试**: Playwright
- **覆盖率工具**: @vitest/coverage-v8

### 测试目录结构

```
tests/
├── unit/                    # 单元测试
│   ├── ai/
│   │   ├── event-bus.test.ts
│   │   ├── capability-manager.test.ts
│   │   └── providers/
│   ├── main/
│   │   ├── services/
│   │   └── ipc/
│   └── renderer/
│       └── components/
├── integration/             # 集成测试
│   ├── ai-integration.test.ts
│   ├── ipc-bridge.test.ts
│   ├── mcp-servers.test.ts
│   └── database.test.ts
├── e2e/                     # 端到端测试
│   ├── pet-window.spec.ts
│   ├── interaction.spec.ts
│   ├── ai-chat.spec.ts
│   └── settings.spec.ts
└── fixtures/                # 测试数据
    ├── mock-ai-responses.json
    ├── test-pet-models/
    └── test-skins/
```

### 运行测试

```bash
# 运行所有单元测试
pnpm test

# 运行特定测试文件
pnpm test tests/unit/ai/event-bus.test.ts

# 运行集成测试
pnpm test:integration

# 运行E2E测试
pnpm test:e2e

# 生成覆盖率报告
pnpm test:coverage
```

### 测试覆盖率目标

| 类型 | 目标覆盖率 |
|------|-----------|
| 单元测试 | ≥ 80% |
| 集成测试 | ≥ 60% |
| E2E测试 | 核心流程100% |

### Mock 配置

**AI Provider Mock**
```typescript
// tests/mocks/ai-provider.ts
export const mockAIProvider: IAIProvider = {
  id: 'mock-provider',
  name: 'Mock AI',
  async chat(messages, options) {
    return {
      content: 'Mock response',
      usage: { prompt: 10, completion: 5 }
    };
  },
  async *chatStream(messages, options) {
    yield { content: 'Mock ', done: false };
    yield { content: 'response', done: true };
  }
};
```

**IPC Mock**
```typescript
// tests/mocks/ipc-bridge.ts
export const mockIpcRenderer = {
  invoke: vi.fn(),
  on: vi.fn(),
  off: vi.fn()
};
```

### E2E测试示例

```typescript
// tests/e2e/pet-window.spec.ts
import { test, expect, _electron } from '@playwright/test';

test.describe('Pet Window', () => {
  let app;
  
  test.beforeAll(async () => {
    app = await _electron.launch({ args: ['dist/main/index.js'] });
  });
  
  test.afterAll(async () => {
    await app.close();
  });
  
  test('should display pet on startup', async () => {
    const window = await app.firstWindow();
    
    // 等待宠物渲染
    await window.waitForSelector('#pet-canvas');
    
    // 验证透明窗口
    const isTransparent = await window.evaluate(() => {
      return document.body.style.background === 'transparent';
    });
    expect(isTransparent).toBe(true);
  });
  
  test('should respond to mouse drag', async () => {
    const window = await app.firstWindow();
    const canvas = await window.$('#pet-canvas');
    
    const box = await canvas.boundingBox();
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;
    
    await window.mouse.move(startX, startY);
    await window.mouse.down();
    await window.mouse.move(startX + 100, startY + 100);
    await window.mouse.up();
    
    // 验证宠物状态变化
    const state = await window.evaluate(() => {
      return window.petState;
    });
    expect(state).toBe('idle'); // drag后回到idle
  });
});
```

---

## 常见问题

### Q: better-sqlite3 编译失败

常见原因与处理方式：

1. **Node 22 + 旧版 better-sqlite3（无预编译包）**  
   项目已锁定 `better-sqlite3@^11.9.1`，请删除 `node_modules` 后重新 `npm install`。

2. **Electron 28 与 better-sqlite3 12.x 不兼容**  
   v12 已移除 Electron ABI v119 的预编译包；在升级 Electron 至 29+ 之前请保持 v11.x。

3. **Python 3.12+ 报 `No module named 'distutils'`**  
   node-gyp 从源码编译时需要 setuptools：
   ```bash
   pip install setuptools
   ```
   或安装 [Python 3.11](https://www.python.org/downloads/) 并设置 `npm config set python "C:\Path\To\python311\python.exe"`。

**Windows（仍需从源码编译时）:**
```bash
# 安装 Visual Studio 2022，勾选「使用 C++ 的桌面开发」
# 或运行: npm install -g windows-build-tools  (旧方式，不推荐)
```

**macOS:**
```bash
xcode-select --install
```

### Q: WebGL 不可用

确保：
1. GPU 驱动已更新
2. 浏览器/Electron 未禁用 GPU 加速
3. 检查 `chrome://gpu` 页面

### Q: AI功能不响应

1. 检查 API Key 配置
2. 检查网络连接
3. 查看日志文件: `userData/logs/`

### Q: 内存占用过高

1. 检查3D模型复杂度
2. 减少动画帧率
3. 关闭不必要的 MCP 服务

---

## 相关文档

- [功能规格](./spec.md)
- [实现计划](./plan.md)
- [数据模型](./data-model.md)
- [IPC API 契约](./contracts/ipc-api.md)
- [事件总线契约](./contracts/event-bus.md)
- [技术研究](./research.md)