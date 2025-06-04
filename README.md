# CloseAI Image Gallery

一个轻量级的 ChatGPT 图片管理应用，基于 Fresh 框架构建。

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

## 技术栈

- **框架**: Fresh (Deno) - 现代全栈 Web 框架
- **前端**: Preact + Tailwind CSS + TypeScript
- **特性**: SSR、岛屿架构、边缘优化

## 开发

```bash
deno task start      # 开发模式
deno task check      # 代码检查
deno task build      # 生产构建
deno task preview    # 预览构建
```

## 项目结构

```
├── routes/          # 页面路由和API
├── islands/         # 客户端交互组件  
├── components/      # 服务端组件
├── static/          # 静态资源
└── hooks/           # 自定义钩子
```

## 贡献

1. Fork 此仓库
2. 创建功能分支
3. 提交更改
4. 开启 Pull Request

## 授权

MIT License - 详见 [LICENSE](LICENSE) 文件

---

**开发者**: YuenSzeHong | **仓库**: https://github.com/YuenSzeHong/closeai-image-galary
