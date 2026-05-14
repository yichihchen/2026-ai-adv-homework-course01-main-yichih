const express = require('express');
const db = require('../database');
const authMiddleware = require('../middleware/authMiddleware');
const ecpay = require('../lib/ecpay');

const router = express.Router();

function getOrderWithItems(orderId, userId) {
  let order;
  if (userId) {
    order = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(orderId, userId);
  } else {
    order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  }
  if (!order) return null;
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
  return { ...order, items };
}

function applyQueryResult(order, queryResp) {
  const tradeStatus = queryResp.TradeStatus;
  const paymentTypeFromEcpay = queryResp.PaymentType || null;
  const tradeNo = queryResp.TradeNo || null;
  const paymentDate = queryResp.PaymentDate || null;
  const raw = JSON.stringify(queryResp);

  let newStatus = order.status;
  let resolved = 'pending';

  if (tradeStatus === '1') {
    newStatus = 'paid';
    resolved = 'success';
  } else if (tradeStatus === '0') {
    newStatus = order.status === 'paid' ? 'paid' : 'pending';
    resolved = 'pending';
  } else if (tradeStatus === '10200095') {
    newStatus = 'failed';
    resolved = 'failed';
  } else if (tradeStatus !== undefined && tradeStatus !== '1' && tradeStatus !== '0') {
    newStatus = 'failed';
    resolved = 'failed';
  }

  db.prepare(
    `UPDATE orders
     SET status = ?,
         ecpay_trade_no = COALESCE(?, ecpay_trade_no),
         ecpay_payment_type = COALESCE(?, ecpay_payment_type),
         paid_at = CASE WHEN ? = 'paid' AND paid_at IS NULL THEN ? ELSE paid_at END,
         payment_method = COALESCE(payment_method, 'ecpay'),
         payment_raw = ?
     WHERE id = ?`
  ).run(
    newStatus,
    tradeNo,
    paymentTypeFromEcpay,
    newStatus,
    paymentDate,
    raw,
    order.id
  );

  return { newStatus, resolved };
}

/**
 * @openapi
 * /api/payments/ecpay/checkout/{orderId}:
 *   post:
 *     summary: 產生 ECPay AIO 表單參數（前端用此參數動態建立 form 並 submit 到綠界）
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 成功
 */
router.post('/checkout/:orderId', authMiddleware, (req, res) => {
  const order = getOrderWithItems(req.params.orderId, req.user.userId);
  if (!order) {
    return res.status(404).json({ data: null, error: 'NOT_FOUND', message: '訂單不存在' });
  }
  if (order.status !== 'pending') {
    return res.status(400).json({
      data: null,
      error: 'INVALID_STATUS',
      message: '訂單狀態不是 pending，無法付款',
    });
  }

  const paymentMethod = req.body.paymentMethod || 'Credit';
  const { actionUrl, fields } = ecpay.buildAioFormParams(order, order.items, {}, paymentMethod);
  res.json({
    data: { actionUrl, fields },
    error: null,
    message: '成功',
  });
});

/**
 * @openapi
 * /api/payments/ecpay/result:
 *   post:
 *     summary: 接收綠界 OrderResultURL 回傳（瀏覽器轉送），驗 CheckMacValue 並主動 Query 確認
 *     tags: [Payments]
 *     responses:
 *       302:
 *         description: 重新導向至 /orders/:id?payment=...
 */
router.post('/result', async (req, res) => {
  const cfg = ecpay.getConfig();
  const body = req.body || {};

  if (!ecpay.verifyCheckMacValue(body, cfg.hashKey, cfg.hashIV)) {
    console.warn('[ECPay] /result CheckMacValue verification failed', {
      MerchantTradeNo: body.MerchantTradeNo,
    });
    return res.status(400).send('CheckMacValue invalid');
  }

  const merchantTradeNo = body.MerchantTradeNo;
  if (!merchantTradeNo) {
    return res.status(400).send('Missing MerchantTradeNo');
  }

  const order = db
    .prepare("SELECT * FROM orders WHERE REPLACE(order_no, '-', '') = ?")
    .get(merchantTradeNo);
  if (!order) {
    console.warn('[ECPay] /result order not found for', merchantTradeNo);
    return res.status(404).send('Order not found');
  }

  let queryResp;
  try {
    queryResp = await ecpay.queryTradeInfo(merchantTradeNo);
  } catch (err) {
    console.error('[ECPay] queryTradeInfo failed', err);
    return res.redirect(302, `/orders/${order.id}?payment=failed`);
  }

  const { resolved } = applyQueryResult(order, queryResp);
  const payment =
    resolved === 'success' ? 'success' : resolved === 'failed' ? 'failed' : 'pending';
  res.redirect(302, `/orders/${order.id}?payment=${payment}`);
});

