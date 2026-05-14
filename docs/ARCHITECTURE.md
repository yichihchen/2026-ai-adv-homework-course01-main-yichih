# ARCHITECTURE.md

## 系統架構概覽

```
Browser
  │
  ├── GET /*, /products/:id, /cart, ...   → Express SSR (EJS templates)
  │                                          └── 頁面嵌入 Vue 3 app（CDN）
  │
  └── XHR/Fetch /api/*                   → Express REST API
                                            ├── authMiddleware（JWT 驗證）
                                            ├── adminMiddleware（角色驗證）
                                            ├── sessionMiddleware（Session ID 提取）
                                            └── 路由 handlers → better-sqlite3 → SQLite DB
```

## 目錄結構（每個檔案用途）

```
.
├── app.js                    # Express app 初始化：掛載 middleware、路由、錯誤處理
├── server.js                 # HTTP server 入口：驗證 JWT_SECRET、監聽 PORT
├── swagger-config.js         # swagger-jsdoc 設定，定義 OpenAPI 3.0.3 基本資訊與安全方案
├── generate-openapi.js       # 執行 swagger-jsdoc 並輸出 openapi.json 至磁碟
├── vitest.config.js          # Vitest 設定：globals、測試執行順序
├── package.json
├── .env.example              # 環境變數範本
│
├── src/
│   ├── database.js           # DB 連線（WAL mode）、建表 DDL、seed data 插入
│   ├── middleware/
│   │   ├── authMiddleware.js    # 解析 Bearer token → req.user（{id, email, role}）
│   │   ├── adminMiddleware.js   # 驗證 req.user.role === 'admin'，否則 403
│   │   ├── sessionMiddleware.js # 從 X-Session-Id header 提取 → req.sessionId
│   │   └── errorHandler.js     # 全域錯誤處理：NODE_ENV=production 時隱藏錯誤細節
│   ├── lib/
│   │   └── ecpay.js             # ECPay 工具函式：CheckMacValue、AIO 表單、QueryTradeInfo
│   └── routes/
│       ├── authRoutes.js        # POST /register、POST /login、GET /profile
│       ├── productRoutes.js     # GET /products、GET /products/:id
│       ├── cartRoutes.js        # GET/POST /cart、PATCH/DELETE /cart/:itemId（雙模式認證）
│       ├── orderRoutes.js       # POST/GET /orders、GET/PATCH /orders/:id/pay
│       ├── adminProductRoutes.js # Admin CRUD /admin/products
│       ├── adminOrderRoutes.js   # Admin 訂單查詢 /admin/orders
│       ├── paymentRoutes.js     # ECPay 金流：checkout、result、query、notify
│       └── pageRoutes.js        # SSR 頁面路由，渲染 EJS templates
│
├── public/
│   ├── css/
│   │   ├── input.css         # Tailwind CSS 入口（@import "tailwindcss"）
│   │   └── output.css        # 編譯後的 CSS（gitignored，由 npm run css:build 產生）
│   ├── js/
│   │   ├── auth.js           # 前端認證管理：localStorage token/user 讀寫、session ID 管理
│   │   ├── api.js            # Fetch 封裝：自動注入 Authorization/X-Session-Id header
│   │   ├── notification.js   # Toast 通知系統（success/error/warning）
│   │   ├── header-init.js    # 導航列初始化：登入狀態切換、登出按鈕
│   │   └── pages/
│   │       ├── index.js           # 首頁 Vue app：商品格子 + 分頁
│   │       ├── product-detail.js  # 商品詳情 Vue app：加入購物車
│   │       ├── cart.js            # 購物車 Vue app：數量調整、刪除
│   │       ├── checkout.js        # 結帳 Vue app：收件人表單 + 建立訂單
│   │       ├── login.js           # 登入/註冊 Vue app（tabbed）
│   │       ├── orders.js          # 訂單列表 Vue app
│   │       ├── order-detail.js    # 訂單詳情 Vue app：ECPay 付款、查詢狀態、模擬付款（debug）
│   │       ├── admin-products.js  # 管理後台商品 CRUD Vue app
│   │       └── admin-orders.js    # 管理後台訂單列表 + 詳情 Modal
│   └── stylesheets/
│       └── style.css         # 補充樣式（非 Tailwind）
│
├── views/
│   ├── layouts/
│   │   ├── front.ejs         # 前台 layout（head + header + slot + footer）
│   │   └── admin.ejs         # 後台 layout（admin-header + admin-sidebar + slot）
│   ├── partials/
│   │   ├── head.ejs          # <head> 標籤、CSS 引用、Vue CDN
│   │   ├── header.ejs        # 前台導覽列（購物車圖示、登入/登出）
│   │   ├── footer.ejs        # 前台頁尾
│   │   ├── notification.ejs  # Toast 通知容器 HTML
│   │   ├── admin-header.ejs  # 後台頂部導覽
│   │   └── admin-sidebar.ejs # 後台側邊選單
│   └── pages/
│       ├── index.ejs          # 首頁（商品格子）
│       ├── product-detail.ejs # 商品詳情
│       ├── cart.ejs           # 購物車
│       ├── checkout.ejs       # 結帳
│       ├── login.ejs          # 登入/註冊
│       ├── orders.ejs         # 訂單列表
│       ├── order-detail.ejs   # 訂單詳情
│       ├── 404.ejs            # 404 頁面
│       └── admin/
│           ├── products.ejs   # 後台商品管理
│           └── orders.ejs     # 後台訂單管理
│
└── tests/
    ├── setup.js               # 共用工具：createTestApp()、createUser()、getAuthToken()
    ├── auth.test.js
    ├── products.test.js
    ├── cart.test.js
    ├── orders.test.js
    ├── adminProducts.test.js
    ├── adminOrders.test.js
    └── payments.test.js       # ECPay 金流端點測試
```

