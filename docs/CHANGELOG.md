# CHANGELOG.md

版本記錄遵循 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.0.0/) 格式。

---

## [1.0.0] - 2026-05-11

### 新增

**後端 API**
- `POST /api/auth/register` — 用戶註冊（bcrypt 密碼雜湊、JWT 回傳）
- `POST /api/auth/login` — 用戶登入
- `GET /api/auth/profile` — 取得登入用戶資料
- `GET /api/products` — 商品列表（分頁）
- `GET /api/products/:id` — 商品詳情
- `GET|POST /api/cart` — 購物車操作（雙模式：JWT + Session）
- `PATCH|DELETE /api/cart/:itemId` — 購物車項目更新/刪除
- `POST /api/orders` — 建立訂單（DB transaction，含庫存扣減）
- `GET /api/orders` — 用戶訂單列表
- `GET /api/orders/:id` — 訂單詳情
- `PATCH /api/orders/:id/pay` — 模擬付款（70% 成功率）
- `GET|POST /api/admin/products` — 後台商品列表與建立
- `PUT|DELETE /api/admin/products/:id` — 後台商品更新/刪除
- `GET /api/admin/orders` — 後台所有訂單列表（支援 status 篩選）
- `GET /api/admin/orders/:id` — 後台訂單詳情（含用戶資訊）

**前台頁面**
- 首頁商品格子 + 分頁（Vue 3）
- 商品詳情頁（加入購物車）
- 購物車頁面（數量調整、刪除）
- 結帳頁面（收件人表單）
- 登入/註冊頁面（tabbed）
- 訂單列表頁面
- 訂單詳情頁面（模擬付款）

**後台頁面**
- 商品管理（CRUD、分頁）
- 訂單管理（列表、狀態篩選、詳情 Modal）

**基礎設施**
- SQLite3（better-sqlite3，WAL 模式）資料庫
- JWT 認證 + bcrypt 密碼雜湊
- 訪客 Session（`X-Session-Id` header）
- EJS 模板引擎（SSR）
- Tailwind CSS 自定義色系
- OpenAPI 3.0.3 文件（`npm run openapi`）
- Vitest + supertest 測試套件（6 個測試檔）
- Seed data：管理員帳號 + 8 款花卉商品
