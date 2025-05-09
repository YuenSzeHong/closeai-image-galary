# CloseAI Image Gallery

CloseAI Image Gallery 是一個輕量級應用程式，可協助你查看並管理所有透過 ChatGPT 生成的圖片。它提供了一個簡潔的介面，讓使用者能夠以畫廊形式瀏覽所有生成的圖片，而無需不斷回到 ChatGPT 聊天界面尋找。

![CloseAI Image Gallery 截圖](https://example.com/screenshot.png)

## 功能特點

- 🖼️ 以畫廊形式顯示所有 ChatGPT 生成的圖片
- 🌐 透過代理請求確保全球存取圖片內容
- 🔒 本地存儲 API 令牌，不經由任何第三方伺服器
- 📱 全響應式設計，適用於桌面和移動裝置
- ⚡ 分批載入功能，支援高效能瀏覽大量圖片
- 💾 一鍵下載原始圖片
- 🔍 點擊查看全尺寸圖片與詳細資訊

## 安裝與使用

### 方法一：使用 Deno Deploy (推薦)

最簡單的方式是訪問我們預先部署的版本：

[CloseAI Image Gallery](https://closai-image-galary.deno.dev/)

### 方法二：本地運行

1. 安裝 [Deno](https://deno.land/manual/getting_started/installation)
2. 克隆此儲存庫
   ```
   git clone https://github.com/yourusername/closeai-image-galary.git
   cd closeai-image-galary
   ```
3. 執行應用程式
   ```
   deno run --allow-net main.ts
   ```
4. 在瀏覽器中訪問 `http://localhost:8000`

## 如何獲取 ChatGPT API Token

為了存取你的 ChatGPT 生成圖片，你需要提供你的 API Token。請按照以下步驟獲取：

1. 登入 [ChatGPT](https://chatgpt.com)
2. 開啟瀏覽器開發者工具 (F12 或右鍵 > 檢查)
3. 切換至「Network」(網路) 分頁
4. 重新整理頁面
5. 尋找任何對 ChatGPT API 的請求
6. 在請求標頭中找到「Authorization」
7. 複製這個 token（它以 "Bearer " 開頭）

## 技術架構

- **後端**: [Deno](https://deno.land/) - 現代的 JavaScript/TypeScript 運行時
- **前端**: 
  - HTML5, CSS3, JavaScript
  - [Tailwind CSS](https://tailwindcss.com/) - 用於快速 UI 開發的實用優先 CSS 框架
- **API 整合**: 
  - 使用 ChatGPT API 獲取圖片
  - 圖片代理以確保全球存取

## 注意事項

- API Token 僅存儲在你的瀏覽器本機儲存中，不會發送至我們的伺服器
- 本應用程式僅提供對你已生成圖片的存取，不會生成新圖片
- 圖片展示依賴於 ChatGPT 的 API，如 API 變更可能會影響功能

## 隱私與安全

- 所有的 API 請求都是從你的瀏覽器直接發送到 ChatGPT API
- 我們的伺服器僅作為圖片的代理，不儲存任何圖片內容或個人數據
- API Token 只在你的瀏覽器本地儲存，我們沒有存取權限

## 貢獻

歡迎提交 Pull Requests 或開 Issues 來改進此專案！

## 授權

MIT
