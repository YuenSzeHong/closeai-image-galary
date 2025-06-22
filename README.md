# CloseAI 图库

一个轻量级的 ChatGPT 图片管理应用，基于 Fresh 框架构建。支持批量导出、多语言界面、团队账户管理等功能。

## 功能特性

- 🖼️ **图片浏览**: 查看所有 ChatGPT 生成的图片，支持分页加载
- 📦 **批量导出**: 一键下载所有图片为 ZIP 文件，包含元数据
- 👥 **团队支持**: 支持 ChatGPT 团队工作区
- 🎨 **现代界面**: 响应式设计，支持深色模式
- ⚡ **高性能**: 基于 Fresh 框架，边缘渲染优化

## 快速开始

### 在线使用

访问部署版本：[CloseAI Image Gallery](https://closeai-image-galary.yuen-network.top/)

### 本地运行

```bash
# 克隆仓库
git clone https://github.com/YuenSzeHong/closeai-image-galary.git
cd closeai-image-galary

# 启动开发服务器
deno task start
```

在浏览器中访问 `http://localhost:8000`

## 使用方法

1. **获取访问令牌**: 在 ChatGPT 网页版中通过开发者工具获取 Authorization 令牌
2. **配置设置**: 在设置页面输入访问令牌和团队 ID（可选）
3. **浏览图片**: 查看所有生成的图片，支持图片详情和元数据
4. **批量导出**: 使用导出功能下载所有图片为 ZIP 文件

## 技术栈

- **框架**: Fresh (Deno) - 现代全栈 Web 框架
- **前端**: Preact + Tailwind CSS + TypeScript
- **状态管理**: Preact Signals
- **特性**: SSR、岛屿架构、边缘优化

## 开发命令

```bash
deno task start      # 开发模式
deno task check      # 代码检查和类型检查
deno task build      # 生产构建
deno task preview    # 预览构建结果
```

## 项目结构

```
├── routes/          # 页面路由和 API 端点
│   ├── api/         # API 路由
│   │   ├── export.ts      # 导出任务管理
│   │   ├── image.ts       # 图片代理服务
│   │   ├── proxy/         # ChatGPT API 代理服务
│   │   └── export/        # 导出文件下载
│   ├── index.tsx          # 主页
│   ├── settings.tsx       # 设置页面
│   └── about.tsx          # 关于页面
├── islands/         # 客户端交互组件
│   ├── ImageGallery.tsx   # 图片画廊
│   ├── ZipExport.tsx      # 导出功能
│   ├── SettingsForm.tsx   # 设置表单
│   ├── TeamSelector.tsx   # 团队选择器
│   └── NotificationManager.tsx # 通知管理
├── components/      # 服务端组件
│   ├── Header.tsx         # 页面头部
│   ├── ImageModal.tsx     # 图片查看模态框
│   └── GalleryItem.tsx    # 图片画廊项目
├── lib/            # 核心库文件
│   └── chatgpt-client.ts  # ChatGPT API 客户端
├── hooks/          # 自定义钩子
│   └── useLocalStorage.ts # 本地存储钩子
├── utils/          # 工具函数
│   ├── chatgpt.ts        # ChatGPT 工具函数
│   └── fileUtils.ts      # 文件处理工具
└── static/         # 静态资源
```

## API 架构

项目使用统一的 ChatGPT API 客户端架构，详见 [API 架构文档](CHATGPT_API_ARCHITECTURE.md)。


## 贡献指南

详细内容请参阅 [CONTRIBUTING.md](CONTRIBUTING.md)

## 授权

MIT License - 详见 [LICENSE](LICENSE) 文件

---

**开发者**: YuenSzeHong | **仓库**: [https://github.com/YuenSzeHong/closeai-image-galary](https://github.com/YuenSzeHong/closeai-image-galary)
