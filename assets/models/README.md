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

## 测试模型

将模型文件放入此目录后，可以通过以下方式测试：

```bash
# 启动应用
npm run dev

# 应用会自动加载 assets/models/default-pet.glb
```

## 许可证注意

使用第三方模型时，请确保：
1. 检查模型的许可证条款
2. 遵守归属要求
3. 商业使用需确认许可证允许