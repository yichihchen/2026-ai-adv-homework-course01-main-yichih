# TESTING.md

## 測試框架與設定

- **測試執行器**：Vitest ^2.1.9（`vitest.config.js`）
- **HTTP 測試**：supertest ^7.2.2
- **模式**：Globals 啟用（`describe`、`it`、`expect`、`beforeAll` 等無需 import）
- **執行方式**：`npm test`（執行 `vitest run`，非 watch 模式）

## 測試檔案表

| 檔案 | 測試對象 | 測試數量（約） |
|------|---------|--------------|
| `tests/setup.js` | 共用工具（非測試案例） | — |
| `tests/auth.test.js` | `POST /api/auth/register`、`POST /api/auth/login`、`GET /api/auth/profile` | 9 |
| `tests/products.test.js` | `GET /api/products`、`GET /api/products/:id` | 6 |
| `tests/cart.test.js` | 購物車全部端點（訪客 + 會員兩種模式） | 12 |
| `tests/orders.test.js` | `POST /api/orders`、`GET /api/orders`、`GET /api/orders/:id`、`PATCH /api/orders/:id/pay` | 10 |
| `tests/adminProducts.test.js` | Admin 商品 CRUD | 10 |
| `tests/adminOrders.test.js` | Admin 訂單列表 + 詳情 | 6 |

## 執行順序與依賴關係

`vitest.config.js` 明確指定測試檔執行順序（`sequence.files`）：

```
1. auth.test.js
2. products.test.js
3. cart.test.js
4. orders.test.js
5. adminProducts.test.js
6. adminOrders.test.js
```

**各測試檔案彼此獨立**（每個測試檔都透過 `createTestApp()` 建立獨立的 in-memory DB），不存在跨檔案依賴。

同一檔案內，`orders.test.js` 的「建立訂單」測試依賴先在 `beforeAll` 中建立購物車項目；`adminOrders.test.js` 依賴先在 `beforeAll` 中建立訂單。此為 **同檔案內的 beforeAll 依賴**，非跨檔案。

## 共用工具（`tests/setup.js`）

| 函式 | 說明 |
|------|------|
| `createTestApp()` | 建立獨立的 Express app 實例，使用 **in-memory SQLite**（`:memory:`），自動執行 schema 建立與 seed data。回傳 `{ app, db }` |
| `createUser(app, overrides)` | 以 `POST /api/auth/register` 建立測試用戶。`email` 預設 `test-{Date.now()}@example.com`（避免衝突）。回傳 `{ user, token }` |
| `getAuthToken(app, credentials)` | 以 `POST /api/auth/login` 取得 token，回傳 token 字串 |

**關鍵細節**：
- `createTestApp()` 每次呼叫建立全新 DB，測試間**不共享狀態**
- `createUser` 使用 `Date.now()` 確保 email 唯一，**不可在同一毫秒內平行呼叫多次**
- Seed data（管理員帳號 + 8 款商品）在每個 `createTestApp()` 中自動插入

## 撰寫新測試的步驟

1. **建立測試檔**：`tests/<featureName>.test.js`

2. **基本結構**：

```javascript
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createTestApp, createUser } from './setup.js';

describe('Feature Name', () => {
  let app;
  let token;
  let adminToken;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;

    // 建立一般用戶
    const { token: userToken } = await createUser(app);
    token = userToken;

    // 取得管理員 token（使用 seed data 的管理員帳號）
    const adminRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@hexschool.com', password: '12345678' });
    adminToken = adminRes.body.data.token;
  });

  it('should return success', async () => {
    const res = await request(app)
      .get('/api/feature')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
  });
});
```

3. **在 `vitest.config.js` 中加入執行順序**（`sequence.files` 陣列末尾）

4. **訪客購物車測試模式**：

```javascript
// 產生 Session ID
const sessionId = 'test-session-' + Date.now();

const res = await request(app)
  .get('/api/cart')
  .set('X-Session-Id', sessionId);
```

## 常見陷阱

**陷阱 1：忘記 await createTestApp()**

`createTestApp()` 是非同步函式（因為初始化 DB 可能非同步），務必 `await`。

**陷阱 2：管理員 token 的取得方式**

管理員帳號由 `seed data` 建立（email: `admin@hexschool.com`，password: `12345678`），不能用 `createUser()` 建立管理員（`createUser` 建立的是 `role='user'`）。需手動呼叫 login API。

**陷阱 3：購物車測試需帶識別符**

購物車 API 需帶 `Authorization: Bearer token` **或** `X-Session-Id`，兩者皆不帶會回傳 `401`。

**陷阱 4：訂單測試需先有購物車**

建立訂單前，必須在 `beforeAll` 中先 `POST /api/cart` 加入商品，否則 `POST /api/orders` 回傳 `400 Cart is empty`。

**陷阱 5：金額單位**

商品 `price` 為整數（分），seed data 中的商品 `price` 值為 `50000`（即 500.00 元），測試時注意斷言值。

**陷阱 6：`Date.now()` 的 email 唯一性**

在同一測試檔內快速連續呼叫 `createUser()` 可能產生相同 `Date.now()` 值（毫秒級衝突）。若需多個測試用戶，可傳入 `overrides: { email: 'specific@example.com' }` 指定唯一 email。

## Hook Timeout

`vitest.config.js` 設定 `hookTimeout: 10000`（10 秒），`beforeAll` 中若有大量 DB 操作或 API 呼叫，請確保在此時限內完成。
