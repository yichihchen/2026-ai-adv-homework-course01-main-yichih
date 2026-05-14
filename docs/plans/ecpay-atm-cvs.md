# ECPay ATM/CVS 付款方式擴充計畫

**日期**：2026-05-14  
**狀態**：完成（2026-05-14）

## 目標

在現有 ECPay AIO 信用卡串接基礎上，新增 **ATM 轉帳** 和 **超商代碼繳費** 兩種付款方式。

## 現狀分析

- `src/lib/ecpay.js`：`buildAioFormParams` hardcode `ChoosePayment: 'Credit'`，只支援信用卡
- `src/routes/paymentRoutes.js`：有 checkout / result / query / notify 四個端點，缺少 PaymentInfoURL 端點
- DB `orders` 表已有 payment_method / ecpay_trade_no / ecpay_payment_type / paid_at / payment_raw，缺乏 ATM 虛擬帳號 / CVS 繳費代碼欄位
- 前端訂單頁只有信用卡付款按鈕，未支援付款方式選擇

## ECPay ATM/CVS 流程說明

ATM 與超商代碼為**非同步付款**，與信用卡的差異：

| 流程點 | 信用卡 | ATM/CVS |
|--------|--------|---------|
| 建立付款 | 導向綠界付款頁 | 同左 |
| 取號通知 | 無（即時付款） | ECPay 呼叫 `PaymentInfoURL`（RtnCode=2 或 10100073） |
| 付款完成通知 | ECPay 呼叫 `ReturnURL`（RtnCode=1） | 消費者繳費後，ECPay 呼叫 `ReturnURL`（RtnCode=1） |

ATM 新增參數：`ExpireDate=7`（繳費期限天數），`PaymentInfoURL`  
CVS 新增參數：`StoreExpireDate=4320`（繳費期限分鐘，= 3 天），`PaymentInfoURL`

## 變更清單

### Step 1 — DB Migration (`src/database.js`)
- [ ] 在 `migrateOrdersAddPaymentColumns` 新增 4 欄：
  - `payment_info_bank_code TEXT`（ATM 銀行代碼）
  - `payment_info_vaccount TEXT`（ATM 虛擬帳號）
  - `payment_info_payment_no TEXT`（CVS 繳費代碼）
  - `payment_info_expire_date TEXT`（ATM/CVS 繳費期限）

### Step 2 — ECPay 工具模組 (`src/lib/ecpay.js`)
- [ ] `buildAioFormParams(order, items, overrides)` 新增 `paymentMethod` 參數（預設 `'Credit'`）
- [ ] ATM：加入 `ChoosePayment: 'ATM'`, `ExpireDate: 7`, `PaymentInfoURL`
- [ ] CVS：加入 `ChoosePayment: 'CVS'`, `StoreExpireDate: 4320`, `PaymentInfoURL`
- [ ] 移除 hardcode 的 `ChoosePayment: 'Credit'`

### Step 3 — 付款路由 (`src/routes/paymentRoutes.js`)
- [ ] `POST /checkout/:orderId`：從 body 讀取 `paymentMethod`（預設 `'Credit'`），傳入 `buildAioFormParams`
- [ ] 新增 `POST /payment-info`：
  - 驗證 CheckMacValue
  - 解析 ATM (`BankCode` / `vAccount`) 或 CVS (`PaymentNo`) 資料
  - 儲存至 orders 表新欄位
  - 回應 `1|OK`

### Step 4 — 訂單 API (`src/routes/orderRoutes.js`)
- [ ] 確認 `GET /orders/:id` 回傳新的 payment_info_* 欄位

### Step 5 — 前端訂單詳情頁 (`public/views/order-detail.ejs` 或 Vue 組件)
- [ ] 付款區塊加入付款方式選擇（信用卡 / ATM / 超商代碼）
- [ ] pending 狀態時，若有 ATM 虛擬帳號 → 顯示銀行代碼、帳號、繳費期限
- [ ] pending 狀態時，若有 CVS 代碼 → 顯示繳費代碼、期限
- [ ] `?payment=pending` 說明文字依付款方式調整

### Step 6 — 測試 (`tests/payments.test.js`)
- [ ] ATM checkout 端點（驗證回傳含 ATM 參數）
- [ ] CVS checkout 端點
- [ ] `/payment-info` callback 端點（ATM 取號 / CVS 取號）

## 注意事項

- `PaymentInfoURL` callback RtnCode 為字串：ATM = `'2'`、CVS = `'10100073'`，不是錯誤
- 必須回應 `1|OK`（純文字、HTTP 200），否則 ECPay 最多重送 4 次
- 訂單的 `status` 在取號後仍保持 `pending`，等待消費者繳費後 ReturnURL 才更新為 `paid`
- `PaymentInfoURL` 與 `ReturnURL` 必須可公開訪問（本機開發需 ngrok）
