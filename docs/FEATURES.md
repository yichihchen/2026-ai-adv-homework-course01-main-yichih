# FEATURES.md

## 功能完成狀態總覽

| 功能區塊 | 狀態 |
|---------|------|
| 用戶認證 | 完成 |
| 商品瀏覽（前台） | 完成 |
| 購物車（訪客 + 會員） | 完成 |
| 訂單建立與查詢 | 完成 |
| 模擬付款 | 完成 |
| 後台商品管理 | 完成 |
| 後台訂單管理 | 完成 |
| OpenAPI 文件產生 | 完成 |
| 真實金流串接（ECPay） | ✅ 完成 |

---

## 用戶認證

### 行為描述

**註冊**（`POST /api/auth/register`）：接受 `email`、`password`、`name`。`email` 重複則回傳 `409 Conflict`。密碼以 `bcrypt`（saltOrRounds=10）雜湊後存入 `users.password_hash`，主鍵為 UUID v4。成功後直接回傳 JWT token（與登入一致的格式），使用者無需再手動登入。

**登入**（`POST /api/auth/login`）：接受 `email`、`password`。以 bcrypt 比對密碼，失敗統一回傳 `401`（不區分帳號不存在或密碼錯誤，避免帳號枚舉攻擊）。成功回傳 JWT token（有效期 7 天）與用戶基本資料。

**取得個人資料**（`GET /api/auth/profile`）：需 Bearer token。從 token payload 取得 `user.id`，查詢 DB 回傳最新的 `id`、`email`、`name`、`role`、`created_at`（不含密碼雜湊）。

### 端點規格

| 端點 | 方法 | 認證 | 必填 Body |
|------|------|------|----------|
| `/api/auth/register` | POST | 無 | `email`, `password`, `name` |
| `/api/auth/login` | POST | 無 | `email`, `password` |
| `/api/auth/profile` | GET | JWT | — |

### 錯誤碼

| 情境 | HTTP 狀態碼 | message |
|------|------------|---------|
| email 已被使用 | 409 | "Email already in use" |
| 帳號不存在或密碼錯誤 | 401 | "Invalid credentials" |
| token 無效或過期 | 401 | "Invalid or expired token" |
| 缺少 Authorization header | 401 | "No token provided" |

---

## 商品瀏覽（前台）

### 行為描述

**商品列表**（`GET /api/products`）：支援分頁查詢。`page` 預設 `1`，`limit` 預設 `10`（最大不限制）。回傳 `data`（商品陣列）與 `pagination`（`page`、`limit`、`total`、`totalPages`）。商品依 `created_at` 排序（DB 預設順序）。

**商品詳情**（`GET /api/products/:id`）：以 UUID 查詢單一商品，找不到回傳 `404`。回傳完整欄位含 `stock`（庫存數量可供前端顯示是否售完）。

### 端點規格

| 端點 | 方法 | 認證 | 查詢參數 |
|------|------|------|---------|
| `/api/products` | GET | 無 | `page`（預設 1）、`limit`（預設 10） |
| `/api/products/:id` | GET | 無 | — |

### 前台頁面行為

- **首頁**（`/`）：Vue app 掛載後呼叫 API 取得商品列表，渲染格子卡片，底部有分頁元件
- **商品詳情**（`/products/:id`）：EJS 將 `productId` 注入 JS，Vue 初始化時 fetch 商品資料

---

## 購物車（雙模式認證）

### 行為描述

購物車是本系統最複雜的功能，支援**訪客（Session）**與**已登入（JWT）**兩種模式。

**識別機制：**
- 訪客：前端首次訪問時在 `public/js/auth.js` 產生 UUID 並存入 `localStorage`（key: `session_id`），每次 API 請求帶入 `X-Session-Id` header
- 已登入：`Authorization: Bearer <token>`，JWT 驗證後優先使用

**加入購物車**（`POST /api/cart`）：接受 `productId`、`quantity`（選填，預設 1）。若購物車已有相同商品（相同 `product_id` 且相同識別符），**累加數量**而非新增項目。庫存不足（`quantity > product.stock`）回傳 `400`。

**更新數量**（`PATCH /api/cart/:itemId`）：接受 `quantity`（必填，需 > 0）。僅允許操作屬於自己購物車的項目（以 session 或 user_id 比對），否則 `404`。數量超出庫存回傳 `400`。

**刪除項目**（`DELETE /api/cart/:itemId`）：確認項目屬於自己，否則 `404`。

**取得購物車**（`GET /api/cart`）：JOIN `products` 取得商品最新名稱與圖片，但 `quantity` 以 `cart_items.quantity` 為準。

### 端點規格

| 端點 | 方法 | 認證 | Body / 說明 |
|------|------|------|------------|
| `/api/cart` | GET | JWT 或 Session | 取得購物車列表（含商品資料） |
| `/api/cart` | POST | JWT 或 Session | `productId`（必填）、`quantity`（選填，預設 1） |
| `/api/cart/:itemId` | PATCH | JWT 或 Session | `quantity`（必填，> 0） |
| `/api/cart/:itemId` | DELETE | JWT 或 Session | — |

