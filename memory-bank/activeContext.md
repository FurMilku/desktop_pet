# 活动上下文

## 当前工作焦点

### 主要任务
创建桌面3D小宠物可行性报告，包含AI大模型对接和工作助手功能。

### 最新完成
1. ✅ 完成可行性报告主体（docs/feasibility-report.md）
2. ✅ 添加AI大模型接口对接方案（第8章）
3. ✅ 添加工作助手功能设计（第9章）
4. ✅ 更新项目简介（memory-bank/projectbrief.md）
5. ✅ 更新技术上下文（memory-bank/techContext.md）

## 近期变更

### 2026-02-08
- 根据用户反馈扩展可行性报告
- 用户原话："宠物是第一步，我希望这个宠物对接AI 大模型接口，可以不支持一个小宠物，还承担其工作助手的功能"
- 新增AI大模型对接方案，包括：
  - AIProvider抽象接口设计
  - OpenAI/Claude/Ollama多模型支持
  - 对话上下文管理
  - 流式响应处理
- 新增工作助手功能，包括：
  - Function Calling工具系统
  - 日程管理、提醒、笔记、搜索等功能
  - 语音交互（STT/TTS）
  - 宠物动画联动

## 下一步计划

### 立即执行
1. 更新 memory-bank/progress.md 记录项目进度
2. 完成所有Memory Bank文件更新

### 后续任务
1. 等待用户审阅可行性报告
2. 根据用户反馈调整方案
3. 准备进入开发阶段

## 活动决策和考虑

### 技术选型决策
- **推荐方案**: Electron + Three.js + LLM API
- **AI模型**: 优先支持OpenAI API，同时支持本地Ollama
- **语音方案**: Web Speech API作为基础，可选Whisper/Edge TTS

### 架构考虑
- AI功能作为独立层（AI智能层）设计
- 使用Provider模式实现多模型切换
- Function Calling实现工具调用
- 本地知识库使用ChromaDB/LanceDB

## 重要模式和偏好

### 代码风格
- TypeScript强类型
- 接口优先设计（AIProvider, ToolExecutor等）
- 异步流式处理（AsyncGenerator）

### 项目结构
```
src/
├── main/           # Electron主进程
├── renderer/       # 渲染进程
├── pet/            # 宠物系统
├── ai/             # AI智能层
│   ├── providers/  # LLM提供商
│   ├── tools/      # 工具系统
│   └── voice/      # 语音交互
└── shared/         # 共享代码
```

## 学习和项目洞察

### 关键发现
1. Electron透明窗口需要特定配置组合才能正常工作
2. Three.js在透明背景下需要设置alpha: true
3. AI大模型的Function Calling是实现工作助手的关键技术
4. 本地LLM（Ollama）可以满足离线和隐私需求

### 风险识别
1. API成本可能较高（需要合理的缓存和Token管理）
2. 语音识别准确率受环境影响
3. 本地LLM性能依赖硬件配置