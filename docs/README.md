# 花卉電商平台

六角學院 2026 AI 進階課程作業 — 全端電商應用，以花卉商品為主題，涵蓋完整的前台購物流程與後台管理界面。

## 技術棧

| 層級 | 技術 |
|------|------|
| 後端框架 | Node.js + Express.js ~4.16.1 |
| 資料庫 | SQLite3（better-sqlite3 ^12.8.0，WAL 模式） |
| 認證 | JWT（jsonwebtoken ^9.0.2，7 天有效期） |
| 密碼雜湊 | bcrypt ^6.0.0 |
| View Engine | EJS ^5.0.1（SSR 頁面渲染） |
| 前端框架 | Vue.js 3（CDN 載入） |
| CSS 框架 | Tailwind CSS ^4.2.2（自定義色系） |
| API 文件 | Swagger / OpenAPI 3.0.3（swagger-jsdoc ^6.2.8） |
| 測試框架 | Vitest ^2.1.9 + supertest ^7.2.2 |
| 其他 | cors ^2.8.5、uuid ^11.1.0 |

## 快速開始

**前置需求**：Node.js 18+

```bash
# 1. 複製專案
git clone <repo-url>
cd 2026-ai-adv-homework-course01-main

# 2. 安裝依賴
npm install

# 3. 設定環境變數
cp .env.example .env
# 編輯 .env，至少設定 JWT_SECRET（必填）

# 4. 啟動（會自動 build CSS + 啟動 server）
npm start
```

瀏覽器開啟 `http://localhost:3001`

**預設管理員帳號**（由 seed data 自動建立）：
- Email：`admin@hexschool.com`
- Password：`12345678`

## 常用指令表

| 指令 | 說明 |
|------|------|
| `npm start` | Build CSS + 啟動 server（生產用） |
| `npm run dev:server` | 僅啟動 server（開發用，需另開 CSS watch） |
| `npm run dev:css` | CSS 監聽模式（需另開終端機） |
| `npm run css:build` | 一次性壓縮 build CSS |
| `npm run openapi` | 產生 `openapi.json` API 規格文件 |
| `npm test` | 執行所有測試 |

## 文件索引

| 文件 | 說明 |
|------|------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 架構、目錄結構、API 路由表、DB schema、認證機制 |
| [DEVELOPMENT.md](./DEVELOPMENT.md) | 開發規範、命名規則、新增模組步驟、環境變數表 |
| [FEATURES.md](./FEATURES.md) | 功能清單、行為描述、業務邏輯說明 |
| [TESTING.md](./TESTING.md) | 測試規範、執行方式、撰寫測試指南 |
| [CHANGELOG.md](./CHANGELOG.md) | 版本更新日誌 |

## 主要功能

- **前台購物**：商品列表（分頁）、商品詳情、購物車（訪客 + 會員）、結帳、訂單查詢
- **付款模擬**：訂單建立後可觸發模擬付款（成功/失敗）
- **後台管理**：商品 CRUD、訂單列表（依狀態篩選）、訂單詳情
- **雙模式認證**：JWT（已登入用戶）或 Session ID（訪客，透過 `X-Session-Id` header）
