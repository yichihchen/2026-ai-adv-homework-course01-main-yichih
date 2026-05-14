'use strict';

const crypto = require('crypto');

const ENDPOINTS = {
  staging: {
    aio: 'https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5',
    query: 'https://payment-stage.ecpay.com.tw/Cashier/QueryTradeInfo/V5',
  },
  production: {
    aio: 'https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5',
    query: 'https://payment.ecpay.com.tw/Cashier/QueryTradeInfo/V5',
  },
};

function getConfig() {
  const env = (process.env.ECPAY_ENV || 'staging').toLowerCase();
  const endpoints = ENDPOINTS[env] || ENDPOINTS.staging;
  return {
    merchantId: process.env.ECPAY_MERCHANT_ID || '3002607',
    hashKey: process.env.ECPAY_HASH_KEY || 'pwFHCqoQZGmho4w6',
    hashIV: process.env.ECPAY_HASH_IV || 'EkRm7iFT261dpevs',
    baseUrl: process.env.BASE_URL || 'http://localhost:3001',
    env,
    aioUrl: endpoints.aio,
    queryUrl: endpoints.query,
  };
}

function phpUrlencode(s) {
  return encodeURIComponent(String(s))
    .replace(/!/g, '%21')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/\*/g, '%2A')
    .replace(/%20/g, '+');
}

function ecpayUrlEncode(s) {
  let encoded = phpUrlencode(s).replace(/~/g, '%7E').toLowerCase();
  const netReplacements = [
    ['%2d', '-'],
    ['%5f', '_'],
    ['%2e', '.'],
    ['%21', '!'],
    ['%2a', '*'],
    ['%28', '('],
    ['%29', ')'],
  ];
  for (const [from, to] of netReplacements) {
    encoded = encoded.split(from).join(to);
  }
  return encoded;
}

function generateCheckMacValue(params, hashKey, hashIV, method = 'SHA256') {
  const filtered = Object.fromEntries(
    Object.entries(params).filter(([k]) => k !== 'CheckMacValue')
  );
  const keys = Object.keys(filtered).sort((a, b) => {
    const la = a.toLowerCase();
    const lb = b.toLowerCase();
    if (la < lb) return -1;
    if (la > lb) return 1;
    return 0;
  });
  const parts = keys.map((k) => `${k}=${filtered[k]}`);
  const raw = `HashKey=${hashKey}&${parts.join('&')}&HashIV=${hashIV}`;
  const encoded = ecpayUrlEncode(raw);
  const algo = method.toUpperCase() === 'MD5' ? 'md5' : 'sha256';
  return crypto.createHash(algo).update(encoded, 'utf8').digest('hex').toUpperCase();
}

function verifyCheckMacValue(params, hashKey, hashIV, method = 'SHA256') {
  const received = params.CheckMacValue;
  if (!received || typeof received !== 'string') return false;
  const expected = generateCheckMacValue(params, hashKey, hashIV, method);
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(received.toUpperCase(), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function formatTradeDate(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const taipei = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const ymd = `${taipei.getUTCFullYear()}/${pad(taipei.getUTCMonth() + 1)}/${pad(taipei.getUTCDate())}`;
  const hms = `${pad(taipei.getUTCHours())}:${pad(taipei.getUTCMinutes())}:${pad(taipei.getUTCSeconds())}`;
  return `${ymd} ${hms}`;
}

function orderNoToMerchantTradeNo(orderNo) {
  return orderNo.replace(/-/g, '');
}

function buildItemName(items) {
  const joined = items
    .map((it) => `${it.product_name} x${it.quantity}`)
    .join('#')
    .replace(/[\r\n]+/g, ' ');
  return joined.length > 200 ? joined.slice(0, 197) + '...' : joined;
}

function buildAioFormParams(order, items, overrides = {}, paymentMethod = 'Credit') {
  const cfg = getConfig();
  const merchantTradeNo = orderNoToMerchantTradeNo(order.order_no);
  const validMethods = ['Credit', 'ATM', 'CVS'];
  const method = validMethods.includes(paymentMethod) ? paymentMethod : 'Credit';

  const params = {
    MerchantID: cfg.merchantId,
    MerchantTradeNo: merchantTradeNo,
    MerchantTradeDate: overrides.MerchantTradeDate || formatTradeDate(),
    PaymentType: 'aio',
    TotalAmount: String(order.total_amount),
    TradeDesc: overrides.TradeDesc || '花卉電商訂單付款',
    ItemName: buildItemName(items),
    ReturnURL: `${cfg.baseUrl}/api/payments/ecpay/notify`,
    ClientBackURL: `${cfg.baseUrl}/orders/${order.id}`,
    ChoosePayment: method,
    EncryptType: '1',
  };

  if (method === 'Credit') {
    params.OrderResultURL = `${cfg.baseUrl}/api/payments/ecpay/result`;
  } else if (method === 'ATM') {
    params.ExpireDate = overrides.ExpireDate || '7';
    params.PaymentInfoURL = `${cfg.baseUrl}/api/payments/ecpay/payment-info`;
  } else if (method === 'CVS') {
    params.StoreExpireDate = overrides.StoreExpireDate || '4320';
    params.PaymentInfoURL = `${cfg.baseUrl}/api/payments/ecpay/payment-info`;
  }

  params.CheckMacValue = generateCheckMacValue(params, cfg.hashKey, cfg.hashIV);
  return { actionUrl: cfg.aioUrl, fields: params };
}

async function queryTradeInfo(merchantTradeNo) {
  const cfg = getConfig();
  const params = {
    MerchantID: cfg.merchantId,
    MerchantTradeNo: merchantTradeNo,
    TimeStamp: String(Math.floor(Date.now() / 1000)),
    PlatformID: '',
  };
  params.CheckMacValue = generateCheckMacValue(params, cfg.hashKey, cfg.hashIV);

  const body = new URLSearchParams(params).toString();
  const res = await fetch(cfg.queryUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    throw new Error(`ECPay QueryTradeInfo HTTP ${res.status}`);
  }
  const text = await res.text();
  const parsed = Object.fromEntries(new URLSearchParams(text));
  return parsed;
}

module.exports = {
  ENDPOINTS,
  getConfig,
  phpUrlencode,
  ecpayUrlEncode,
  generateCheckMacValue,
  verifyCheckMacValue,
  formatTradeDate,
  orderNoToMerchantTradeNo,
  buildItemName,
  buildAioFormParams,
  queryTradeInfo,
};
