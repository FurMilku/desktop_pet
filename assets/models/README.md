# 3D 宠物模型资源

## 文件说明

| 文件 | 用途 | 格式 |
|------|------|------|
| `default-pet.glb` | 默认宠物3D模型 | GLTF Binary (GLB) |

## 模型要求

### 技术规格

- **格式**: GLTF 2.0 Binary (.glb)
- **多边形数**: 建议 < 10,000 三角面
- **纹理尺寸**: 建议 512x512 或 1024x1024
- **骨骼绑定**: 需要 Armature/Skeleton 用于动画

### 模型结构

推荐的骨骼层级：
```
Root
├── Hips
│   ├── Spine
│   │   ├── Chest
│   │   │   ├── Head
│   │   │   │   ├── LeftEar (可选)
│   │   │   │   └── RightEar (可选)
│   │   │   ├── LeftShoulder (可选)
│   │   │   └── RightShoulder (可选)
│   ├── LeftLeg
│   │   └── LeftFoot
│   ├── RightLeg
│   │   └── RightFoot
│   └── Tail (可选)
```

### 动画

模型可以内嵌以下动画（也可作为单独文件放在 `assets/animations/`）：

| 动画名称 | 描述 | 循环 |
|----------|------|------|
| idle | 待机/呼吸动画 | ✓ |
| happy | 开心跳跃 | × (3次后回到idle) |
| sad | 难过低头 | ✓ |
| thinking | 思考中 | ✓ |
| confused | 困惑歪头 | × (2次后回到idle) |
| drag | 被拖拽状态 | ✓ |
| listening | 倾听状态 | ✓ |
| celebrating | 庆祝舞蹈 | × (2次后回到happy) |
| sleepy | 打瞌睡 | ✓ |
| curious | 好奇观察 | × (1次后回到idle) |

## 获取免费3D模型

### 推荐来源

1. **Sketchfab** (https://sketchfab.com)
   - 搜索: "cartoon pet rigged" 或 "cute animal rigged"
   - 筛选: Downloadable, Free, Animated

2. **Mixamo** (https://www.mixamo.com)
   - 可为任何人形模型添加动画
   - 支持导出 GLB 格式

3. **Quaternius** (https://quaternius.com)
   - 免费 CC0 许可的低多边形动物模型

4. **Kenney** (https://kenney.nl)
   - 免费游戏资源，包含一些动物模型

5. **OpenGameArt** (https://opengameart.org)
   - 搜索: "animal 3d model"

### 推荐模型示例

- [Cute Dog](https://sketchfab.com/3d-models/cute-dog-cartoon) - 卡通狗
- [Cartoon Cat](https://sketchfab.com/3d-models/cartoon-cat) - 卡通猫
- [Low Poly Shiba](https://sketchfab.com/3d-models/low-poly-shiba) - 柴犬

## 使用 Blender 准备模型

### 导出设置

1. 打开 Blender，加载模型
2. 确保模型有骨骼绑定
3. 文件 → 导出 → glTF 2.0 (.glb/.gltf)
4. 导出设置：
   - 格式: glTF Binary (.glb)
   - ✓ Include: Selected Objects
   - ✓ Transform: +Y Up
   - ✓ Data: Mesh, Armature, Animation
   - ✓ Animation: Export All

### 优化建议

- 合并材质减少 draw calls
- 使用纹理图集
- 删除不必要的骨骼
- 简化网格 (Decimate modifier)

## 临时占位方案

如果暂时没有3D模型，应用会自动使用内置的几何占位符（一个带动画的简单形状）。

要启用占位符模式，确保 `default-pet.glb` 不存在即可。

## 导入自定义模型

1. 将 `.glb` 文件放入 **本目录**（`assets/models/`，不是 `src/assets/models/`）
2. **推荐**重命名为 `default-pet.glb`；也可保留原名（如 `圣羽翼王_包含动画.glb`），应用会加载目录中的第一个 `.glb`
3. 重启应用：`npm run dev`

> **注意**：仅放入目录不会自动生效，必须重启应用。开发模式下应用通过 Vite 提供 `/models/xxx.glb` 路径加载。

### 游戏角色模型（如圣羽翼王）

若模型来自手游/端游导出，通常带有大量**战斗、技能、飞行**动画。应用会自动：

- 优先播放 `Common_Relax`、`dle`、`Ride_Idle` 等待机动作
- **不会**默认播放 `Common_Alert` 或战斗类动画
- 自动缩放、居中并调整相机

若仍显示异常，可在 Blender 中仅导出待机相关动画，或重命名主动画包含 `idle` / `relax`。

**贴图发黑/发白、左右黑白分块**：部分手游 GLB 带有 `COLOR_0` 顶点色遮罩，应用会自动移除。

**贴图花屏、色块错位（如裘卡）**：多材质模型会按 **primitive 分段** 处理 UV（避免眼睛/附件 UV 被整片替换）。UV 大于 1 的图集会启用 **Repeat 包裹**；少数模型才会把 TEXCOORD_1 用作漫反射。控制台可能出现 `RepeatWrapping enabled` 或 `use TEXCOORD_1`。

**完全没有贴图/材质**：应用会从 GLB 内嵌 PNG 直接解码贴图。重启后查看控制台应出现 `Embedded textures bound: 5/5 materials`。若仍为 0/5，请确认 GLB 导出时勾选了「嵌入纹理」。

## 点击动画序列（设置）

在设置窗口中创建的**点击序列**会保存到本目录下的 `click-sequences/` 子文件夹，每个序列为一个 JSON 文件（例如 `click-sequences/my-seq.json`）。应用设置里仅记录当前选用的序列 id 与随机池权重。

若模型带有 `*_Start`、`*_Loop`、`*_End` 三段动画，在设置中点 **合并为序列** 即可生成逐步 JSON（如 Start、Loop、Loop、End）。在 **固定播放序列** 下拉框选中该序列后保存。

## 测试模型

```bash
npm run dev
```

打开开发者工具（Ctrl+Shift+I）查看控制台，应出现 `Pet model loaded successfully`。
若仍显示彩色球体占位符，说明模型未加载成功，请检查文件格式与路径。

## 许可证注意

使用第三方模型时，请确保：
1. 检查模型的许可证条款
2. 遵守归属要求
3. 商业使用需确认许可证允许