### 錯誤碼

| 情境 | 狀態碼 | message |
|------|--------|---------|
| 未帶 JWT 也未帶 Session ID | 401 | "Authentication required" |
| 商品不存在 | 404 | "Product not found" |
| 庫存不足 | 400 | "Insufficient stock" |
| 購物車項目不屬於此用戶/Session | 404 | "Cart item not found" |

---

## 訂單建立與查詢

### 行為描述

**建立訂單**（`POST /api/orders`）：需 JWT 認證。接受 `recipientName`、`recipientEmail`、`recipientAddress`。

**業務邏輯（DB Transaction）：**
1. 讀取目前用戶的購物車（以 `user_id` 查詢）
2. 購物車為空則回傳 `400`
3. **在 Transaction 中**：
   a. 逐一確認每個商品庫存充足（不足則 rollback 並 `400`）
   b. 建立 `orders` 記錄（含訂單編號、收件資訊、`total_amount`）
   c. 建立 `order_items` 快照記錄（快照 `product_name`、`product_price`）
   d. 批次扣減 `products.stock`
   e. 刪除用戶購物車所有項目
4. 回傳訂單完整資料

**訂單編號格式：** `ORD-{timestamp}-{4位隨機字串}` 例如 `ORD-1715000000000-A3F9`

**金額計算：** `total_amount = SUM(product.price * quantity)`，單位為整數（分），前端顯示時除以 100。

**取得訂單列表**（`GET /api/orders`）：僅回傳當前用戶的訂單，依 `created_at` DESC 排序，不分頁。

**取得訂單詳情**（`GET /api/orders/:id`）：確認訂單屬於當前用戶（`orders.user_id === req.user.id`），JOIN `order_items` 回傳完整項目列表。

### 端點規格

| 端點 | 方法 | 認證 | 必填 Body |
|------|------|------|----------|
| `/api/orders` | POST | JWT | `recipientName`, `recipientEmail`, `recipientAddress` |
| `/api/orders` | GET | JWT | — |
| `/api/orders/:id` | GET | JWT | — |
| `/api/orders/:id/pay` | PATCH | JWT | — |

### 錯誤碼

| 情境 | 狀態碼 | message |
|------|--------|---------|
| 購物車為空 | 400 | "Cart is empty" |
| 庫存不足（transaction 中） | 400 | "Insufficient stock for {productName}" |
| 訂單不屬於此用戶 | 404 | "Order not found" |

---

## 模擬付款

### 行為描述

`PATCH /api/orders/:id/pay`：需 JWT，訂單需屬於當前用戶且狀態為 `pending`。

**付款流程：**
1. 驗證訂單存在且屬於當前用戶
2. 驗證狀態為 `pending`（否則 `400 Order already processed`）
3. 以 `Math.random() < 0.7` 決定成功（70%）或失敗（30%）
4. 更新 `orders.status` 為 `paid` 或 `failed`
5. 回傳更新後的訂單資料

**注意**：失敗的訂單狀態為 `failed`，不自動恢復庫存（現版本行為）。

---

## 後台商品管理

### 行為描述

所有後台 API 需 `authMiddleware` + `adminMiddleware`（role=admin），否則分別回傳 `401`/`403`。

**商品列表**（`GET /api/admin/products`）：支援分頁（`page`、`limit`），回傳格式同前台，但含 `stock` 資料（前台列表亦含 stock，管理後台著重庫存管理）。

**建立商品**（`POST /api/admin/products`）：必填 `name`、`price`（整數，分）；選填 `description`、`stock`（預設 0）、`image_url`。`price` 必須 > 0。

**更新商品**（`PUT /api/admin/products/:id`）：接受部分更新（`name`、`price`、`description`、`stock`、`image_url`）。自動更新 `updated_at = datetime('now')`。

**刪除商品**（`DELETE /api/admin/products/:id`）：直接刪除，**不檢查是否有訂單引用**（`order_items` 已快照商品名稱與價格，不影響歷史訂單）。

### 端點規格

| 端點 | 方法 | 認證 | Body / 說明 |
|------|------|------|------------|
| `/api/admin/products` | GET | JWT + admin | `page`（預設 1）、`limit`（預設 10） |
| `/api/admin/products` | POST | JWT + admin | `name`（必填）、`price`（必填）、`description`、`stock`、`image_url` |
| `/api/admin/products/:id` | PUT | JWT + admin | 任意欄位（部分更新） |
| `/api/admin/products/:id` | DELETE | JWT + admin | — |

---

## 後台訂單管理

### 行為描述

**訂單列表**（`GET /api/admin/orders`）：回傳**所有用戶**的訂單（與前台 `/api/orders` 不同，前台只回傳自己的）。支援 `status` 查詢參數過濾（`pending`/`paid`/`failed`），不帶則回傳全部。依 `created_at` DESC 排序，不分頁。

**訂單詳情**（`GET /api/admin/orders/:id`）：回傳訂單完整資訊，**額外 JOIN `users` 表**，回傳 `user.email` 與 `user.name`（前台詳情不含此資訊）。

### 端點規格

