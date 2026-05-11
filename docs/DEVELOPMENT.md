# DEVELOPMENT.md

## 環境設定

### 環境變數表

複製 `.env.example` 為 `.env` 並填寫以下變數：

| 變數 | 用途 | 必要性 | 預設值 |
|------|------|--------|--------|
| `JWT_SECRET` | JWT 簽名密鑰 | **必填**（未設定則 server 拒絕啟動） | 無 |
| `PORT` | HTTP server 監聽埠 | 選填 | `3001` |
| `BASE_URL` | Server 基礎 URL（Swagger / 金流回調用） | 選填 | `http://localhost:3001` |
| `FRONTEND_URL` | 前端 URL（CORS 白名單） | 選填 | `http://localhost:5173` |
| `ADMIN_EMAIL` | Seed data 管理員 Email | 選填 | `admin@hexschool.com` |
| `ADMIN_PASSWORD` | Seed data 管理員密碼 | 選填 | `12345678` |
| `ECPAY_MERCHANT_ID` | 綠界金流商店代號 | 選填（未實作） | — |
| `ECPAY_HASH_KEY` | 綠界金流 Hash Key | 選填（未實作） | — |
| `ECPAY_HASH_IV` | 綠界金流 Hash IV | 選填（未實作） | — |
| `ECPAY_ENV` | 綠界環境（staging/production） | 選填（未實作） | — |
| `NODE_ENV` | 執行環境 | 選填 | — |

**注意**：測試環境（`NODE_ENV=test`）下 `database.js` 使用記憶體資料庫（`:memory:`），不影響實際 DB 檔案。

## 模組系統說明

本專案後端使用 **CommonJS（`require`/`module.exports`）**，前端頁面 JS 使用瀏覽器原生 ES 模組（`<script type="module">`）。

- 後端所有 `src/` 及 `app.js`/`server.js` 均使用 `require()`
- 前端 `public/js/pages/*.js` 使用 `import`（type="module"）
- 前端 `public/js/auth.js`、`api.js`、`notification.js` 以 `<script>` 標籤載入（全域變數）

## 命名規則對照表

### 後端

| 類型 | 規則 | 範例 |
|------|------|------|
| 路由檔案 | `camelCase` + `Routes` 後綴 | `authRoutes.js`、`adminProductRoutes.js` |
| Middleware 檔案 | `camelCase` + `Middleware` 後綴 | `authMiddleware.js` |
| 路由處理函式（Router） | `express.Router()` 直接定義，無額外命名 | — |
| 資料庫欄位 | `snake_case` | `user_id`、`order_no`、`created_at` |
| SQL 查詢結果變數 | `camelCase` | `const product = db.prepare(...).get(id)` |
| UUID 產生 | `uuidv4()` from `uuid` | `const id = uuidv4()` |

### 前端

| 類型 | 規則 | 範例 |
|------|------|------|
| 頁面 JS 檔案 | `kebab-case` | `product-detail.js`、`admin-orders.js` |
| Vue app 資料屬性 | `camelCase` | `cartItems`、`totalAmount` |
| API 呼叫函式 | `api(method, path, body)` 全域函式 | `api('GET', '/api/products')` |
| CSS class | Tailwind utility class | `text-rose-500 bg-white` |

### 資料庫

- 表名：`snake_case` 複數（`users`、`cart_items`、`order_items`）
- 欄位名：`snake_case`
- Primary Key：`id TEXT PRIMARY KEY`（UUID v4 字串）
- 外鍵：`{參照表單數}_id` 格式（`user_id`、`product_id`、`order_id`）

## 新增 API 路由步驟

1. **建立或選擇路由檔案**：`src/routes/<featureName>Routes.js`
2. **實作路由**：

```javascript
const express = require('express');
const router = express.Router();
const db = require('../database');
const authMiddleware = require('../middleware/authMiddleware');

/**
 * @swagger
 * /api/feature:
 *   get:
 *     summary: 功能說明
 *     tags: [Feature]
 *     responses:
 *       200:
 *         description: 成功
 */
router.get('/', authMiddleware, (req, res, next) => {
  try {
    const data = db.prepare('SELECT * FROM table').all();
    res.json({ status: 'success', data });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
```

3. **掛載至 app.js**：

```javascript
const featureRoutes = require('./src/routes/featureRoutes');
app.use('/api/feature', featureRoutes);
```

4. **加入 swagger-config.js 的 `apis` 陣列**（如需更新 OpenAPI 文件）

**重要原則**：
- 所有 DB 操作包在 `try/catch` 中，以 `next(error)` 傳遞錯誤
- 需要認證的路由在 handler 之前加入 `authMiddleware`
- 需要管理員權限的路由同時加入 `authMiddleware, adminMiddleware`

## 新增 Middleware 步驟

1. 建立 `src/middleware/<name>Middleware.js`
2. 實作並 `module.exports` 函式：

```javascript
module.exports = (req, res, next) => {
  // 驗證邏輯
  if (!valid) {
    return res.status(401).json({ status: 'error', message: '描述' });
  }
  // 寫入 req 資料
  req.customData = value;
  next();
};
```

3. 在需要的路由中引入並使用

## 新增資料庫表格步驟

1. 開啟 `src/database.js`
2. 在 `CREATE TABLE IF NOT EXISTS` 區塊末尾新增建表語句
3. 欄位遵循命名規則（`snake_case`，主鍵用 UUID TEXT）
4. 若需要 seed data，在 `// Seed data` 區塊加入（需加判斷避免重複插入）
5. 測試環境自動使用 `:memory:` 資料庫，無需特別處理

## JSDoc / Swagger 格式說明

本專案使用 swagger-jsdoc 從路由檔案的 JSDoc 自動產生 OpenAPI 3.0.3 規格。

**基本路由 JSDoc 格式：**

```javascript
/**
 * @swagger
 * /api/resource/{id}:
 *   get:
 *     summary: 取得資源詳情
 *     description: 詳細說明（可選）
 *     tags: [Resource]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 資源 UUID
 *     responses:
 *       200:
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   $ref: '#/components/schemas/Resource'
 *       404:
 *         description: 找不到資源
 */
```

**需要認證的路由**加上 `security: [{ bearerAuth: [] }]`（對應 swagger-config.js 中定義的 `bearerAuth` security scheme）。

執行 `npm run openapi` 後會輸出 `openapi.json`。

## 計畫歸檔流程

### 撰寫新計畫

1. 在 `docs/plans/` 建立計畫文件，命名格式：`YYYY-MM-DD-<feature-name>.md`
2. 文件結構：

```markdown
# 計畫：<功能名稱>

## User Story
身為 <角色>，我希望 <功能>，以便 <目的>。

## Spec
- 詳細規格說明

## Tasks
- [ ] 任務 1
- [ ] 任務 2
- [ ] 更新 FEATURES.md
- [ ] 更新 CHANGELOG.md
```

### 功能完成後

1. 確認所有 Tasks 已完成
2. 將計畫文件移至 `docs/plans/archive/`
3. 更新 `docs/FEATURES.md`（標記功能狀態為完成、更新行為描述）
4. 更新 `docs/CHANGELOG.md`（新增版本記錄）
