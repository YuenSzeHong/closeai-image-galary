# CloseAI Image Gallery

CloseAI Image Gallery 是一个轻量级应用程序，可协助你查看并管理所有通过 ChatGPT 生成的图片。它提供了一个简洁的界面，让用户能够以画廊形式浏览所有生成的图片，而无需不断回到 ChatGPT 聊天界面寻找。

![CloseAI Image Gallery 截图](https://example.com/screenshot.png)

## 功能特点

- 🖼️ 以画廊形式显示所有 ChatGPT 生成的图片
- 🌐 通过代理请求确保全球访问图片内容
- 🔒 本地存储 API 令牌，不经由任何第三方服务器
- 📱 全响应式设计，适用于桌面和移动设备
- ⚡ 分批加载功能，支持高效能浏览大量图片
- 💾 一键下载原始图片
- 🔍 点击查看全尺寸图片与详细信息
- 🏝️ 基于岛屿架构，实现最优性能
- 👥 支持多团队工作区管理
- 🗄️ 智能本地缓存，提升加载速度
- 🧹 灵活的数据管理功能

## 安装与使用

### 方法一：使用 Deno Deploy (推荐)

最简单的方式是访问我们预先部署的版本：

[CloseAI Image Gallery](https://closeai-image-galary.yuen-network.top/)

### 方法二：本地运行

1. 安装 [Deno](https://deno.land/manual/getting_started/installation)
2. 克隆此仓库

   ```bash
   git clone https://github.com/yourusername/closeai-image-galary.git
   cd closeai-image-galary
   ```

3. 启动开发服务器

   ```bash
   deno task start
   ```

4. 在浏览器中访问 `http://localhost:8000`

### 生产构建

```bash
deno task build
deno task preview
```

## 如何获取 ChatGPT API Token

为了访问你的 ChatGPT 生成图片，你需要提供你的 API Token。请按照以下步骤获取：

1. 登录 [ChatGPT](https://chatgpt.com)
2. 打开浏览器开发者工具 (F12 或右键 > 检查)
3. 切换至「Network」(网络) 标签页
4. 重新刷新页面
5. 寻找任何对 ChatGPT API 的请求
6. 在请求标头中找到「Authorization」
7. 复制这个 token（它以 "Bearer " 开头）

## 技术架构

- **框架**: [Fresh](https://fresh.deno.dev/) - 基于 Deno 的现代全栈 Web 框架
- **运行时**: [Deno](https://deno.land/) - 现代的 JavaScript/TypeScript 运行时
- **前端**:
  - [Preact](https://preactjs.com/) - 轻量级 React 替代方案
  - [Tailwind CSS](https://tailwindcss.com/) - 用于快速 UI 开发的实用优先 CSS 框架
  - TypeScript - 类型安全的 JavaScript
- **特性**:
  - 服务端渲染 (SSR)
  - 岛屿架构 (Islands Architecture)
  - 零配置开发体验
  - 边缘优化的性能
- **API 集成**:
  - 使用 ChatGPT API 获取图片
  - 图片代理以确保全球访问

## 开发指南

### 可用命令

```bash
# 开发模式（带热重载）
deno task start

# 代码检查和格式化
deno task check

# 生成 Fresh 清单文件
deno task manifest

# 构建生产版本
deno task build

# 预览生产版本
deno task preview

# 更新 Fresh 框架
deno task update
```

### 项目结构

```txt
├── routes/          # 页面路由
├── islands/         # 客户端交互组件
├── components/      # 服务端组件
├── static/          # 静态资源
├── fresh.gen.ts     # 自动生成的清单文件
└── fresh.config.ts  # Fresh 配置文件
```

## 注意事项

- API Token 仅存储在你的浏览器本机存储中，不会发送至我们的服务器
- 本应用程序仅提供对你已生成图片的访问，不会生成新图片
- 图片展示依赖于 ChatGPT 的 API，如 API 变更可能会影响功能

## 隐私与安全

- 所有的 API 请求都是从你的浏览器直接发送到 ChatGPT API
- 我们的服务器仅作为图片的代理，不储存任何图片内容或个人数据
- API Token 只在你的浏览器本地储存，我们没有访问权限

## 贡献

欢迎提交 Pull Requests 或开 Issues 来改进此项目！

### 开发流程

1. Fork 此仓库
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add some amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 开启 Pull Request

## 授权

MIT License - 详见 [LICENSE](LICENSE) 文件