## 啟動流程

```
1. server.js
   ├── 檢查 process.env.JWT_SECRET → 未設定則 throw Error，process.exit(1)
   ├── import app.js
   └── app.listen(PORT || 3001)

2. app.js
   ├── express.json() + express.urlencoded()
   ├── cors({ origin: FRONTEND_URL })
   ├── express.static('public')
   ├── sessionMiddleware（全域，提取 X-Session-Id）
   ├── 掛載 API 路由（/api/auth、/api/products、/api/cart、/api/orders、/api/payments/ecpay、/api/admin/*）
   ├── 掛載頁面路由（pageRoutes）
   ├── 404 handler
   └── errorHandler（全域錯誤處理）

3. database.js（被各 route 直接 import）
   ├── new Database('database.sqlite', { verbose: ... })
   ├── PRAGMA journal_mode = WAL
   ├── CREATE TABLE IF NOT EXISTS（users, products, cart_items, orders, order_items）
   ├── migrateOrdersAddPaymentColumns()（ALTER TABLE 新增 ECPay 欄位，冪等）
   └── Seed data：admin 帳號 + 8 款花卉商品（僅在 users 表為空時插入）
```

## API 路由總覽

| 方法 | 路徑 | 認證 | 說明 |
|------|------|------|------|
| POST | `/api/auth/register` | 無 | 註冊新用戶 |
| POST | `/api/auth/login` | 無 | 登入，回傳 JWT token |
| GET | `/api/auth/profile` | JWT | 取得目前用戶資料 |
| GET | `/api/products` | 無 | 商品列表（分頁） |
| GET | `/api/products/:id` | 無 | 商品詳情 |
| GET | `/api/cart` | JWT 或 Session | 取得購物車項目 |
| POST | `/api/cart` | JWT 或 Session | 加入購物車（已存在則累加數量） |
| PATCH | `/api/cart/:itemId` | JWT 或 Session | 更新購物車項目數量 |
| DELETE | `/api/cart/:itemId` | JWT 或 Session | 刪除購物車項目 |
| POST | `/api/orders` | JWT | 從購物車建立訂單（DB transaction） |
| GET | `/api/orders` | JWT | 取得用戶訂單列表 |
| GET | `/api/orders/:id` | JWT | 取得訂單詳情 |
| PATCH | `/api/orders/:id/pay` | JWT | 模擬付款（隨機成功/失敗，debug 用） |
| POST | `/api/payments/ecpay/checkout/:orderId` | JWT | 產生 ECPay AIO 表單參數 |
| POST | `/api/payments/ecpay/result` | 無（綠界回呼） | 瀏覽器付款結果回呼，驗簽後主動查詢，302 重新導向 |
| POST | `/api/payments/ecpay/query/:orderId` | JWT | 主動向綠界查詢付款狀態並更新訂單 |
| POST | `/api/payments/ecpay/notify` | 無（綠界回呼） | Server Notify 接收，回傳 `1\|OK` |
| GET | `/api/admin/products` | JWT + admin | 管理後台商品列表 |
| POST | `/api/admin/products` | JWT + admin | 建立商品 |
| PUT | `/api/admin/products/:id` | JWT + admin | 更新商品 |
| DELETE | `/api/admin/products/:id` | JWT + admin | 刪除商品 |
| GET | `/api/admin/orders` | JWT + admin | 所有訂單列表（可依 status 篩選） |
| GET | `/api/admin/orders/:id` | JWT + admin | 訂單詳情（含用戶資訊） |