/**
 * @openapi
 * /api/payments/ecpay/query/{orderId}:
 *   post:
 *     summary: 手動向綠界查詢付款狀態並更新訂單
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 成功
 */
router.post('/query/:orderId', authMiddleware, async (req, res) => {
  const order = getOrderWithItems(req.params.orderId, req.user.userId);
  if (!order) {
    return res.status(404).json({ data: null, error: 'NOT_FOUND', message: '訂單不存在' });
  }

  const merchantTradeNo = ecpay.orderNoToMerchantTradeNo(order.order_no);

  let queryResp;
  try {
    queryResp = await ecpay.queryTradeInfo(merchantTradeNo);
  } catch (err) {
    return res.status(502).json({
      data: null,
      error: 'ECPAY_QUERY_FAILED',
      message: '查詢綠界訂單失敗',
    });
  }

  applyQueryResult(order, queryResp);
  const updated = getOrderWithItems(order.id, req.user.userId);

  res.json({
    data: updated,
    error: null,
    message: '查詢完成',
  });
});

/**
 * @openapi
 * /api/payments/ecpay/payment-info:
 *   post:
 *     summary: 接收 ECPay ATM/CVS 取號結果通知（PaymentInfoURL）
 *     tags: [Payments]
 *     responses:
 *       200:
 *         description: 回傳 1|OK
 */
router.post('/payment-info', (req, res) => {
  const cfg = ecpay.getConfig();
  const body = req.body || {};

  if (!ecpay.verifyCheckMacValue(body, cfg.hashKey, cfg.hashIV)) {
    console.warn('[ECPay] /payment-info CheckMacValue verification failed', {
      MerchantTradeNo: body.MerchantTradeNo,
    });
    return res.type('text/plain').send('1|OK');
  }

  const merchantTradeNo = body.MerchantTradeNo;
  if (!merchantTradeNo) {
    return res.type('text/plain').send('1|OK');
  }

  const order = db
    .prepare("SELECT * FROM orders WHERE REPLACE(order_no, '-', '') = ?")
    .get(merchantTradeNo);
  if (!order) {
    console.warn('[ECPay] /payment-info order not found for', merchantTradeNo);
    return res.type('text/plain').send('1|OK');
  }

  const rtnCode = String(body.RtnCode || '');

  if (rtnCode === '2') {
    // ATM 取號成功
    db.prepare(
      `UPDATE orders SET
         payment_method = COALESCE(payment_method, 'ecpay_atm'),
         payment_info_bank_code = ?,
         payment_info_vaccount = ?,
         payment_info_expire_date = ?
       WHERE id = ?`
    ).run(body.BankCode || null, body.vAccount || null, body.ExpireDate || null, order.id);
    console.log('[ECPay] ATM 取號成功 訂單=', merchantTradeNo, 'BankCode=', body.BankCode, 'vAccount=', body.vAccount);
  } else if (rtnCode === '10100073') {
    // CVS 取號成功
    db.prepare(
      `UPDATE orders SET
         payment_method = COALESCE(payment_method, 'ecpay_cvs'),
         payment_info_payment_no = ?,
         payment_info_expire_date = ?
       WHERE id = ?`
    ).run(body.PaymentNo || null, body.ExpireDate || null, order.id);
    console.log('[ECPay] CVS 取號成功 訂單=', merchantTradeNo, 'PaymentNo=', body.PaymentNo);
  }

  res.type('text/plain').send('1|OK');
});

/**
 * @openapi
 * /api/payments/ecpay/notify:
 *   post:
 *     summary: 綠界 Server Notify 接收端點（本地端不會被呼叫，僅作為合法 ReturnURL 必填）
 *     tags: [Payments]
 *     responses:
 *       200:
 *         description: 回傳 1|OK
 */
router.post('/notify', (req, res) => {
  res.type('text/plain').send('1|OK');
});

module.exports = router;
