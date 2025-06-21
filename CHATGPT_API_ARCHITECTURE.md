# ChatGPT API 集成架构

## 概述

本项目已经重构，将 ChatGPT API 调用提取到一个清洁、集中的库结构中。架构遵循以下原则：

- **集中式 API 客户端** 在 `lib/chatgpt-client.ts`
- **向后兼容** 通过 `utils/chatgptApi.ts`
- **清洁的 API 路由** 无重复
- **简单实用工具** 用于常见用例

## 库结构

### 核心库 (`lib/chatgpt-client.ts`)

- **`ChatGPTClient`** - 主 API 客户端类
- **`createChatGPTClient(config)`** - 工厂函数
- **类型定义** - 所有接口和类型
- **错误处理** - `ChatGPTApiError` 类

### 兼容层 (`utils/chatgptApi.ts`)

- **遗留函数包装器** 用于向后兼容
- **重新导出** 核心库中的所有类型和类
- **弃用通知** 指导迁移

### 简单实用工具 (`utils/chatgpt.ts`)

- **`fetchChatGPTImages()`** - 带有默认值的简单图像获取
- **`getChatGPTTeams()`** - 获取用户的团队/账户
- **`validateChatGPTToken()`** - 令牌验证

## API 路由

应用程序使用这些基本的 API 路由：

### 1. `/api/proxy/[...path]` - 统一 ChatGPT 后端代理

- 代理所有 ChatGPT backend-api 调用
- 处理认证、团队 ID 和错误处理
- 使用者：`ChatGPTClient` 类

### 2. `/api/export` - 导出任务管理

- 启动批量下载的导出任务
- 为进度更新提供 SSE 流
- 使用者：`ZipExport.tsx`

### 3. `/api/export/[taskId]` - 文件下载

### 3. `/api/export/[taskId]` - 文件下载

- 下载生成的 ZIP 文件
- 处理大文件流和缓存
- 使用者：导出下载链接

### 4. `/api/image` - 图像代理

- 代理 ChatGPT 图像 URL 以避免 CORS 问题
- 添加缓存头
- 使用者：`ImageGallery.tsx` 用于图像显示

### 5. `/api/proxy/[...path]` - ChatGPT 后端 API 代理

- 统一的 ChatGPT 后端 API 代理，处理所有 `/backend-api/` 路径
- 自动添加认证头和团队 ID
- 使用者：`lib/chatgpt-client.ts` 的核心客户端

## 使用示例

### 使用新的客户端库

```typescript
import { createChatGPTClient } from "../lib/chatgpt-client.ts";

// 创建客户端
const client = createChatGPTClient({
  accessToken: "your-token",
  teamId: "optional-team-id",
});

// 获取图像
const images = await client.fetchAllImageMetadata({
  maxBatches: 10,
  onProgress: (progress) => console.log(progress),
});

// 获取团队
const teams = await client.fetchTeamList();
```

### 使用简单实用工具

```typescript
import { fetchChatGPTImages, getChatGPTTeams } from "../utils/chatgpt.ts";

// 简单图像获取
const images = await fetchChatGPTImages("your-token", {
  teamId: "optional-team-id",
  maxImages: 100,
});

// 获取团队
const teams = await getChatGPTTeams("your-token");
```

### 遗留用法（仍然支持）

```typescript
import { fetchImageBatch, fetchTeamList } from "../utils/chatgptApi.ts";

// 这些仍然有效但已弃用
const batch = await fetchImageBatch("token", { limit: 100 });
const teams = await fetchTeamList("token");
```

## 优点

1. **无代码重复** - API 逻辑的单一真实来源
2. **类型安全** - 全面的 TypeScript 类型
3. **错误处理** - 集中式错误管理，具有特定的错误类型
4. **速率限制** - 内置重试逻辑和退避
5. **测试** - 更容易模拟和测试集中式客户端
6. **可维护性** - 更改只需要在一个地方进行

## 迁移指南

如果您有使用旧 `utils/chatgptApi.ts` 函数的现有代码：

1. **对于新代码**：使用 `lib/chatgpt-client.ts` 中的 `createChatGPTClient()`
2. **对于简单用例**：使用 `utils/chatgpt.ts` 中的实用工具
3. **对于现有代码**：无需更改 - 旧函数仍然有效

## 修改的文件

- ✅ **已创建**：`lib/chatgpt-client.ts` - 新的集中式客户端
- ✅ **已更新**：`utils/chatgptApi.ts` - 现在是兼容包装器
- ✅ **已创建**：`utils/chatgpt.ts` - 简单实用工具
- ✅ **已清理**：`routes/api/teams.ts` - 移除重复实现
- ✅ **已清理**：`routes/api/export/[taskId].ts` - 移除重复接口
- ✅ **已更新**：`routes/api/export.ts` - 使用新的客户端库

架构现在是清洁的、可维护的，并遵循最佳实践，同时保留了所有现有功能。