## 統一回應格式

所有 API 回應皆遵循以下格式：

**成功（2xx）**

```json
{
  "status": "success",
  "data": { ... }
}
```

**成功列表（含分頁）**

```json
{
  "status": "success",
  "data": [ ... ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 42,
    "totalPages": 5
  }
}
```

**錯誤（4xx / 5xx）**

```json
{
  "status": "error",
  "message": "描述錯誤原因的字串"
}
```

## 認證與授權機制

### JWT 認證流程

1. 客戶端 `POST /api/auth/login` 取得 token
2. 後續請求在 `Authorization` header 帶入 `Bearer <token>`
3. `authMiddleware.js` 解析 token → 寫入 `req.user = { id, email, role }`
4. `adminMiddleware.js` 檢查 `req.user.role === 'admin'`，否則回傳 `403 Forbidden`

**JWT 參數：**
- 演算法：HS256（預設）
- Payload：`{ id, email, role }`
- 有效期：`7d`（7 天）
- Secret：`process.env.JWT_SECRET`（必填，未設定則拒絕啟動）

### 訪客 Session 認證流程（購物車專用）

1. 前端在 `auth.js` 中首次訪問時產生 UUID 存入 `localStorage`（key: `session_id`）
2. 每次購物車 API 請求帶入 `X-Session-Id: <uuid>` header
3. `sessionMiddleware.js` 提取 → 寫入 `req.sessionId`
4. 購物車路由優先檢查 JWT（`req.user`），其次使用 `req.sessionId`

**雙模式優先級：**
```
req.user（JWT 解析成功）> req.sessionId（X-Session-Id header）
```

若兩者皆不存在，購物車路由回傳 `401 Unauthorized`。

## 資料庫 Schema

資料庫檔案：`database.sqlite`（SQLite WAL 模式）

### users 表

| 欄位 | 型別 | 約束 | 說明 |
|------|------|------|------|
| id | TEXT | PRIMARY KEY | UUID v4 |
| email | TEXT | UNIQUE NOT NULL | 登入用電子郵件 |
| password_hash | TEXT | NOT NULL | bcrypt 雜湊值 |
| name | TEXT | NOT NULL | 顯示名稱 |
| role | TEXT | DEFAULT 'user', CHECK IN ('user','admin') | 用戶角色 |
| created_at | TEXT | DEFAULT datetime('now') | 建立時間（ISO 8601） |

### products 表

| 欄位 | 型別 | 約束 | 說明 |
|------|------|------|------|
| id | TEXT | PRIMARY KEY | UUID v4 |
| name | TEXT | NOT NULL | 商品名稱 |
| description | TEXT | — | 商品描述 |
| price | INTEGER | NOT NULL, CHECK > 0 | 售價（整數，分為單位） |
| stock | INTEGER | DEFAULT 0, CHECK >= 0 | 庫存數量 |
| image_url | TEXT | — | 商品圖片 URL |
| created_at | TEXT | DEFAULT datetime('now') | 建立時間 |
| updated_at | TEXT | DEFAULT datetime('now') | 最後更新時間 |