| 端點 | 方法 | 認證 | 查詢參數 |
|------|------|------|---------|
| `/api/admin/orders` | GET | JWT + admin | `status`（選填，`pending`/`paid`/`failed`） |
| `/api/admin/orders/:id` | GET | JWT + admin | — |

---

## 真實金流串接（ECPay 綠界）

### 行為描述

透過綠界科技 AIO 金流（All-In-One Checkout）介接信用卡付款，完整實作「建立付款」、「接收結果回呼」、「主動查詢」三個流程。

**前往付款**（`POST /api/payments/ecpay/checkout/:orderId`）：需 JWT，訂單需屬於當前用戶且狀態為 `pending`。後端以 `src/lib/ecpay.js` 組出 AIO 表單參數（含 `CheckMacValue`），回傳 `actionUrl` 與 `fields`。前端收到後動態建立 `<form>`、填入隱藏欄位，並以 `form.submit()` 導向綠界付款頁面。

**瀏覽器付款結果回呼**（`POST /api/payments/ecpay/result`）：綠界於用戶付款後將瀏覽器以 POST 導向此端點（`OrderResultURL`）。後端驗證 `CheckMacValue`，再主動呼叫綠界 `QueryTradeInfo` API 確認交易狀態，依結果更新 `orders.status`，最後以 302 重新導向至 `/orders/:id?payment=<success|failed|pending>`。

**主動查詢付款狀態**（`POST /api/payments/ecpay/query/:orderId`）：需 JWT。前端在訂單詳情頁點「重新查詢付款狀態」時觸發，後端向綠界查詢後更新訂單，回傳最新訂單資料。適用於付款後瀏覽器未正確導回、或需要手動確認狀態的情境。

**Server Notify 接收**（`POST /api/payments/ecpay/notify`）：綠界後端 server-to-server 通知端點（`ReturnURL`）。本機開發時綠界無法呼叫到此端點，故僅回傳 `1|OK` 符合綠界規格。

**MerchantTradeNo 轉換：** 訂單編號 `ORD-1715000000000-A3F9` → 去除 `-` → `ORD1715000000000A3F9`（綠界限制長度 ≤ 20 字元、不含特殊字元）。

**CheckMacValue 計算：** 依綠界規格，參數按 Key 字母排序後以 URL encode（PHP 規則）組成字串，前後加 `HashKey=...&...&HashIV=...`，SHA256 雜湊後轉大寫；驗證時以 `crypto.timingSafeEqual` 防止 timing attack。

**環境切換：** `ECPAY_ENV=staging`（預設）使用測試環境，`ECPAY_ENV=production` 切換正式環境。

### 訂單狀態轉換

| 綠界 `TradeStatus` | 轉換後 `orders.status` |
|-------------------|-----------------------|
| `1`（付款成功） | `paid` |
| `0`（尚未付款） | 維持 `pending` |
| `10200095`（付款失敗） | `failed` |
| 其他非 `0`/`1` 值 | `failed` |

### 端點規格

| 端點 | 方法 | 認證 | 說明 |
|------|------|------|------|
| `/api/payments/ecpay/checkout/:orderId` | POST | JWT | 產生 AIO 表單參數，前端 submit 到綠界 |
| `/api/payments/ecpay/result` | POST | 無（綠界呼叫） | 瀏覽器付款結果回呼，驗簽後主動查詢，302 重新導向 |
| `/api/payments/ecpay/query/:orderId` | POST | JWT | 主動向綠界查詢付款狀態並更新訂單 |
| `/api/payments/ecpay/notify` | POST | 無（綠界呼叫） | Server Notify 接收，僅回傳 `1\|OK` |

### 錯誤碼

| 情境 | 狀態碼 | error |
|------|--------|-------|
| 訂單不存在或不屬於此用戶 | 404 | `NOT_FOUND` |
| 訂單狀態不是 `pending` | 400 | `INVALID_STATUS` |
| CheckMacValue 驗證失敗 | 400 | — |
| 向綠界查詢失敗（network/HTTP error） | 502 | `ECPAY_QUERY_FAILED` |

### 環境變數

| 變數 | 預設值（測試用） | 說明 |
|------|--------------|------|
| `ECPAY_ENV` | `staging` | `staging` 或 `production` |
| `ECPAY_MERCHANT_ID` | `3002607` | 綠界特店編號 |
| `ECPAY_HASH_KEY` | `pwFHCqoQZGmho4w6` | CheckMacValue 用 HashKey |
| `ECPAY_HASH_IV` | `EkRm7iFT261dpevs` | CheckMacValue 用 HashIV |
| `BASE_URL` | `http://localhost:3001` | 回呼 URL 基底（ReturnURL / OrderResultURL） |

---

## OpenAPI 文件產生

執行 `npm run openapi` 呼叫 `generate-openapi.js`，掃描 `src/routes/*.js` 中的 JSDoc `@swagger` 註解，輸出 `openapi.json` 至專案根目錄。

Swagger UI 可透過任何 OpenAPI 工具（如 Swagger Editor、Redoc）載入 `openapi.json` 預覽。本專案未內建 Swagger UI serve endpoint。
