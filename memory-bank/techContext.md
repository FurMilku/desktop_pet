# 技术上下文

## 推荐技术栈

### 核心框架
- **Electron v28+** - 桌面应用框架
- **Three.js r160+** - 3D渲染引擎
- **TypeScript** - 编程语言

### 前端技术
- **Vue 3** 或 **React 18** - UI框架
- **Vite** - 构建工具
- **pnpm** - 包管理器

### 3D相关
- **GLTF/GLB** - 3D模型格式
- **GSAP** - 动画库
- **Cannon-es** - 物理引擎

### 图生3D技术栈（新增）

#### 3D模型生成
- **TripoSR** - 本地图生3D，MIT开源，2秒内生成
- **Meshy API** - 云端高质量生成，支持PBR材质
- **Stable Zero123** - 单图多视角生成（可选）

#### 骨骼与动画
- **预制骨骼模板** - 四足/爬行/鸟类骨骼库
- **网格变形算法** - 骨骼自动适配不同体型
- **IK求解器** - 逆向运动学，自然姿态

#### 品种识别与分类
- **TensorFlow.js** - 浏览器端机器学习
- **MobileNet V3** - 轻量级图像分类模型
- **Stanford Dogs Dataset** - 狗品种训练数据（120类）
- **Oxford-IIIT Pet Dataset** - 猫狗品种数据集（37类）

#### 纹理处理
- **颜色提取算法** - K-Means聚类提取主色调
- **程序化纹理生成** - 花纹、斑点、条纹图案
- **纹理迁移** - 照片颜色映射到3D模型UV

### AI 大模型技术栈（新增）

#### LLM 接口
- **OpenAI API** - GPT-4o/GPT-4-turbo，支持Function Calling
- **Claude API** - Claude 3.5 Sonnet，优秀的代码理解能力
- **本地LLM (Ollama)** - Llama3.1/Qwen2.5，隐私敏感场景

#### 语音交互
- **Web Speech API** - 浏览器原生STT/TTS，零成本
- **Whisper API** - OpenAI高精度语音识别
- **Edge TTS** - 微软免费TTS服务，音质优秀
- **Azure Speech Services** - 企业级语音服务（可选）

#### 知识库与RAG
- **ChromaDB** - 本地向量数据库，轻量级
- **LanceDB** - 高性能嵌入式向量数据库
- **OpenAI Embeddings** - 文本向量化
- **sentence-transformers** - 本地嵌入模型

#### AI开发框架
- **LangChain.js** - LLM应用开发框架
- **LlamaIndex** - 数据索引和检索框架
- **Vercel AI SDK** - 流式响应处理

#### 工作助手工具
- **node-ical** - 日历解析
- **googleapis** - Google服务集成
- **@microsoft/microsoft-graph-client** - Microsoft 365集成
- **nodemailer** - 邮件发送

#### 图生3D处理工具
- **sharp** - 图像预处理（裁剪、缩放、格式转换）
- **@mediapipe/pose** - 姿态检测（可选）
- **onnxruntime-node** - ONNX模型推理

## 开发环境
- Windows 11 (主要开发平台)
- macOS (次要开发平台)
- Node.js 20+
- VS Code
- Ollama (本地LLM运行环境)

## 技术约束
1. 需要支持透明窗口
2. 需要较低的内存占用（基础功能 < 200MB）
3. 需要良好的跨平台兼容性
4. AI功能需支持离线模式（本地LLM）
5. API密钥需安全存储（electron-store + 加密）
6. 语音交互需考虑隐私保护
7. 图生3D需支持离线模式（TripoSR本地推理）（新增）
8. 模型生成需控制在30秒内完成（新增）
9. 生成的3D模型需小于5MB便于存储（新增）

## 依赖项
```json
{
  "electron": "^28.0.0",
  "three": "^0.160.0",
  "typescript": "^5.0.0",
  "vite": "^5.0.0",
  "openai": "^4.0.0",
  "@anthropic-ai/sdk": "^0.20.0",
  "langchain": "^0.1.0",
  "chromadb": "^1.8.0",
  "electron-store": "^8.0.0",
  "@vercel/ai": "^3.0.0",
  "@tensorflow/tfjs-node": "^4.0.0",
  "sharp": "^0.33.0",
  "onnxruntime-node": "^1.17.0"
}
```

## 图生3D API配置
```json
{
  "triposr": {
    "modelPath": "./models/triposr",
    "device": "cuda",
    "outputFormat": "glb"
  },
  "meshy": {
    "apiKey": "env:MESHY_API_KEY",
    "endpoint": "https://api.meshy.ai/v1",
    "quality": "high"
  }
}