### cart_items 表

| 欄位 | 型別 | 約束 | 說明 |
|------|------|------|------|
| id | TEXT | PRIMARY KEY | UUID v4 |
| session_id | TEXT | — | 訪客 session ID（與 user_id 擇一） |
| user_id | TEXT | — | 已登入用戶 ID（與 session_id 擇一） |
| product_id | TEXT | NOT NULL, FK → products.id | 商品 ID |
| quantity | INTEGER | DEFAULT 1, CHECK > 0 | 數量 |

### orders 表

| 欄位 | 型別 | 約束 | 說明 |
|------|------|------|------|
| id | TEXT | PRIMARY KEY | UUID v4 |
| order_no | TEXT | UNIQUE NOT NULL | 訂單編號（格式：ORD-timestamp-random） |
| user_id | TEXT | NOT NULL, FK → users.id | 下單用戶 |
| recipient_name | TEXT | NOT NULL | 收件人姓名 |
| recipient_email | TEXT | NOT NULL | 收件人 Email |
| recipient_address | TEXT | NOT NULL | 收件地址 |
| total_amount | INTEGER | NOT NULL | 訂單總金額（整數，分為單位） |
| status | TEXT | DEFAULT 'pending', CHECK IN ('pending','paid','failed') | 付款狀態 |
| payment_method | TEXT | — | 付款方式（例如 `ecpay`） |
| ecpay_trade_no | TEXT | — | 綠界交易編號（`TradeNo`） |
| ecpay_payment_type | TEXT | — | 綠界付款類型（`PaymentType`，例如 `Credit_CreditCard`） |
| paid_at | TEXT | — | 付款時間（綠界回傳之 `PaymentDate`） |
| payment_raw | TEXT | — | 綠界查詢回應 JSON 原始資料 |
| created_at | TEXT | DEFAULT datetime('now') | 建立時間 |

### order_items 表

| 欄位 | 型別 | 約束 | 說明 |
|------|------|------|------|
| id | TEXT | PRIMARY KEY | UUID v4 |
| order_id | TEXT | NOT NULL, FK → orders.id | 所屬訂單 |
| product_id | TEXT | NOT NULL, FK → products.id | 商品 ID（快照） |
| product_name | TEXT | NOT NULL | 商品名稱快照（避免商品改名後訂單資料異動） |
| product_price | INTEGER | NOT NULL | 下單時售價快照 |
| quantity | INTEGER | NOT NULL | 購買數量 |

## 金流整合說明

本專案同時支援**模擬付款**（開發測試用）與**綠界科技 ECPay AIO 金流**（真實付款）。

### 模擬付款（debug）

`PATCH /api/orders/:id/pay`：驗證訂單後以 `Math.random() < 0.7` 決定成功或失敗，直接更新 `orders.status`，不經過任何第三方金流。

### ECPay 真實金流

實作於 `src/lib/ecpay.js`（工具函式）與 `src/routes/paymentRoutes.js`（路由）。

**付款流程：**
1. 前端呼叫 `POST /api/payments/ecpay/checkout/:orderId`，後端回傳 AIO 表單參數（含 `CheckMacValue`）
2. 前端動態建立 `<form>` 並 submit 到綠界付款頁面（`actionUrl`）
3. 用戶完成付款後，綠界將瀏覽器 POST 到 `OrderResultURL`（`/api/payments/ecpay/result`）
4. 後端驗證 `CheckMacValue`，再主動呼叫 `QueryTradeInfo` 確認交易，更新訂單後 302 重新導向
5. 前端可在訂單詳情頁點「重新查詢付款狀態」，呼叫 `POST /api/payments/ecpay/query/:orderId` 手動確認

**環境切換：** `ECPAY_ENV=staging`（預設，使用綠界測試環境），`ECPAY_ENV=production` 切換正式環境。
