# CLAUDE.md

## 專案概述

花卉電商平台（Hex School 2026 AI Adv Homework Course01） — Node.js + Express + SQLite3 + Vue 3 + EJS + Tailwind CSS

全端電商應用，包含前台購物流程（商品瀏覽、購物車、結帳、訂單查詢）與後台管理（商品 CRUD、訂單檢視），支援訪客（session）與會員（JWT）雙模式購物車。

## 常用指令

```bash
# 安裝依賴
npm install

# 開發模式（僅啟動 server，需先手動 build CSS）
npm run dev:server

# CSS 監聽模式（另開終端機）
npm run dev:css

# 一鍵 build CSS + 啟動 server（生產用）
npm start

# 僅 build 壓縮 CSS
npm run css:build

# 產生 OpenAPI spec（輸出 openapi.json）
npm run openapi

# 執行測試
npm test
```

## 關鍵規則

- **JWT_SECRET 為必填**：server.js 啟動時若未設定 `JWT_SECRET` 環境變數，伺服器拒絕啟動
- **購物車雙模式**：未登入用 `X-Session-Id` header（UUID）存取購物車，登入後 JWT 優先；購物車路由同時支援兩者
- **金額單位為整數（分）**：`products.price`、`orders.total_amount`、`order_items.product_price` 皆為 INTEGER，前端以 `(price / 100).toFixed(2)` 轉換顯示
- **訂單建立為 DB transaction**：建立訂單時同時扣庫存，失敗自動 rollback，庫存不足回傳 400
- **功能開發使用 docs/plans/ 記錄計畫；完成後移至 docs/plans/archive/**

## 詳細文件

- [./docs/README.md](./docs/README.md) — 項目介紹與快速開始
- [./docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — 架構、目錄結構、資料流
- [./docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md) — 開發規範、命名規則
- [./docs/FEATURES.md](./docs/FEATURES.md) — 功能列表與完成狀態
- [./docs/TESTING.md](./docs/TESTING.md) — 測試規範與指南
- [./docs/CHANGELOG.md](./docs/CHANGELOG.md) — 更新日誌
