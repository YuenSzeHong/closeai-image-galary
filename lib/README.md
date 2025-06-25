# ChatGPT API 客户端库

此目录包含经过提取和重构的 ChatGPT API 客户端库。

## 结构

### 核心库 (`lib/chatgpt-client.ts`)

- **`ChatGPTClient`** - 具有完整 API 功能的主客户端类
- **`createChatGPTClient(config)`** - 用于创建客户端实例的工厂函数
- **错误处理** - 使用 `ChatGPTApiError` 类
- **类型定义** - 所有 API 响应和请求的类型定义

### 实用工具包装器

#### `utils/chatgpt.ts` - 简单的高级实用工具

- `fetchChatGPTImages()` - 带有合理默认值的简单图像获取
- `getChatGPTTeams()` - 获取可用的团队/账户
- `validateChatGPTToken()` - 验证访问令牌

#### `utils/chatgptApi.ts` - 向后兼容包装器

- 现在委托给新客户端的遗留函数
- 为现有代码维护现有 API 接口
- **已弃用** - 直接使用新客户端

## 使用示例

### 基本用法（推荐）

```typescript
import { createChatGPTClient } from "../lib/chatgpt-client.ts";

const client = createChatGPTClient({
  accessToken: "your-token-here",
  teamId: "optional-team-id",
});

// 获取图像
const images = await client.fetchAllImageMetadata();

// 获取团队
const teams = await client.fetchTeamList();
```

### 简单实用工具

```typescript
import { fetchChatGPTImages, getChatGPTTeams } from "../utils/chatgpt.ts";

// 简单图像获取
const images = await fetchChatGPTImages("your-token", {
  maxImages: 100,
  onProgress: (progress) => console.log(progress),
});

// 获取团队
const teams = await getChatGPTTeams("your-token");
```

### 遗留代码（现有）

```typescript
import { fetchImageBatch, fetchTeamList } from "../utils/chatgptApi.ts";

// 这些仍然有效但已弃用
const batch = await fetchImageBatch("token", { limit: 100 });
const teams = await fetchTeamList("token");
```

### UI 组件集成

#### 直接客户端使用

前端组件现在直接使用客户端库，消除了不必要的 API 往返：

- **`components/TeamSelector.tsx`** - 直接调用 `client.fetchTeamList()`
- **`islands/ImageGallery.tsx`** - 直接调用 `client.fetchImageBatch()`

这种方法提供了：

- 更好的性能（减少网络往返）
- 简化的错误处理
- 更直接的数据流

## 功能特性

- **类型安全** - 完整的 TypeScript 支持，具有正确的类型
- **错误处理** - 全面的错误处理，具有特定的错误类型
- **速率限制** - 内置的 API 速率限制处理
- **进度报告** - 长时间操作的可选进度回调
- **团队支持** - 完全支持 ChatGPT 团队/工作区
- **灵活配置** - 可配置的超时、用户代理等

## 迁移说明

新库提供与旧实现相同的功能，但具有：

- 更好的错误处理和重试逻辑
- 使用类的更清洁的 API 设计
- 更全面的 TypeScript 类型
- 消除代码重复
- 更好的关注点分离

现有代码通过 `utils/chatgptApi.ts` 中的向后兼容包装器继续工作。
