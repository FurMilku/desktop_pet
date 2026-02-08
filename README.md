# 桌面3D小宠物 (Desktop 3D Pet)

一个基于 Electron + Three.js 的透明窗口桌面宠物应用，支持 AI 智能对话、工作助手、语音交互和照片换肤功能。

## ✨ 功能特性

### 🎯 MVP (User Story 1)
- **透明窗口3D宠物** - 桌面上显示可爱的3D小宠物，窗口背景透明
- **待机动画** - 宠物播放流畅的待机动画
- **多显示器支持** - 位置记忆功能

### 🖱️ 基础交互 (User Story 2)
- **点击反应** - 点击宠物触发反应动画
- **拖拽移动** - 拖拽宠物改变位置
- **右键菜单** - 快捷功能入口

### 💬 AI智能对话 (User Story 3)
- **自然语言对话** - 与宠物进行智能对话
- **多AI后端支持** - OpenAI / Claude / Ollama (离线)
- **表情联动** - 宠物表情随对话内容变化
- **上下文记忆** - 支持20轮对话上下文

### 🛠️ 工作助手 (User Story 4)
- **智能提醒** - 通过自然语言设置提醒
- **天气查询** - 查询实时天气信息
- **应用启动** - 语音/文字打开应用程序
- **快捷搜索** - 便捷的信息搜索
- **日历管理** - 日程安排助手

### 🎤 语音交互 (User Story 5)
- **语音输入** - 通过语音与宠物对话
- **语音回复** - 宠物通过语音回应

### 📷 照片换肤 (User Story 6)
- **品种识别** - 上传宠物照片自动识别品种
- **3D模型生成** - 基于照片生成定制3D模型

## 🛠️ 技术栈

- **框架**: Electron 28+
- **语言**: TypeScript 5.x
- **3D渲染**: Three.js
- **数据库**: SQLite (better-sqlite3)
- **AI服务**: OpenAI / Claude / Ollama
- **MCP协议**: Model Context Protocol 服务器
- **测试**: Vitest + Playwright

## 📋 系统要求

- **Windows**: 10 或更高版本
- **macOS**: 10.15 或更高版本
- **Linux**: Ubuntu 20.04 或更高版本
- **内存**: 最低 4GB RAM
- **显卡**: 支持 WebGL 2.0

## 🚀 快速开始

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

### 构建应用

```bash
# Windows
npm run build:win

# macOS
npm run build:mac

# Linux
npm run build:linux
```

### 运行测试

```bash
# 单元测试
npm run test

# E2E 测试
npm run test:e2e

# 测试覆盖率
npm run test:coverage
```

## 📁 项目结构

```
src/
├── main/           # Electron 主进程
├── renderer/       # Electron 渲染进程
├── ai/             # AI 功能模块
├── shared/         # 共享代码
├── preload/        # 预加载脚本
└── skills/         # 技能定义

tests/
├── unit/           # 单元测试
├── integration/    # 集成测试
└── e2e/            # E2E 测试

assets/
├── models/         # 3D 模型
├── animations/     # 动画文件
└── icons/          # 图标资源

mcp-servers/        # MCP 服务器实现
```

## ⚙️ 配置

### AI 服务配置

应用支持多种 AI 后端，可在设置面板中配置：

1. **OpenAI** - 需要 API Key
2. **Claude** - 需要 API Key  
3. **Ollama** - 本地运行，支持离线使用

### MCP 服务器

内置 5 个 MCP 服务器：

- `system-tools` - 系统工具
- `reminder` - 提醒服务
- `notes` - 笔记服务
- `weather-api` - 天气查询
- `calendar` - 日历管理

## 🎯 性能目标

| 指标 | 目标值 |
|------|--------|
| 渲染帧率 | 30fps |
| 启动时间 | <5s |
| 交互响应 | <200ms |
| AI首字符响应 | <3s |
| 内存占用(空闲) | <300MB |
| CPU占用(后台) | <5% |

## 📝 开发指南

### 添加新动画

1. 将 `.glb` 动画文件放入 `assets/animations/`
2. 在 `src/renderer/pet/pet-animation.ts` 中注册动画状态
3. 在 `src/shared/types/events.ts` 中添加对应事件类型

### 添加新技能

1. 在 `src/skills/` 下创建技能目录
2. 创建 `meta.json` 定义技能元数据
3. 创建 `skill.md` 编写技能指令
4. 在 Skills Manager 中注册

### 添加新 MCP 服务器

1. 在 `mcp-servers/` 下创建服务器目录
2. 实现 MCP 协议接口
3. 在 MCP Manager 中注册

## 🐛 故障排除

### 窗口不透明

- 检查显卡驱动是否支持透明窗口
- 尝试更新 Electron 版本

### AI 对话无响应

- 检查 API Key 配置
- 检查网络连接
- 尝试使用 Ollama 离线模式

### 性能问题

- 检查是否有其他高 GPU 占用程序
- 降低渲染质量设置
- 关闭不必要的动画效果

## 📄 许可证

MIT License

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

Made with ❤️ by Desktop Pet Team